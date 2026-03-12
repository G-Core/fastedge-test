import { z } from 'zod';
import { RequestConfigSchema, ResponseConfigSchema, TestConfigSchema } from './config';

export const ApiLoadBodySchema = z.object({
  wasmBase64: z.string().optional(),
  wasmPath: z.string().optional(),
  dotenvEnabled: z.boolean().optional().default(true),
}).refine(d => d.wasmBase64 || d.wasmPath, {
  message: 'Either wasmBase64 or wasmPath must be provided',
}).refine(d => !(d.wasmBase64 && d.wasmPath), {
  message: 'Provide either wasmBase64 or wasmPath, not both',
});

export const ApiSendBodySchema = z.object({
  url: z.string().url(),
  request: RequestConfigSchema.partial().optional(),
  response: ResponseConfigSchema.partial().optional(),
  properties: z.record(z.string(), z.unknown()).optional().default({}),
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
});

export const ApiConfigBodySchema = z.object({
  config: TestConfigSchema,
});

export type ApiLoadBody = z.infer<typeof ApiLoadBodySchema>;
export type ApiSendBody = z.infer<typeof ApiSendBodySchema>;
export type ApiCallBody = z.infer<typeof ApiCallBodySchema>;
export type ApiConfigBody = z.infer<typeof ApiConfigBodySchema>;
