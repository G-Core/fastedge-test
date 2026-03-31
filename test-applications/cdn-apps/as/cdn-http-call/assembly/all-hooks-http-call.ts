export * from "@gcoredev/proxy-wasm-sdk-as/assembly/proxy";
import {
  BaseContext,
  BufferTypeValues,
  Context,
  FilterDataStatusValues,
  FilterHeadersStatusValues,
  get_buffer_bytes,
  HeaderPair,
  log,
  LogLevelValues,
  makeHeaderPair,
  registerRootContext,
  RootContext,
  stream_context,
} from "@gcoredev/proxy-wasm-sdk-as/assembly";

/**
 * Advanced http-call test: dispatches proxy_http_call in every hook.
 *
 * Each of the 4 proxy-wasm hooks (onRequestHeaders, onRequestBody,
 * onResponseHeaders, onResponseBody) makes an http_call to a unique path
 * on the upstream server, which the test verifies received the correct
 * response for that hook.
 *
 * The upstream target is read from the incoming request's :authority and
 * :scheme pseudo-headers so the integration test can point it at a local
 * test server without changing the binary.
 */
class AllHooksRoot extends RootContext {
  constructor(context_id: u32) {
    super(context_id);
  }

  createContext(context_id: u32): Context {
    return new AllHooksContext(context_id, this);
  }

  onHttpCallResponse(token: u32, _headers: u32, body_size: u32, _trailers: u32): void {
    log(LogLevelValues.info, "[http-call] response received for token: " + token.toString());
    if (body_size > 0) {
      const bodyBytes = get_buffer_bytes(BufferTypeValues.HttpCallResponseBody, 0, body_size);
      const bodyStr = String.UTF8.decode(bodyBytes);
      log(LogLevelValues.info, "[http-call] response body: " + bodyStr);
    } else {
      log(LogLevelValues.info, "[http-call] response body: (empty)");
    }
  }
}

class AllHooksContext extends Context {
  requestHeadersCallDone: bool = false;
  requestBodyCallDone: bool = false;
  responseHeadersCallDone: bool = false;
  responseBodyCallDone: bool = false;

  constructor(context_id: u32, root_context: AllHooksRoot) {
    super(context_id, root_context);
  }

  // Dispatches an http_call to the given path on the authority from the
  // incoming request headers.  Falls back to the "host" header when
  // ":authority" is absent (HTTP/1.1 callFullFlow context).
  makeHttpCall(path: string): void {
    let authority = stream_context.headers.request.get(":authority");
    if (authority === "") {
      authority = stream_context.headers.request.get("host");
    }
    const scheme = stream_context.headers.request.get(":scheme");

    const headers = new Array<HeaderPair>();
    headers.push(makeHeaderPair(":authority", authority));
    headers.push(makeHeaderPair(":scheme", scheme !== "" ? scheme : "http"));
    headers.push(makeHeaderPair(":path", path));
    headers.push(makeHeaderPair(":method", "GET"));

    (this.root_context as AllHooksRoot).httpCall(
      authority,
      headers,
      new ArrayBuffer(0),
      new Array<HeaderPair>(),
      5000,
      this,
      (_ctx: BaseContext, _hdrs: u32, _bodySize: usize, _trls: u32): void => {},
    );
  }

  onRequestHeaders(_num_headers: u32, _end_of_stream: bool): FilterHeadersStatusValues {
    if (this.requestHeadersCallDone) {
      return FilterHeadersStatusValues.Continue;
    }
    log(LogLevelValues.info, "[onRequestHeaders] dispatching http-call");
    this.makeHttpCall("/on-request-headers");
    this.requestHeadersCallDone = true;
    return FilterHeadersStatusValues.StopIteration;
  }

  onRequestBody(body_size: usize, end_of_stream: bool): FilterDataStatusValues {
    if (this.requestBodyCallDone) {
      return FilterDataStatusValues.Continue;
    }
    if (!end_of_stream) {
      // Wait until the complete body has arrived
      return FilterDataStatusValues.StopIterationAndBuffer;
    }
    log(LogLevelValues.info, "[onRequestBody] dispatching http-call (body_size=" + body_size.toString() + ")");
    this.makeHttpCall("/on-request-body");
    this.requestBodyCallDone = true;
    // Returning StopIterationAndBuffer (value 1) also activates the PAUSE loop
    // in the host, which resolves the pending http_call before re-running this hook.
    return FilterDataStatusValues.StopIterationAndBuffer;
  }

  onResponseHeaders(_num_headers: u32, _end_of_stream: bool): FilterHeadersStatusValues {
    if (this.responseHeadersCallDone) {
      return FilterHeadersStatusValues.Continue;
    }
    log(LogLevelValues.info, "[onResponseHeaders] dispatching http-call");
    this.makeHttpCall("/on-response-headers");
    this.responseHeadersCallDone = true;
    return FilterHeadersStatusValues.StopIteration;
  }

  onResponseBody(body_size: usize, end_of_stream: bool): FilterDataStatusValues {
    if (this.responseBodyCallDone) {
      return FilterDataStatusValues.Continue;
    }
    if (!end_of_stream) {
      return FilterDataStatusValues.StopIterationAndBuffer;
    }
    log(LogLevelValues.info, "[onResponseBody] dispatching http-call (body_size=" + body_size.toString() + ")");
    this.makeHttpCall("/on-response-body");
    this.responseBodyCallDone = true;
    return FilterDataStatusValues.StopIterationAndBuffer;
  }
}

registerRootContext((context_id: u32): RootContext => {
  return new AllHooksRoot(context_id);
}, "all-hooks-http-call");
