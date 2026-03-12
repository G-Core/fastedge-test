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
    log(LogLevelValues.debug, "onRequestHeaders >> invalid-geolocation-write");

    const country = get_property("request.country");

    log(LogLevelValues.info, "Request Country: " + String.UTF8.decode(country));

    // THIS IS A FAILURE CASE, AS THE PROXY-WASM SDK SHOULD NOT ALLOW TO ALTER GEOLOCATION
    set_property("request.country", String.UTF8.encode("XX"));

    const countryAltered = get_property("request.country");

    // THE COUNTRY SHOULD NOT BE ALTERED, THIS LOG SHOULD SHOW THE ORIGINAL COUNTRY, NOT XX
    log(
      LogLevelValues.info,
      "Request ALTERED COUNTRY >> " + String.UTF8.decode(countryAltered),
    );

    return FilterHeadersStatusValues.Continue;
  }
}

registerRootContext((context_id: u32) => {
  return new HttpPropertiesRoot(context_id);
}, "httpProperties");
