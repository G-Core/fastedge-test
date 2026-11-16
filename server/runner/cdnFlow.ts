/**
 * The CDN (proxy-wasm) request flow, shared by a single app and a resource.
 *
 * onRequestHeaders → onRequestBody → origin → onResponseHeaders → onResponseBody, each hook run
 * by whichever runner `host.runnerFor(hook)` names (a single app names itself for every hook; a
 * resource names the app its config gives that hook, or none). As on the edge:
 * - every hook gets a fresh instance (the runner does this), so memory never carries over;
 * - headers, bodies and properties are the request's, passed from hook to hook;
 * - custom properties written in onRequestBody or later are readable by later hooks, whichever
 *   app runs them; those written in onRequestHeaders are not (nginx does not keep them);
 * - a hook without an app passes the request through unchanged.
 */
import { checkEgressAllowed } from "./egressPolicy.js";
import { HeaderManager } from "./HeaderManager";
import type { IStateManager } from "./IStateManager.js";
import type { FullFlowResult, HeaderRecord, HookCall, HookResult, LocalResponse } from "./types";

/** Canonical URL substituted for the "built-in" shorthand so all downstream
 *  code (URL parsing, pseudo-header derivation, property extraction) works
 *  with a valid URL instead of a bare keyword. */
export const BUILTIN_URL = "http://fastedge-builtin.debug";
export const BUILTIN_SHORTHAND = "built-in";

export const CDN_HOOKS = ["onRequestHeaders", "onRequestBody", "onResponseHeaders", "onResponseBody"] as const;
export type CdnHook = (typeof CDN_HOOKS)[number];

export interface FlowHookRunner {
  callHook(call: HookCall): Promise<HookResult>;
}

export interface CdnFlowHost {
  /** The runner for this hook, or undefined when no app handles it. */
  runnerFor(hook: CdnHook): FlowHookRunner | undefined;
  /** Called once with the target URL before any hook runs. */
  start(url: string): void;
  /** The URL-derived request.* properties, for the result. */
  calculatedProperties(): Record<string, unknown>;
  log(message: string): void;
  events?: IStateManager | null;
  /** The request headers to report in request_started (without the context's own). */
  ownHeaders?<T>(headers: Record<string, T>): Record<string, T>;
}

export function isBuiltInUrl(url: string): boolean {
  return url === BUILTIN_SHORTHAND
    || url === BUILTIN_URL
    || url.startsWith(BUILTIN_URL + "?")
    || url.startsWith(BUILTIN_URL + "/");
}

/**
 * Run one request through the CDN hooks. `call` carries the client request (headers, body,
 * method), the starting properties and `requestId` when the runners are not the one driving it.
 */
