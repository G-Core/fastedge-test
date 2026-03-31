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

  onResponseHeaders(a: u32, end_of_stream: bool): FilterHeadersStatusValues {
    log(LogLevelValues.debug, "onResponseHeaders >> invalid-response-status-write");

    const status = get_property("response.status");

    log(LogLevelValues.info, "Response Status: " + String.UTF8.decode(status));

    // THIS IS A FAILURE CASE, AS THE PROXY-WASM SDK SHOULD NOT ALLOW TO ALTER RESPONSE STATUS
    set_property("response.status", String.UTF8.encode("500"));

    const statusAltered = get_property("response.status");

    // THE STATUS SHOULD NOT BE ALTERED, THIS LOG SHOULD SHOW THE ORIGINAL STATUS, NOT 500
    log(
      LogLevelValues.info,
      "Response ALTERED STATUS >> " + String.UTF8.decode(statusAltered),
    );

    return FilterHeadersStatusValues.Continue;
  }
}

registerRootContext((context_id: u32) => {
  return new HttpPropertiesRoot(context_id);
}, "httpProperties");
