export * from "@gcoredev/proxy-wasm-sdk-as/assembly/proxy"; // this exports the required functions for the proxy to interact with us.
import {
  Context,
  FilterHeadersStatusValues,
  get_property,
  log,
  LogLevelValues,
  registerRootContext,
  set_property,
  RootContext,
} from "@gcoredev/proxy-wasm-sdk-as/assembly";
import { setLogLevel } from "@gcoredev/proxy-wasm-sdk-as/assembly/fastedge";

class HttpPropertiesRoot extends RootContext {
  createContext(context_id: u32): Context {
    setLogLevel(LogLevelValues.debug); // Commented out due to SDK compilation issue
    return new HttpProperties(context_id, this);
  }
}

class HttpProperties extends Context {
  constructor(context_id: u32, root_context: HttpPropertiesRoot) {
    super(context_id, root_context);
  }

  onRequestHeaders(a: u32, end_of_stream: bool): FilterHeadersStatusValues {
    log(LogLevelValues.debug, "onRequestHeaders >> invalid-scheme-write");

    const scheme = get_property("request.scheme");

    log(LogLevelValues.info, "Request Scheme: " + String.UTF8.decode(scheme));

    // THIS IS A FAILURE CASE, AS THE PROXY-WASM SDK SHOULD NOT ALLOW TO ALTER THE SCHEME
    set_property("request.scheme", String.UTF8.encode("http"));

    const schemeAltered = get_property("request.scheme");

    // THE SCHEME SHOULD NOT BE ALTERED, THIS LOG SHOULD SHOW THE ORIGINAL SCHEME, NOT http
    log(
      LogLevelValues.info,
      "Request ALTERED SCHEME >> " + String.UTF8.decode(schemeAltered),
    );

    return FilterHeadersStatusValues.Continue;
  }
}

registerRootContext((context_id: u32) => {
  return new HttpPropertiesRoot(context_id);
}, "httpProperties");
