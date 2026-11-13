/**
 * Request context: where the client is and which edge POP runs the app.
 *
 * `client` and `edge` are presets plus overrides. They expand into the low-level values the
 * runners already take, and an explicit low-level value (a property, a request header, a
 * dotenv dictionary entry, the top-level `dc`) always wins over them:
 *
 * | | CDN app (proxy-wasm) | HTTP app |
 * |---|---|---|
 * | client | `request.*` properties, `GeoIP-*` and `X-Real-IP` headers | `geoip-*` and `x-real-ip` headers |
 * | edge | dictionary `dc`, `region`, `country`, `city`, `hostname`; `X-ID` header | `dc` and `pop-*` headers |
 *
 * Both: the edge `dc` is the cache bucket. Values come from prod captures (2026-11).
 */

export const PRESETS = ["de", "nl", "us"] as const;
export type Preset = (typeof PRESETS)[number];

export type ClientContext = {
  preset?: Preset;
  ip?: string;
  asn?: string;
  /** ISO country code (`DE`). */
  country?: string;
  countryName?: string;
  city?: string;
  /** Region / state code (`HE`). */
  region?: string;
  /** Continent code (`EU`). */
  continent?: string;
  lat?: string;
  long?: string;
};

export type EdgeContext = {
  preset?: Preset;
  /** POP code (`fr5`); also the cache bucket. */
  dc?: string;
  /** Dictionary region (`eu`). */
  region?: string;
  /** Dictionary country name (`Germany`). */
  country?: string;
  city?: string;
  /** Edge node name (`fr5-hw-edge-gpig-gc23`); CDN apps also get it as `X-ID`. */
  hostname?: string;
  /** `pop-*` headers (HTTP apps). */
  popLat?: string;
  popLong?: string;
  popReg?: string;
  popCity?: string;
  popContinent?: string;
  popCountryCode?: string;
  popCountryName?: string;
};

export type RequestContext = { client?: ClientContext; edge?: EdgeContext };

// The IPs are documentation addresses (RFC 5737): nothing on the edge looks them up.
export const CLIENT_PRESETS: Record<Preset, Required<Omit<ClientContext, "preset">>> = {
  de: {
    ip: "192.0.2.10", asn: "62240", country: "DE", countryName: "Germany", city: "Frankfurt am Main",
    region: "HE", continent: "EU", lat: "50.09710", long: "8.59520",
  },
  nl: {
    ip: "198.51.100.10", asn: "207137", country: "NL", countryName: "The Netherlands", city: "Amsterdam",
    region: "NH", continent: "EU", lat: "52.37160", long: "4.88830",
  },
  us: {
    ip: "203.0.113.10", asn: "212238", country: "US", countryName: "United States", city: "Chicago",
    region: "IL", continent: "NA", lat: "41.84830", long: "-87.65170",
  },
};

// DE is inferred (fr5's dictionary was not captured); sv5's pop-* coordinates are approximate.
export const EDGE_PRESETS: Record<Preset, Required<Omit<EdgeContext, "preset">>> = {
  de: {
    dc: "fr5", region: "eu", country: "Germany", city: "Frankfurt am Main", hostname: "fr5-hw-edge-gpig-gc23",
    popLat: "50.1049", popLong: "8.6295", popReg: "HE", popCity: "Frankfurt am Main", popContinent: "EU",
    popCountryCode: "DE", popCountryName: "Germany",
  },
  nl: {
    dc: "am3", region: "eu", country: "Netherlands", city: "Amsterdam", hostname: "am3-hw-edge-gpig-gc96",
    popLat: "52.352", popLong: "4.9392", popReg: "NH", popCity: "Amsterdam", popContinent: "EU",
    popCountryCode: "NL", popCountryName: "The Netherlands",
  },
  us: {
    dc: "sv5", region: "na", country: "United States of America", city: "San Jose", hostname: "sv5-hw-edge-gpig-gc10",
    popLat: "37.3394", popLong: "-121.8950", popReg: "CA", popCity: "San Jose", popContinent: "NA",
    popCountryCode: "US", popCountryName: "United States",
  },
};

/** The preset's values with the overrides on top (fields set to "" are left out). */
function resolve<T extends { preset?: Preset }>(context: T | undefined, presets: Record<Preset, object>) {
  if (!context) return {} as Record<string, string>;
  const { preset, ...overrides } = context;
  if (preset !== undefined && !PRESETS.includes(preset)) throw new Error(`unknown preset "${preset}" (use ${PRESETS.join(", ")})`);
  const merged: Record<string, unknown> = { ...(preset ? presets[preset] : {}), ...overrides };
  return Object.fromEntries(
    Object.entries(merged).filter((e): e is [string, string] => typeof e[1] === "string" && e[1] !== ""),
  );
}

/** Rename the defined fields of `values` by `names`. */
function rename(values: Record<string, string>, names: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(names).flatMap(([from, to]) => (values[from] ? [[to, values[from]]] : [])));
}

const CLIENT_PROPERTIES = {
  ip: "request.x_real_ip", asn: "request.asn", country: "request.country", countryName: "request.country.name",
  city: "request.city", region: "request.region", continent: "request.continent", lat: "request.geo.lat",
  long: "request.geo.long",
};

const CLIENT_HEADERS = {
  ip: "x-real-ip", asn: "geoip-asn", country: "geoip-country-code", city: "geoip-city", region: "geoip-reg",
  continent: "geoip-continent", lat: "geoip-lat", long: "geoip-long",
};

const EDGE_DICTIONARY = { dc: "dc", region: "region", country: "country", city: "city", hostname: "hostname" };

const EDGE_HTTP_HEADERS = {
  dc: "dc", popLat: "pop-lat", popLong: "pop-long", popReg: "pop-reg", popCity: "pop-city",
  popContinent: "pop-continent", popCountryCode: "pop-country-code", popCountryName: "pop-country-name",
};

/** The cache bucket an edge selects, if any. */
export function edgeDc(edge: EdgeContext | undefined): string | undefined {
  return resolve(edge, EDGE_PRESETS).dc;
}

/** CDN apps: client properties, dictionary keys, and the request headers the edge adds. */
export function cdnContext({ client, edge }: RequestContext) {
  const c = resolve(client, CLIENT_PRESETS);
  const e = resolve(edge, EDGE_PRESETS);
  return {
    properties: rename(c, CLIENT_PROPERTIES),
    dictionary: rename(e, EDGE_DICTIONARY),
    // Measured on the edge: CDN apps get GeoIP-* (no country name) and X-ID, but no pop-*.
    headers: { ...rename(c, CLIENT_HEADERS), ...rename(e, { hostname: "x-id" }) },
  };
}

/** HTTP apps: the request headers the edge adds. */
export function httpContextHeaders({ client, edge }: RequestContext): Record<string, string> {
  const c = resolve(client, CLIENT_PRESETS);
  return {
    ...rename(c, { ...CLIENT_HEADERS, countryName: "geoip-country-name" }),
    ...rename(resolve(edge, EDGE_PRESETS), EDGE_HTTP_HEADERS),
  };
}

/** `extra` under `explicit`: an explicit header (any case) wins. */
export function withHeaders<T>(extra: Record<string, string>, explicit: Record<string, T>): Record<string, T | string> {
  const taken = new Set(Object.keys(explicit).map((k) => k.toLowerCase()));
  return { ...Object.fromEntries(Object.entries(extra).filter(([k]) => !taken.has(k))), ...explicit };
}
