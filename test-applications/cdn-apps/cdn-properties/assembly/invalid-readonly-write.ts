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
    log(LogLevelValues.debug, "onRequestHeaders >> invalid-readonly-write");

    // THIS FILE CONTAINS FAILURE CASES - ALL WRITE OPERATIONS SHOULD BE DENIED

    // 1. request.extension
    const extension = get_property("request.extension");
    log(LogLevelValues.info, "Request Extension: " + String.UTF8.decode(extension));
    set_property("request.extension", String.UTF8.encode(".modified"));
    const extensionAltered = get_property("request.extension");
    log(LogLevelValues.info, "Request ALTERED Extension >> " + String.UTF8.decode(extensionAltered));

    // 2. request.city
    const city = get_property("request.city");
    log(LogLevelValues.info, "Request City: " + String.UTF8.decode(city));
    set_property("request.city", String.UTF8.encode("Modified City"));
    const cityAltered = get_property("request.city");
    log(LogLevelValues.info, "Request ALTERED City >> " + String.UTF8.decode(cityAltered));

    // 3. request.asn
    const asn = get_property("request.asn");
    log(LogLevelValues.info, "Request ASN: " + String.UTF8.decode(asn));
    set_property("request.asn", String.UTF8.encode("12345"));
    const asnAltered = get_property("request.asn");
    log(LogLevelValues.info, "Request ALTERED ASN >> " + String.UTF8.decode(asnAltered));

    // 4. request.geo.lat
    const geoLat = get_property("request.geo.lat");
    log(LogLevelValues.info, "Request Geo Lat: " + String.UTF8.decode(geoLat));
    set_property("request.geo.lat", String.UTF8.encode("99.9999"));
    const geoLatAltered = get_property("request.geo.lat");
    log(LogLevelValues.info, "Request ALTERED Geo Lat >> " + String.UTF8.decode(geoLatAltered));

    // 5. request.geo.long
    const geoLong = get_property("request.geo.long");
    log(LogLevelValues.info, "Request Geo Long: " + String.UTF8.decode(geoLong));
    set_property("request.geo.long", String.UTF8.encode("99.9999"));
    const geoLongAltered = get_property("request.geo.long");
    log(LogLevelValues.info, "Request ALTERED Geo Long >> " + String.UTF8.decode(geoLongAltered));

    // 6. request.region
    const region = get_property("request.region");
    log(LogLevelValues.info, "Request Region: " + String.UTF8.decode(region));
    set_property("request.region", String.UTF8.encode("XX"));
    const regionAltered = get_property("request.region");
    log(LogLevelValues.info, "Request ALTERED Region >> " + String.UTF8.decode(regionAltered));

    // 7. request.continent
    const continent = get_property("request.continent");
    log(LogLevelValues.info, "Request Continent: " + String.UTF8.decode(continent));
    set_property("request.continent", String.UTF8.encode("Modified Continent"));
    const continentAltered = get_property("request.continent");
    log(LogLevelValues.info, "Request ALTERED Continent >> " + String.UTF8.decode(continentAltered));

    // 8. request.country.name
    const countryName = get_property("request.country.name");
    log(LogLevelValues.info, "Request Country Name: " + String.UTF8.decode(countryName));
    set_property("request.country.name", String.UTF8.encode("Modified Country"));
    const countryNameAltered = get_property("request.country.name");
    log(LogLevelValues.info, "Request ALTERED Country Name >> " + String.UTF8.decode(countryNameAltered));

    return FilterHeadersStatusValues.Continue;
  }
}

registerRootContext((context_id: u32) => {
  return new HttpPropertiesRoot(context_id);
}, "httpProperties");
