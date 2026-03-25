export * from "@gcoredev/proxy-wasm-sdk-as/assembly/proxy";
import {
  Context,
  FilterHeadersStatusValues,
  log,
  LogLevelValues,
  registerRootContext,
  RootContext,
  send_http_response,
  stream_context,
} from "@gcoredev/proxy-wasm-sdk-as/assembly";

class RedirectRoot extends RootContext {
  createContext(context_id: u32): Context {
    return new Redirect(context_id, this);
  }
}

class Redirect extends Context {
  constructor(context_id: u32, root_context: RedirectRoot) {
    super(context_id, root_context);
  }

  onRequestHeaders(a: u32, end_of_stream: bool): FilterHeadersStatusValues {
    const redirectUrl = stream_context.headers.request.get("x-redirect-url");

    if (redirectUrl !== null && redirectUrl !== "") {
      log(LogLevelValues.info, "redirect >> redirecting to " + redirectUrl);

      // Set Location header on the response
      stream_context.headers.response.add("location", redirectUrl);

      // Send 302 local response — no origin fetch
      send_http_response(302, "Found", new ArrayBuffer(0), []);

      return FilterHeadersStatusValues.StopIteration;
    }

    log(LogLevelValues.info, "redirect >> no x-redirect-url header, continuing");
    return FilterHeadersStatusValues.Continue;
  }
}

registerRootContext((context_id: u32) => {
  return new RedirectRoot(context_id);
}, "redirect");
