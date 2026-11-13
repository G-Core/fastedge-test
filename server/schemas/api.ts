import { z } from 'zod';
import { RequestConfigSchema, TestConfigSchema, ClientContextSchema, EdgeContextSchema } from './config';

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
});

export const ApiSendBodySchema = z.object({
  url: z.union([z.literal("built-in"), z.string().url()]),
  request: RequestConfigSchema.partial().optional(),
  properties: z.record(z.string(), z.unknown()).optional().default({}),
  ...context,
});

export const ApiCallBodySchema = z.object({
  hook: z.enum(['onRequestHeaders', 'onRequestBody', 'onResponseHeaders', 'onResponseBody']),
  request: z.object({
    headers: z.record(z.string(), z.string()),
    body: z.string(),
  }).optional(),
  response: z.object({
    headers: z.record(z.string(), z.string()),
    body: z.string(),
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
