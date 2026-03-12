import { z } from 'zod';

export const WasmConfigSchema = z.object({
  path: z.string(),
  description: z.string().optional(),
});

export const RequestConfigSchema = z.object({
  method: z.string().default('GET'),
  url: z.string(),
  headers: z.record(z.string(), z.string()).optional().default({}),
  body: z.string().optional().default(''),
});

export const ResponseConfigSchema = z.object({
  headers: z.record(z.string(), z.string()).optional().default({}),
  body: z.string().optional().default(''),
});

export const TestConfigSchema = z.object({
  $schema: z.string().optional(),
  description: z.string().optional(),
  wasm: WasmConfigSchema.optional(),
  request: RequestConfigSchema,
  response: ResponseConfigSchema.optional(),
  properties: z.record(z.string(), z.unknown()).optional().default({}),
  dotenvEnabled: z.boolean().optional().default(true),
});

export type WasmConfig = z.infer<typeof WasmConfigSchema>;
export type RequestConfig = z.infer<typeof RequestConfigSchema>;
export type ResponseConfig = z.infer<typeof ResponseConfigSchema>;
export type TestConfig = z.infer<typeof TestConfigSchema>;
