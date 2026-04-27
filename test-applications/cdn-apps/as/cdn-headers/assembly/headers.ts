// Strict multi-value header validation app — AssemblyScript port of the
// FastEdge-sdk-rust cdn/headers example (and the sibling AS example at
// proxy-wasm-sdk-as/examples/headers). Exercises proxy_add_header_map_value,
// proxy_replace_header_map_value, proxy_remove_header_map_value, and
// proxy_get_header_map_pairs with duplicates, validating the runner correctly
// preserves separate entries for multi-valued headers.
//
// Added: two Set-Cookie entries in onResponseHeaders so the integration test
// exercises RFC 6265 §3 multi-value preservation end-to-end through both
// language variants (previously only the Rust variant, because this app
// used to live cross-repo in proxy-wasm-sdk-as/examples/headers/).

export * from "@gcoredev/proxy-wasm-sdk-as/assembly/proxy";
import {
  Context,
  FilterHeadersStatusValues,
  Headers,
  log,
  LogLevelValues,
  registerRootContext,
  RootContext,
  send_http_response,
  stream_context,
} from "@gcoredev/proxy-wasm-sdk-as/assembly";
import { setLogLevel } from "@gcoredev/proxy-wasm-sdk-as/assembly/fastedge";

function collectHeaders(
  headers: Headers,
  logHeaders: bool = true,
): Set<string> {
  // Iterate over headers adding them to the returned set and log them if required
  const set = new Set<string>();
  for (let i = 0; i < headers.length; i++) {
    const name = String.UTF8.decode(headers[i].key);
    const value = String.UTF8.decode(headers[i].value);
    if (logHeaders) log(LogLevelValues.info, `#header -> ${name}: ${value}`);
    set.add(`${name}:${value}`);
  }
  return set;
}

function validateHeaders(
  headers: Headers,
  expectedHeaders: Set<string>,
): Set<string> {
  // Diff only checks `new-header-*` prefixed entries — other added headers
  // (e.g. set-cookie below) are deliberately ignored so callers can add
  // application-style headers without needing to enumerate them in expected.
  const headersArr = collectHeaders(headers, false).values();
  const diff = new Set<string>();

  for (let i = 0; i < headersArr.length; i++) {
    const header = headersArr[i];
    if (header.startsWith("new-header-")) {
      const headerExists = expectedHeaders.has(header);
      if (!headerExists) diff.add(header);
    }
  }
  return diff;
}

class HttpHeadersRoot extends RootContext {
  createContext(context_id: u32): Context {
    setLogLevel(LogLevelValues.info);
    return new HttpHeaders(context_id, this);
  }
}

class HttpHeaders extends Context {
  constructor(context_id: u32, root_context: HttpHeadersRoot) {
    super(context_id, root_context);
  }

