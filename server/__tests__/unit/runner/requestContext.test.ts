import { describe, it, expect } from "vitest";
import { cdnContext, contextProperties, edgeDc, httpContextHeaders, withHeaders } from "../../../runner/requestContext";
import { Dictionary } from "../../../fastedge-host/Dictionary";
import { TestConfigSchema } from "../../../schemas/config";

describe("request context", () => {
  it("expands nothing when no client or edge is set (old configs run as before)", () => {
    expect(cdnContext({})).toEqual({ properties: {}, dictionary: {}, headers: {} });
    expect(httpContextHeaders({})).toEqual({});
    expect(edgeDc(undefined)).toBeUndefined();
  });

  it("gives CDN apps client properties, GeoIP headers, dictionary keys and X-ID", () => {
    const c = cdnContext({ client: { preset: "nl" }, edge: { preset: "de" } });
    expect(c.properties).toMatchObject({
      "request.country": "NL",
      "request.country.name": "The Netherlands",
      "request.city": "Amsterdam",
      "request.asn": "207137",
      "request.x_real_ip": "198.51.100.10",
    });
    expect(c.dictionary).toEqual({
      dc: "fr5", region: "eu", country: "Germany", city: "Frankfurt am Main", hostname: "fr5-hw-edge-gpig-gc23",
    });
    expect(c.headers).toMatchObject({ "geoip-city": "Amsterdam", "x-real-ip": "198.51.100.10", "x-id": "fr5-hw-edge-gpig-gc23" });
    // Measured: CDN apps get no country-name header and no pop-* headers.
    expect(Object.keys(c.headers).filter((k) => k === "geoip-country-name" || k.startsWith("pop-") || k === "dc")).toEqual([]);
  });

  it("gives HTTP apps geoip-*, dc and pop-* headers", () => {
    const h = httpContextHeaders({ client: { preset: "us" }, edge: { preset: "nl" } });
    expect(h).toMatchObject({
      "geoip-country-code": "US", "geoip-country-name": "United States", "geoip-city": "Chicago",
      dc: "am3", "pop-city": "Amsterdam", "pop-country-name": "The Netherlands",
    });
    expect(h["x-id"]).toBeUndefined();
  });

  it("applies overrides over the preset; an empty override drops the field", () => {
    const c = cdnContext({ client: { preset: "de", city: "Berlin", asn: "" }, edge: { dc: "lux" } });
    expect(c.properties["request.city"]).toBe("Berlin");
    expect(c.properties["request.asn"]).toBeUndefined();
    expect(c.dictionary).toEqual({ dc: "lux" });
    expect(edgeDc({ preset: "us" })).toBe("sv5");
    expect(edgeDc({ preset: "us", dc: "cch1" })).toBe("cch1");
  });

  it("lets explicit headers win, whatever their case", () => {
    expect(withHeaders({ "geoip-city": "Amsterdam", "x-id": "n" }, { "GeoIP-City": "Paris" })).toEqual({
      "x-id": "n",
      "GeoIP-City": "Paris",
    });
  });

  it("an explicit X-Real-IP header sets request.x_real_ip over the client preset (the edge reads it from the header)", () => {
    const { properties } = cdnContext({ client: { preset: "de" } });
    expect(contextProperties(properties, { "X-Real-IP": "203.0.113.9" })["request.x_real_ip"]).toBe("203.0.113.9");
    expect(contextProperties(properties, {})["request.x_real_ip"]).toBe(properties["request.x_real_ip"]);
    expect(contextProperties({}, { "x-real-ip": "203.0.113.9" })).toEqual({}); // no context: unchanged
  });

  it("rejects an unknown preset", () => {
    expect(() => cdnContext({ client: { preset: "lu" as "de" } })).toThrow(/unknown preset/);
  });

  it("keeps set dictionary values over the edge defaults", () => {
    const d = new Dictionary({ dc: "explicit" });
    d.setDefaults({ dc: "fr5", city: "Frankfurt am Main" });
    expect(d.get("dc")).toBe("explicit");
    expect(d.get("city")).toBe("Frankfurt am Main");
    expect(d.has("city")).toBe(true);
    expect(d.get("hostname")).toBeNull();
    expect(d.get("constructor")).toBeNull(); // not an inherited member
    expect(d.has("toString")).toBe(false);
  });

  it("accepts client / edge in config files and rejects unknown fields", () => {
    const base = { request: { url: "built-in" } };
    expect(TestConfigSchema.safeParse({ ...base, client: { preset: "de", city: "Berlin" }, edge: { preset: "nl" } }).success).toBe(true);
    expect(TestConfigSchema.safeParse({ ...base, edge: { preset: "lu" } }).success).toBe(false);
    expect(TestConfigSchema.safeParse({ ...base, client: { town: "x" } }).success).toBe(false);
  });
});