export async function runCdnFlow(host: CdnFlowHost, call: HookCall, url: string): Promise<FullFlowResult> {
  // Allow query params on built-in URL (e.g. http://fastedge-builtin.debug?key=value)
  const isBuiltIn = isBuiltInUrl(url);
  let targetUrl = url;
  if (targetUrl === BUILTIN_SHORTHAND) {
    targetUrl = BUILTIN_URL;
    host.log(`Substituted "${BUILTIN_SHORTHAND}" → ${BUILTIN_URL}`);
  }

  const results: Record<string, HookResult> = {};

  host.start(targetUrl);
  host.log(`Extracted runtime properties from URL: ${targetUrl}`);

  // Auto-inject Host header from URL if not already present
  // This matches browser behavior where Host is automatically set
  const hasHost = Object.keys(call.request.headers ?? {}).some(
    (key) => key.toLowerCase() === "host",
  );
  if (!hasHost) {
    const urlObj = new URL(targetUrl);
    const hostValue =
      urlObj.port && urlObj.port !== "80" && urlObj.port !== "443"
        ? `${urlObj.hostname}:${urlObj.port}`
        : urlObj.hostname;
    call.request.headers = call.request.headers ?? {};
    call.request.headers["host"] = hostValue;
    host.log(`Auto-injected Host header: ${hostValue}`);
  }

  const headers = call.request.headers || {};
  host.events?.emitRequestStarted(targetUrl, call.request.method ?? "GET", host.ownHeaders?.(headers) ?? headers, "system");

  // The request's state as it moves from hook to hook.
  let requestHeaders: HeaderRecord = call.request.headers;
  let requestBody = call.request.body;
  let properties = call.properties;
  let customProperties = call.customProperties ?? [];
  // Response headers added in the request phase (add_http_response_header) carry into the response phase.
  let requestPhaseResponseHeaders: HeaderRecord = {};

  const runHook = async (hook: CdnHook, hookCall: HookCall): Promise<HookResult | undefined> => {
    const runner = host.runnerFor(hook);
    if (!runner) return undefined;
    const result = await runner.callHook({ ...hookCall, hook, customProperties });
    results[hook] = result;
    host.events?.emitHookExecuted(hook, result.returnCode, result.logs.length, result.input, result.output, "system");
    properties = result.properties;
    customProperties = result.customProperties ?? customProperties;
    return result;
  };

  // A hook that answered with send_http_response ends the flow.
  const localResponse = (result: HookResult | undefined): FullFlowResult | undefined => {
    if (result?.returnCode !== 1 || !result.localResponse) return undefined;
    return { hookResults: results, finalResponse: finalLocalResponse(result.localResponse, result.output.response.headers), calculatedProperties: host.calculatedProperties() };
  };

  // Phase 1: Run request hooks
  for (const hook of ["onRequestHeaders", "onRequestBody"] as const) {
    const result = await runHook(hook, { ...call, request: { ...call.request, headers: requestHeaders, body: requestBody }, properties });
    const local = localResponse(result);
    if (local) return local;
    if (result) {
      requestHeaders = result.output.request.headers;
      requestBody = result.output.request.body;
      // onRequestBody's output is the host's cumulative state (already includes onRequestHeaders'
      // mutations) for one app; across apps each hook's output already starts from the last one.
      requestPhaseResponseHeaders = { ...requestPhaseResponseHeaders, ...(result.output.response.headers ?? {}) };
      host.log(`Headers after ${hook}: ${JSON.stringify(requestHeaders)}`);
    }
  }

  const modifiedRequestHeaders = requestHeaders;
  const modifiedRequestBody = requestBody;
  const propertiesAfterRequestBody = properties;
  const requestMethod = call.request.method ?? "GET";

  try {
    // Phase 2: Obtain origin response (built-in responder or real HTTP fetch)
    const origin = isBuiltIn
      ? builtInResponse(host, requestMethod, modifiedRequestHeaders, modifiedRequestBody, propertiesAfterRequestBody)
      : await fetchOrigin(host, targetUrl, requestMethod, modifiedRequestHeaders, modifiedRequestBody, propertiesAfterRequestBody);

    // Merge response-header state set during request phase into the response-phase input.
    // Production: response headers added via add_http_response_header during onRequestHeaders /
    // onRequestBody are carried into the response phase alongside (not silently overwritten
    // by) the origin's headers. Append-merge so that names present on both sides surface as
    // string[] — mirroring how Envoy represents cross-phase add_http_response_header colliding
    // with the upstream response.
    let responseHeaders = HeaderManager.appendMerge(requestPhaseResponseHeaders, origin.headers);
    let responseBody = origin.body;

    // Phase 3: Run response hooks with real response data
    // Custom properties from onRequestHeaders do not reach the response hooks.
    for (const hook of ["onResponseHeaders", "onResponseBody"] as const) {
      const result = await runHook(hook, {
        ...call,
        request: { ...call.request, headers: modifiedRequestHeaders, body: modifiedRequestBody },
        response: { headers: responseHeaders, body: responseBody, status: origin.status, statusText: origin.statusText },
        properties,
      });
      const local = localResponse(result);
      if (local) return local;
      if (result) {
        responseHeaders = result.output.response.headers;
        // onResponseBody gets the origin's body: only its own output is final.
        if (hook === "onResponseBody") responseBody = result.output.response.body;
        host.log(`Headers after ${hook}: ${JSON.stringify(responseHeaders)}`);
      }
    }

    host.log(`Final response body length: ${responseBody.length}`);
    // Derive contentType from final headers (WASM may have changed it during response hooks)
    const finalContentType = HeaderManager.firstValue(responseHeaders["content-type"]) || origin.contentType;
    return {
      hookResults: results,
      finalResponse: {
        status: origin.status,
        statusText: origin.statusText,
        headers: responseHeaders,
        body: responseBody,
        contentType: finalContentType,
        isBase64: origin.isBase64,
      },
      calculatedProperties: host.calculatedProperties(),
    };
  } catch (error) {
    // Extract detailed error information
    let errorMessage = "Fetch failed";
    let errorDetails = "";

    if (error instanceof Error) {
      errorMessage = error.message;
      if ((error as any).cause) {
        errorDetails = ` (cause: ${String((error as any).cause)})`;
      }
    } else {
      errorMessage = String(error);
    }

    const fullErrorMessage = `Failed to fetch ${requestMethod} ${targetUrl}: ${errorMessage}${errorDetails}`;
    host.log(fullErrorMessage);

    // The last request state the hooks produced
    const lastRequestState = { headers: modifiedRequestHeaders, body: modifiedRequestBody };

    // Return error in response hooks
    const errorResult: HookResult = {
      returnCode: null,
      logs: [{ level: 4, message: fullErrorMessage }],
      input: { request: lastRequestState, response: { headers: {}, body: "" } },
      output: { request: lastRequestState, response: { headers: {}, body: "" } },
      properties: call.properties,
    };
    results.onResponseHeaders = errorResult;
    results.onResponseBody = errorResult;

    return {
      hookResults: results,
      finalResponse: {
        status: 0,
        statusText: "Fetch Failed",
        headers: {},
        body: fullErrorMessage,
        contentType: "text/plain",
      },
      calculatedProperties: host.calculatedProperties(),
    };
  }
}

