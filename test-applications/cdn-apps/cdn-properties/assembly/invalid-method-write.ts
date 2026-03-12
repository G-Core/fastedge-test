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
    log(LogLevelValues.debug, "onRequestHeaders >> invalid-method-write");

    const method = get_property("request.method");

    log(LogLevelValues.info, "Request Method: " + String.UTF8.decode(method));

    // THIS IS A FAILURE CASE, AS THE PROXY-WASM SDK SHOULD NOT ALLOW TO ALTER THE METHOD
    set_property("request.method", String.UTF8.encode("POST"));

    const methodAltered = get_property("request.method");

    // THE METHOD SHOULD NOT BE ALTERED, THIS LOG SHOULD SHOW THE ORIGINAL METHOD GET, NOT POST
    log(
      LogLevelValues.info,
      "Request ALTERED METHOD >> " + String.UTF8.decode(methodAltered),
    );

    return FilterHeadersStatusValues.Continue;
  }
}

registerRootContext((context_id: u32) => {
  return new HttpPropertiesRoot(context_id);
}, "httpProperties");
