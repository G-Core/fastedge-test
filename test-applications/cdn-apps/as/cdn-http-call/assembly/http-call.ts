export * from "@gcoredev/proxy-wasm-sdk-as/assembly/proxy";
import {
  BaseContext,
  BufferTypeValues,
  Context,
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

class HttpCallRoot extends RootContext {
  constructor(context_id: u32) {
    super(context_id);
  }

  createContext(context_id: u32): Context {
    return new HttpCallContext(context_id, this);
  }

  onHttpCallResponse(token: u32, headers: u32, body_size: u32, trailers: u32): void {
    log(LogLevelValues.info, "Received http call response with token id: " + token.toString());

    const userAgent = stream_context.headers.http_callback.get("user-agent");
    if (userAgent !== "") {
      log(LogLevelValues.info, "User-Agent: Some(" + userAgent + ")");
    } else {
      log(LogLevelValues.info, "User-Agent: None");
    }

    if (body_size > 0) {
      const bodyBytes = get_buffer_bytes(BufferTypeValues.HttpCallResponseBody, 0, body_size);
      const bodyStr = String.UTF8.decode(bodyBytes);
      log(LogLevelValues.info, "Response body: Some(" + bodyStr + ")");
    } else {
      log(LogLevelValues.info, "Response body: None");
    }

    log(LogLevelValues.info, "HTTP call response was received successfully, resuming request.");
  }
}

class HttpCallContext extends Context {
  httpCallDone: bool = false;

  constructor(context_id: u32, root_context: HttpCallRoot) {
    super(context_id, root_context);
  }

  onRequestHeaders(a: u32, end_of_stream: bool): FilterHeadersStatusValues {
    if (this.httpCallDone) {
      return FilterHeadersStatusValues.Continue;
    }

    const authority = stream_context.headers.request.get(":authority");
    const scheme = stream_context.headers.request.get(":scheme");
    const path = stream_context.headers.request.get(":path");

    const headers = new Array<HeaderPair>();
    headers.push(makeHeaderPair(":authority", authority));
    headers.push(makeHeaderPair(":scheme", scheme !== "" ? scheme : "https"));
    headers.push(makeHeaderPair(":path", path !== "" ? path : "/"));
    headers.push(makeHeaderPair(":method", "GET"));

    (this.root_context as HttpCallRoot).httpCall(
      authority,
      headers,
      new ArrayBuffer(0),
      new Array<HeaderPair>(),
      5000,
      this,
      (ctx: BaseContext, hdrs: u32, bodySize: usize, trls: u32): void => {},
    );

    this.httpCallDone = true;
    return FilterHeadersStatusValues.StopIteration;
  }
}

registerRootContext((context_id: u32): RootContext => {
  return new HttpCallRoot(context_id);
}, "http-call");