  onRequestHeaders(a: u32, end_of_stream: bool): FilterHeadersStatusValues {
    log(LogLevelValues.debug, "onRequestHeaders >> ");

    const originalHeaders = collectHeaders(
      stream_context.headers.request.get_headers(),
    );

    if (originalHeaders.size === 0) {
      send_http_response(
        550,
        "internal server error",
        String.UTF8.encode("Internal server error"),
        [],
      );
      return FilterHeadersStatusValues.StopIteration;
    }

    // Note: no 551-style "host is empty" check here. The SDK's `get()` returns
    // a non-nullable `string` so it cannot distinguish "missing" from
    // "present-but-empty". The Rust counterpart uses `is_none()` (which *can*
    // discriminate via the Option type); AS has no equivalent, so this
    // hook simply tolerates an empty host value — matching how nginx
    // pre-allocates `host:""` in the response phase.

    // Add new headers
    stream_context.headers.request.add("new-header-01", "value-01");
    stream_context.headers.request.add("new-header-02", "value-02");
    stream_context.headers.request.add("new-header-03", "value-03");

    // Remove — FastEdge/nginx sets to empty value, does not delete the entry
    stream_context.headers.request.remove("new-header-01");

    // Replace an existing header's value
    stream_context.headers.request.replace("new-header-02", "new-value-02");

    // Add a duplicate with the same name (multi-value)
    stream_context.headers.request.add("new-header-03", "value-03-a");

    // Touch response headers from the request phase
    stream_context.headers.response.add("new-response-header", "value-01");

    const cacheControlHeader =
      stream_context.headers.response.get("cache-control");
    if (cacheControlHeader.length > 0) {
      stream_context.headers.response.replace("cache-control", "");
    }

    const newResponseHeader = stream_context.headers.response.get(
      "new-response-header",
    );
    if (newResponseHeader.length > 0) {
      stream_context.headers.response.replace(
        "new-response-header",
        "value-02",
      );
    }

    // Expected `new-header-*` state after the add/remove/replace sequence.
    // Remove sets to empty string (FastEdge/nginx behavior), not delete.
    const expectedHeaders = new Set<string>();
    expectedHeaders.add("new-header-01:");
    expectedHeaders.add("new-header-02:new-value-02");
    expectedHeaders.add("new-header-03:value-03");
    expectedHeaders.add("new-header-03:value-03-a");

    const diff = validateHeaders(
      stream_context.headers.request.get_headers(),
      expectedHeaders,
    );

    if (diff.size > 0) {
      log(
        LogLevelValues.warn,
        `Unexpected request headers: ` + diff.values().join(", "),
      );
      send_http_response(
        552,
        "internal server error",
        String.UTF8.encode("Internal server error"),
        [],
      );
      return FilterHeadersStatusValues.StopIteration;
    }

    log(LogLevelValues.debug, `onRequestHeaders: OK!`);
    return FilterHeadersStatusValues.Continue;
  }

  onResponseHeaders(a: u32, end_of_stream: bool): FilterHeadersStatusValues {
    log(LogLevelValues.debug, "onResponseHeaders >> ");

    const originalHeaders = collectHeaders(
      stream_context.headers.response.get_headers(),
    );

    if (originalHeaders.size === 0) {
      send_http_response(
        550,
        "internal server error",
        String.UTF8.encode("Internal server error"),
        [],
      );
      return FilterHeadersStatusValues.StopIteration;
    }

    // See comment in onRequestHeaders — no 551-style check here either.
    // The response phase in nginx/FastEdge pre-allocates `host:""`, which
    // this hook must treat as a normal valid state.

    stream_context.headers.response.add("new-header-01", "value-01");
    stream_context.headers.response.add("new-header-02", "value-02");
    stream_context.headers.response.add("new-header-03", "value-03");

    stream_context.headers.response.remove("new-header-01");

    stream_context.headers.response.replace("new-header-02", "new-value-02");

    stream_context.headers.response.add("new-header-03", "value-03-a");

    // Two Set-Cookie headers — RFC 6265 §3 requires these stay as separate
    // entries (not comma-joined). The runner's HeaderManager.tuplesToRecord
    // projection must surface both values as a string[].
    stream_context.headers.response.add(
      "set-cookie",
      "sid=abc; Path=/; HttpOnly",
    );
    stream_context.headers.response.add("set-cookie", "theme=dark; Path=/");

    const expectedHeaders = new Set<string>();
    expectedHeaders.add("new-header-01:");
    expectedHeaders.add("new-header-02:new-value-02");
    expectedHeaders.add("new-header-03:value-03");
    expectedHeaders.add("new-header-03:value-03-a");

    const diff = validateHeaders(
      stream_context.headers.response.get_headers(),
      expectedHeaders,
    );

    if (diff.size > 0) {
      log(
        LogLevelValues.warn,
        `Unexpected response headers: ` + diff.values().join(", "),
      );
      send_http_response(
        552,
        "internal server error",
        String.UTF8.encode("Internal server error"),
        [],
      );
      return FilterHeadersStatusValues.StopIteration;
    }

    log(LogLevelValues.debug, `onResponseHeaders: OK!`);

    return FilterHeadersStatusValues.Continue;
  }

  onLog(): void {
    log(
      LogLevelValues.info,
      "onLog >> completed (contextId): " + this.context_id.toString(),
    );
  }
}

registerRootContext((context_id: u32) => {
  return new HttpHeadersRoot(context_id);
}, "httpheaders");
