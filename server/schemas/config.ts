import { z } from 'zod';

export const WasmConfigSchema = z.object({
  path: z.string(),
  description: z.string().optional(),
});

// CDN (proxy-wasm) request: full URL required (upstream target)
export const CdnRequestConfigSchema = z.object({
  method: z.string().default('GET'),
  url: z.string(),
  headers: z.record(z.string(), z.string()).optional().default({}),
  body: z.string().optional().default(''),
});

// HTTP request: path-only (the app IS the origin server)
export const HttpRequestConfigSchema = z.object({
  method: z.string().default('GET'),
  path: z.string(),
  headers: z.record(z.string(), z.string()).optional().default({}),
  body: z.string().optional().default(''),
});

const DotenvSchema = z.object({
  enabled: z.boolean().optional(),
  path: z.string().optional(),
});

const preset = z.enum(['de', 'nl', 'us']);
const field = z.string().optional();

/** Where the client is: a preset plus overrides (see server/runner/requestContext.ts). */
export const ClientContextSchema = z.object({
  preset: preset.optional(),
  ip: field, asn: field, country: field, countryName: field, city: field,
  region: field, continent: field, lat: field, long: field,
}).strict();

/** Which edge POP runs the app: a preset plus overrides. Its `dc` is the cache bucket. */
export const EdgeContextSchema = z.object({
  preset: preset.optional(),
  dc: field, region: field, country: field, city: field, hostname: field,
  popLat: field, popLong: field, popReg: field, popCity: field, popContinent: field,
  popCountryCode: field, popCountryName: field,
}).strict();

const BaseConfigSchema = z.object({
  $schema: z.string().optional(),
  description: z.string().optional(),
  wasm: WasmConfigSchema.optional(),
  properties: z.record(z.string(), z.unknown()).optional().default({}),
  dotenv: DotenvSchema.optional(),
  /**
   * The local cache and Edge KV (the storage service). On by default; `false` turns
   * them off: a CDN app's cache / KV calls then fail with an error status; an HTTP app falls
   * back to fastedge-run's own per-process cache and its `.env.kv_stores` stores.
   */
  stores: z.boolean().optional(),
  /** Cache bucket: runners with the same `dc` share cache entries. Default `local`. */
  dc: z.string().min(1).optional(),
  /** Where the client is. Explicit `properties` and request headers win. */
  client: ClientContextSchema.optional(),
  /** Which edge POP runs the app; its `dc` is the cache bucket unless `dc` is set. */
  edge: EdgeContextSchema.optional(),
});

// CDN config: full URL. The upstream response is generated at runtime —
// either by the built-in responder (url === "built-in") or by a real fetch
// against the configured URL. There is no fixture-level mock response.
const CdnConfigSchema = BaseConfigSchema.extend({
  appType: z.literal('proxy-wasm').default('proxy-wasm'),
  request: CdnRequestConfigSchema,
});

// HTTP config: path only, no mock response
const HttpConfigSchema = BaseConfigSchema.extend({
  appType: z.literal('http-wasm'),
  /**
   * Pin the fastedge-run subprocess to a specific port instead of allocating
   * from the dynamic pool (8100-8199). Use for Codespaces/Docker port-forwarding,
   * stable live-preview URLs, or tooling that needs a fixed target. Load fails
   * fast if the port is already in use.
   */
  httpPort: z.number().int().min(1024).max(65535).optional(),
  request: HttpRequestConfigSchema,
});

// Discriminated union — appType determines which schema validates
export const TestConfigSchema = z.union([HttpConfigSchema, CdnConfigSchema]);

// Backward-compat alias: the old flat RequestConfigSchema is the CDN variant
export const RequestConfigSchema = CdnRequestConfigSchema;

export type WasmConfig = z.infer<typeof WasmConfigSchema>;
export type CdnRequestConfig = z.infer<typeof CdnRequestConfigSchema>;
export type HttpRequestConfig = z.infer<typeof HttpRequestConfigSchema>;
export type RequestConfig = z.infer<typeof CdnRequestConfigSchema>;
export type CdnConfig = z.infer<typeof CdnConfigSchema>;
export type HttpConfig = z.infer<typeof HttpConfigSchema>;
export type TestConfig = z.infer<typeof TestConfigSchema>;
