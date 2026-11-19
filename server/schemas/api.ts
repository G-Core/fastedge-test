import { z } from 'zod';
import { RequestConfigSchema, TestConfigSchema, ClientContextSchema, EdgeContextSchema, ResourceConfigSchema, OriginSchema } from './config';

/** Request context fields: when given, they replace the runner's client / edge from then on. */
const context = { client: ClientContextSchema.optional(), edge: EdgeContextSchema.optional() };

export const ApiLoadBodySchema = z.object({
  wasmBase64: z.string().optional(),
  wasmPath: z.string().optional(),
  dotenv: z.object({
    enabled: z.boolean().optional(),
    path: z.string().optional(),
  }).optional(),
  /**
   * HTTP-WASM only. Pin the fastedge-run subprocess to this port instead of
   * using dynamic allocation. Forwarded from the frontend's currently-loaded
   * config (any *.test.json filename). Load fails fast if the port is busy.
   */
  httpPort: z.number().int().min(1024).max(65535).optional(),
  /** Local cache and Edge KV (the storage service). Default on. */
  stores: z.boolean().optional(),
  /** Cache bucket (edge location) for this app. Default `local`. */
  dc: z.string().min(1).optional(),
  ...context,
}).refine(d => d.wasmBase64 || d.wasmPath, {
  message: 'Either wasmBase64 or wasmPath must be provided',
}).refine(d => !(d.wasmBase64 && d.wasmPath), {
  message: 'Provide either wasmBase64 or wasmPath, not both',
}).meta({ // the refinements, for the JSON Schema: exactly one of them non-empty
  oneOf: ['wasmBase64', 'wasmPath'].map((key) => ({ required: [key], properties: { [key]: { minLength: 1 } } })),
});

export const ApiSendBodySchema = z.object({
  url: z.union([z.literal("built-in"), z.string().url()]),
  request: RequestConfigSchema.partial().optional(),
  properties: z.record(z.string(), z.unknown()).optional().default({}),
  /** Single app: where the response comes from (file paths relative to the workspace, inside it). */
  origin: OriginSchema.optional(),
  ...context,
});

/**
 * Load a resource (several apps, one per hook): a config file in the workspace, or the config
 * itself (paths relative to the workspace); neither = the default file,
 * `.fastedge-debug/fastedge-cdn-resource.test.json`. Every file it reads must be inside the workspace.
 */
export const ApiResourceLoadBodySchema = z.object({
  configPath: z.string().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
}).refine((body) => body.configPath === undefined || body.config === undefined, {
  message: "Give configPath or config, not both",
}).meta({ not: { required: ["configPath", "config"] } }); // the refinement, for the JSON Schema

/** Write a resource file (default: the default resource file); the config is written as given. */
export const ApiResourceSaveBodySchema = z.object({
  configPath: z.string().optional(),
  config: ResourceConfigSchema,
  /**
   * The version the caller read (`GET /api/resource/config`; null = no file then). When the file
   * changed since, the save is refused (409) unless `force`. Unset: no check.
   */
  expectedVersion: z.string().nullable().optional(),
  force: z.boolean().optional(),
});

export const ApiCallBodySchema = z.object({
  hook: z.enum(['onRequestHeaders', 'onRequestBody', 'onResponseHeaders', 'onResponseBody']),
  request: z.object({
    headers: z.record(z.string(), z.string()),
    body: z.string(),
    isBase64: z.boolean().optional().describe("The body is base64 of raw bytes"),
  }).optional(),
  response: z.object({
    headers: z.record(z.string(), z.string()),
    body: z.string(),
    isBase64: z.boolean().optional().describe("The body is base64 of raw bytes"),
  }).optional(),
  properties: z.record(z.string(), z.unknown()).optional().default({}),
  ...context,
});

/** /api/execute: only the request context is validated here (the rest is checked inline). */
export const ApiExecuteContextSchema = z.object(context);

export const ApiConfigBodySchema = z.object({
  config: TestConfigSchema,
});

export const SaveAsBodySchema = z.object({
  config: TestConfigSchema,
  filePath: z.string(),
});

export const ApiDotenvBodySchema = z.object({
  dotenv: z.object({
    enabled: z.boolean(),
    path: z.string().optional(),
  }),
});

export type ApiLoadBody = z.infer<typeof ApiLoadBodySchema>;
export type ApiSendBody = z.infer<typeof ApiSendBodySchema>;
export type ApiCallBody = z.infer<typeof ApiCallBodySchema>;
export type ApiConfigBody = z.infer<typeof ApiConfigBodySchema>;
export type SaveAsBody = z.infer<typeof SaveAsBodySchema>;
export type ApiDotenvBody = z.infer<typeof ApiDotenvBodySchema>;

// ── Storage Explorer (/api/storage/*): manage the local cache and Edge KV ─────────────────────

/** A store name; it is also a fixture file name (fixtures/stores/kv/<store>.json). */
const StoreName = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/, "store names: letters, digits, . _ - (not first)");

/** A value as in fixture files: UTF-8 text, or { base64 }. */
const StoredValue = z.union([z.string(), z.object({ base64: z.string().base64("not base64") }).strict()]);

/** Replace one Edge KV key (any type) of a store, creating the store if needed. */
export const ApiStorageKvPutSchema = z.discriminatedUnion("type", [
  z.object({ store: StoreName, key: z.string().min(1), type: z.literal("string"), value: StoredValue }),
  z.object({ store: StoreName, key: z.string().min(1), type: z.literal("zset"), members: z.array(z.tuple([StoredValue, z.number()])).min(1, "a sorted set needs a member (delete the key instead)") }),
  z.object({ store: StoreName, key: z.string().min(1), type: z.literal("bloom"), items: z.array(z.string()).min(1, "a bloom filter needs an item (delete the key instead)") }),
]);

export const ApiStorageKvKeySchema = z.object({ store: StoreName, key: z.string().min(1) });
export const ApiStorageKvStoreSchema = z.object({ store: StoreName });

/** Write one cache entry of a dc; ttlMs default = the cache's default TTL. */
export const ApiStorageCachePutSchema = z.object({
  dc: z.string().min(1),
  key: z.string().min(1),
  value: StoredValue,
  ttlMs: z.number().int().min(0).optional(),
});
export const ApiStorageCacheKeySchema = z.object({ dc: z.string().min(1), key: z.string().min(1) });

/** A cache entry's new TTL from now, value kept (edge rules: above the max = the max). */
export const ApiStorageCacheExpireSchema = z.object({ dc: z.string().min(1), key: z.string().min(1), ttlMs: z.number().int().min(0) });

/**
 * Import into a store: the fixture format ({ strings, zsets, bloom }) or a plain JSON object of
 * key → value (strings as they are, anything else as JSON text). `replace` empties the store first.
 */
export const ApiStorageImportSchema = z.object({
  store: StoreName,
  data: z.record(z.string(), z.unknown()),
  replace: z.boolean().optional(),
});

/** Write the fixture files the diff showed: each with the hash the diff gave it. */
export const ApiStorageFixturesSaveSchema = z.object({
  files: z.array(z.object({ file: z.string(), hash: z.string() })).min(1),
});