type OriginResponse = {
  status: number;
  statusText: string;
  headers: HeaderRecord;
  body: string;
  contentType: string;
  isBase64: boolean;
};

/**
 * Built-in responder: generate response locally without a network fetch.
 * Control headers (stripped before building the response):
 *   x-debugger-status  — HTTP status code (default 200)
 *   x-debugger-content — "body-only" | "status-only" (default: full JSON echo)
 */
function builtInResponse(
  host: CdnFlowHost,
  requestMethod: string,
  requestHeaders: HeaderRecord,
  requestBody: string,
  properties: Record<string, unknown>,
): OriginResponse {
  host.log("Using built-in responder");

  let status: number;
  const rawStatus = (HeaderManager.firstValue(requestHeaders["x-debugger-status"]) || "").trim();
  if (rawStatus === "") {
    status = 200;
  } else {
    const parsed = parseInt(rawStatus, 10);
    status = Number.isFinite(parsed) && parsed >= 100 && parsed <= 599 ? parsed : 400;
    if (status === 400 && rawStatus !== "400") {
      host.log(`Invalid x-debugger-status "${rawStatus}", defaulting to 400`);
    }
  }
  const statusText = status === 200 ? "OK" : String(status);
  const contentMode = HeaderManager.firstValue(requestHeaders["x-debugger-content"]) || "";

  // Strip debugger control headers so they don't leak into the echo or response hooks
  delete requestHeaders["x-debugger-status"];
  delete requestHeaders["x-debugger-content"];

  let body: string;
  let contentType: string;
  if (contentMode === "status-only") {
    body = "";
    contentType = "text/plain";
  } else if (contentMode === "body-only") {
    body = requestBody || "";
    contentType = HeaderManager.firstValue(requestHeaders["content-type"]) || "text/plain";
  } else {
    // Default: full JSON echo (similar to http-responder)
    contentType = "application/json";
    // Mirror the post-hook request.url so the echo reflects what would
    // have been fetched in production (WASM can rewrite this via
    // set_property). Falls back to BUILTIN_URL if the hook cleared it.
    body = JSON.stringify({
      method: requestMethod,
      reqHeaders: requestHeaders,
      reqBody: requestBody || "",
      requestUrl: (properties["request.url"] as string) || BUILTIN_URL,
    });
  }

  host.log(`Built-in responder: ${status} ${statusText}, mode=${contentMode || "full"}`);
  return {
    status,
    statusText,
    headers: { "content-type": contentType, "content-length": String(Buffer.byteLength(body)) },
    body,
    contentType,
    isBase64: false,
  };
}

