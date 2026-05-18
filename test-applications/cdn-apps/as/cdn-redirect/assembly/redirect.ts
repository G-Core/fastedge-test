export * from "@gcoredev/proxy-wasm-sdk-as/assembly/proxy";
import {
  Context,
  FilterHeadersStatusValues,
  log,
  LogLevelValues,
  makeHeaderPair,
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

      // Set Location via send_http_response's 4th argument — the proxy-wasm
      // ABI path for response headers attached to a locally-generated response.
      send_http_response(302, "Found", new ArrayBuffer(0), [
        makeHeaderPair("Location", redirectUrl),
      ]);

      return FilterHeadersStatusValues.StopIteration;
    }

    log(LogLevelValues.info, "redirect >> no x-redirect-url header, continuing");
    return FilterHeadersStatusValues.Continue;
  }
}

registerRootContext((context_id: u32) => {
  return new RedirectRoot(context_id);
}, "redirect");
