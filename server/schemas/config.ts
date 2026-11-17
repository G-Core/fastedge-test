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

/**
 * The built-in responder, declared: a fixed response (`status`, `headers`, and `body` or
 * `bodyFile`), or a folder served by request path (`files`, 200 or 404). Paths are relative to
 * the config file. It wins over the request's `x-debugger-*` headers (deprecated).
 */
export const BuiltInOriginSchema = z.object({
  status: z.number().int().min(100).max(599).optional(),
  headers: z.record(
    z.string().regex(/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/, "not a valid header name"),
    z.string().regex(/^[^\r\n\0]*$/, "header values cannot hold CR, LF or NUL"),
  ).optional(),
  body: z.string().optional(),
  /** A file whose bytes are the body (binary is fine); its extension gives the content-type. */
  bodyFile: z.string().optional(),
  /** A folder: GET /a/b.png answers with <folder>/a/b.png. Dotfiles are never served. */
  files: z.string().optional(),
}).strict()
  .refine((o) => [o.body, o.bodyFile, o.files].filter((v) => v !== undefined).length <= 1, { message: "set at most one of body, bodyFile, files" })
  .refine((o) => o.files === undefined || o.status === undefined, { message: "files sets the status itself (200, or 404 for a missing file)" });

/** Where a CDN request's response comes from: a URL ("built-in" = the echo responder) or `builtIn`. */
export const OriginSchema = z.union([
  z.object({ url: z.string() }).strict(),
  z.object({ builtIn: BuiltInOriginSchema }).strict(),
]);

// CDN config: full URL. The upstream response is generated at runtime —
// either by the built-in responder (url === "built-in") or by a real fetch
// against the configured URL. There is no fixture-level mock response.
const CdnConfigSchema = BaseConfigSchema.extend({
  appType: z.literal('proxy-wasm').default('proxy-wasm'),
  request: CdnRequestConfigSchema,
  /**
   * Where the response comes from. Unset: the request URL (a real fetch, or the built-in
   * responder for "built-in"). Set: `request.url` is only what the client asked for, and the
   * request's path and query go to this origin, as in a resource.
   */
  origin: OriginSchema.optional(),
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

/**
 * A resource: several apps on one CDN resource, as configured on the edge. `main` gives each
 * hook its app and the origin; the first rule whose `match` regex matches the request path
 * replaces main's hooks completely (when it sets `hooks`) and/or its origin.
 */
const HookAppSchema = z.union([
  z.string(),
  z.object({
    app: z.string(),
    /** As on the edge: on a hook error the request ends with 531 (true) or goes on as if the hook had not run (false). Default true. */
    interruptOnError: z.boolean().optional(),
  }).strict(),
]);

export const ResourceHooksSchema = z.object({
  onRequestHeaders: HookAppSchema.optional(),
  onRequestBody: HookAppSchema.optional(),
  onResponseHeaders: HookAppSchema.optional(),
  onResponseBody: HookAppSchema.optional(),
}).strict();

/** A URL ("built-in" for the built-in responder), a declared built-in response, or an HTTP app of the resource. */
export const ResourceOriginSchema = z.union([
  z.object({ url: z.string() }).strict(),
  z.object({ builtIn: BuiltInOriginSchema }).strict(),
  z.object({ app: z.string() }).strict(),
]);

export const ResourceAppSchema = z.object({
  /** Another project's fastedge-config.test.json: its wasm and dotenv, paths relative to it. */
  config: z.string().optional(),
  /** The built wasm, relative to this file. Overrides the referenced config's. */
  wasm: z.string().optional(),
  dotenv: DotenvSchema.optional(),
}).strict();

export const ResourceConfigSchema = z.object({
  $schema: z.string().optional(),
  description: z.string().optional(),
  apps: z.record(z.string(), ResourceAppSchema),
  main: z.object({
    hooks: ResourceHooksSchema.optional().default({}),
    origin: ResourceOriginSchema,
  }).strict(),
  rules: z.array(z.object({
    name: z.string().optional(),
    match: z.string(),
    hooks: ResourceHooksSchema.optional(),
    origin: ResourceOriginSchema.optional(),
  }).strict()).optional().default([]),
  properties: z.record(z.string(), z.unknown()).optional().default({}),
  stores: z.boolean().optional(),
  dc: z.string().min(1).optional(),
  client: ClientContextSchema.optional(),
  edge: EdgeContextSchema.optional(),
  request: CdnRequestConfigSchema.optional(),
});

export type ResourceConfig = z.infer<typeof ResourceConfigSchema>;
export type ResourceConfigInput = z.input<typeof ResourceConfigSchema>;
export type ResourceHooks = z.infer<typeof ResourceHooksSchema>;
export type ResourceOrigin = z.infer<typeof ResourceOriginSchema>;
export type BuiltInOrigin = z.infer<typeof BuiltInOriginSchema>;
export type Origin = z.infer<typeof OriginSchema>;

// Backward-compat alias: the old flat RequestConfigSchema is the CDN variant
export const RequestConfigSchema = CdnRequestConfigSchema;

export type WasmConfig = z.infer<typeof WasmConfigSchema>;
export type CdnRequestConfig = z.infer<typeof CdnRequestConfigSchema>;
export type HttpRequestConfig = z.infer<typeof HttpRequestConfigSchema>;
export type RequestConfig = z.infer<typeof CdnRequestConfigSchema>;
export type CdnConfig = z.infer<typeof CdnConfigSchema>;
export type HttpConfig = z.infer<typeof HttpConfigSchema>;
export type TestConfig = z.infer<typeof TestConfigSchema>;