/** Real HTTP fetch to origin. */
async function fetchOrigin(
  host: CdnFlowHost,
  targetUrl: string,
  requestMethod: string,
  requestHeaders: HeaderRecord,
  requestBody: string,
  properties: Record<string, unknown>,
): Promise<OriginResponse> {
  // `request.url` is the single routing source (FastEdge production
  // parity — the `geoRedirect` example is the canonical pattern). WASM
  // writes to `request.path`, `request.host`, `request.scheme`, or
  // `request.query` return Ok but do NOT affect the outbound fetch
  // target, matching the silent-drop behaviour on production. WASM code
  // that needs to re-route must rewrite `request.url` directly.
  const actualTargetUrl = (properties["request.url"] as string) || targetUrl;
  const actualScheme = new URL(actualTargetUrl).protocol.replace(":", "");

  host.log(`Original URL: ${targetUrl}`);
  host.log(`Effective URL: ${actualTargetUrl}`);
  host.log(`Fetching ${requestMethod} ${actualTargetUrl}`);

  // Preserve the host header as x-forwarded-host since fetch() will override it.
  // fetch's HeadersInit requires single-string values; requestHeaders may
  // include multi-valued entries (from duplicate hook additions), so flatten to a
  // comma-joined map — acceptable for request headers (never Set-Cookie).
  const fetchHeaders: Record<string, string> = HeaderManager.flattenToMap(requestHeaders);

  // Strip HTTP/2 pseudo-headers (:method, :path, :authority, :scheme).
  // WASM hooks legitimately read them via proxy_get_header_map_value, but
  // HTTP/1.1 fetch rejects them with "Headers.append: \":method\" is an
  // invalid header name." Production FastEdge also drops pseudo-headers
  // before upstream fetch. The proxy_http_call path does the same.
  for (const key of Object.keys(fetchHeaders)) {
    if (key.startsWith(":")) {
      delete fetchHeaders[key];
    }
  }

  // If there's a host header, also add it as x-forwarded-host
  const hostHeader = Object.entries(requestHeaders).find(([key]) => key.toLowerCase() === "host");
  if (hostHeader) {
    const hostValue = HeaderManager.firstValue(hostHeader[1]) ?? "";
    fetchHeaders["x-forwarded-host"] = hostValue;
    host.log(`Adding x-forwarded-host: ${hostValue}`);
  }

  // Auto-inject standard proxy headers derived from the effective URL
  fetchHeaders["x-forwarded-proto"] = actualScheme;
  host.log(`Adding x-forwarded-proto: ${actualScheme}`);
  fetchHeaders["x-forwarded-port"] = actualScheme === "https" ? "443" : "80";
  host.log(`Adding x-forwarded-port: ${fetchHeaders["x-forwarded-port"]}`);

  // Add X-Real-IP and X-Forwarded-For if set in properties
  const realIp = properties["request.x_real_ip"];
  if (realIp && realIp !== "") {
    fetchHeaders["x-real-ip"] = String(realIp);
    fetchHeaders["x-forwarded-for"] = String(realIp);
    host.log(`Adding x-real-ip and x-forwarded-for: ${realIp}`);
  }

  const fetchOptions: RequestInit = {
    method: requestMethod,
    headers: fetchHeaders,
    // Redirects are not followed; the redirect target was not checked against the egress policy.
    redirect: "manual",
  };

  // Add body for methods that support it
  if (["POST", "PUT", "PATCH"].includes(requestMethod.toUpperCase()) && requestBody) {
    fetchOptions.body = requestBody;
  }

  await checkEgressAllowed(actualTargetUrl);
  const response = await fetch(actualTargetUrl, fetchOptions);

  // Extract response headers — preserve multiple Set-Cookie entries as string[]
  // (RFC 6265 §3: Set-Cookie is the canonical exception to comma-combine).
  const headers: HeaderRecord = {};
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() !== "set-cookie") {
      headers[key] = value;
    }
  });
  const setCookies = response.headers.getSetCookie();
  if (setCookies.length > 0) {
    headers["set-cookie"] = setCookies;
  }

  const contentType = response.headers.get("content-type") || "text/plain";
  let body: string;
  let isBase64 = false;
  if (isBinaryContentType(contentType)) {
    // For binary content, convert to base64
    const arrayBuffer = await response.arrayBuffer();
    body = Buffer.from(arrayBuffer).toString("base64");
    isBase64 = true;
    host.log(`Binary response converted to base64 (${arrayBuffer.byteLength} bytes)`);
  } else {
    body = await response.text();
  }

  host.log(`Fetch completed: ${response.status} ${response.statusText}`);
  return { status: response.status, statusText: response.statusText, headers, body, contentType, isBase64 };
}

function isBinaryContentType(contentType: string): boolean {
  return contentType.startsWith("image/")
    || contentType.startsWith("video/")
    || contentType.startsWith("audio/")
    || contentType.includes("application/octet-stream")
    || contentType.includes("application/pdf")
    || contentType.includes("application/zip");
}

/**
 * The response a hook's send_http_response produced. The headers passed as its 4th argument are
 * append-merged on top of any set via the response header map, preserving multi-value semantics
 * (e.g. Set-Cookie).
 */
function finalLocalResponse(local: LocalResponse, responseHeaders: HeaderRecord): FullFlowResult["finalResponse"] {
  const headers = local.headers.length > 0
    ? HeaderManager.appendMerge(responseHeaders, HeaderManager.tuplesToRecord(local.headers))
    : responseHeaders;
  const contentType = HeaderManager.firstValue(headers["content-type"]) || "text/plain";
  const bytes = Buffer.from(local.bodyBase64, "base64");
  // Mirrors the binary detection used for origin fetch responses.
  const isBase64 = isBinaryContentType(contentType);
  return {
    status: local.statusCode,
    statusText: local.statusText,
    headers,
    body: isBase64 ? local.bodyBase64 : new TextDecoder().decode(bytes),
    contentType,
    isBase64,
  };
}
