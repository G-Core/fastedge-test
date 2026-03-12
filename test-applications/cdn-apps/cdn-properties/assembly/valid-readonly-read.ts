export * from "@gcoredev/proxy-wasm-sdk-as/assembly/proxy"; // this exports the required functions for the proxy to interact with us.
import {
  Context,
  FilterHeadersStatusValues,
  get_property,
  log,
  LogLevelValues,
  registerRootContext,
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
    log(LogLevelValues.debug, "onRequestHeaders >> valid-readonly-read");

    // Read all 8 read-only properties
    const extension = get_property("request.extension");
    const city = get_property("request.city");
    const asn = get_property("request.asn");
    const geoLat = get_property("request.geo.lat");
    const geoLong = get_property("request.geo.long");
    const region = get_property("request.region");
    const continent = get_property("request.continent");
    const countryName = get_property("request.country.name");

    // Log all property values - these should be readable in onRequestHeaders
    log(LogLevelValues.info, "Request Extension: " + String.UTF8.decode(extension));
    log(LogLevelValues.info, "Request City: " + String.UTF8.decode(city));
    log(LogLevelValues.info, "Request ASN: " + String.UTF8.decode(asn));
    log(LogLevelValues.info, "Request Geo Lat: " + String.UTF8.decode(geoLat));
    log(LogLevelValues.info, "Request Geo Long: " + String.UTF8.decode(geoLong));
    log(LogLevelValues.info, "Request Region: " + String.UTF8.decode(region));
    log(LogLevelValues.info, "Request Continent: " + String.UTF8.decode(continent));
    log(LogLevelValues.info, "Request Country Name: " + String.UTF8.decode(countryName));

    return FilterHeadersStatusValues.Continue;
  }
}

registerRootContext((context_id: u32) => {
  return new HttpPropertiesRoot(context_id);
}, "httpProperties");
