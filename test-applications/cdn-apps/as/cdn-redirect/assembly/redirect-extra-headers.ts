export * from "@gcoredev/proxy-wasm-sdk-as/assembly/proxy";
import {
  Context,
  FilterHeadersStatusValues,
  makeHeaderPair,
  registerRootContext,
  RootContext,
  send_http_response,
  stream_context,
} from "@gcoredev/proxy-wasm-sdk-as/assembly";

// Test fixture for the local-response header merge path in ProxyWasmRunner.
// Exercises the appendMerge contract: a header set via stream_context.headers.response.add()
// and the same header set in send_http_response's 4th arg must both appear
// in the final response (append, not overwrite) so multi-value headers like
// Set-Cookie survive the merge.
class RedirectExtraHeadersRoot extends RootContext {
  createContext(context_id: u32): Context {
    return new RedirectExtraHeaders(context_id, this);
  }
}

class RedirectExtraHeaders extends Context {
  constructor(context_id: u32, root_context: RedirectExtraHeadersRoot) {
    super(context_id, root_context);
  }

  onRequestHeaders(a: u32, end_of_stream: bool): FilterHeadersStatusValues {
    // Set a Set-Cookie header via stream_context (left side of the merge).
    stream_context.headers.response.add("set-cookie", "session=abc; Path=/");

    // send_http_response carries a second Set-Cookie (right side of the merge)
    // plus the Location header. appendMerge must preserve both set-cookie values.
    send_http_response(302, "Found", new ArrayBuffer(0), [
      makeHeaderPair("location", "https://example.com/"),
      makeHeaderPair("set-cookie", "theme=dark; Path=/"),
    ]);

    return FilterHeadersStatusValues.StopIteration;
  }
}

registerRootContext((context_id: u32) => {
  return new RedirectExtraHeadersRoot(context_id);
}, "redirect-extra-headers");
