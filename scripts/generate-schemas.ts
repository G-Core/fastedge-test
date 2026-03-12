/**
 * Schema generation script for @gcoredev/fastedge-test (Phase 1)
 *
 * Generates JSON Schema files from:
 * 1. Zod schemas → test-config + API request/response bodies
 * 2. ts-json-schema-generator → runner result types (HookResult, FullFlowResult, etc.)
 *
 * Output: schemas/*.schema.json (checked into git)
 */

import * as fs from 'fs';
import * as path from 'path';
import { createGenerator } from 'ts-json-schema-generator';

import {
  TestConfigSchema,
  ApiLoadBodySchema,
  ApiSendBodySchema,
  ApiCallBodySchema,
  ApiConfigBodySchema,
} from '../server/schemas/index';

const projectRoot = path.join(__dirname, '..');
const schemasDir = path.join(projectRoot, 'schemas');

// Ensure schemas directory exists
if (!fs.existsSync(schemasDir)) {
  fs.mkdirSync(schemasDir, { recursive: true });
}

// --- Zod → JSON Schema for config/API types ---
// Zod v4 exposes toJSONSchema() as an instance method on each schema

const zodSchemas: Array<{ name: string; schema: { toJSONSchema(): object } }> = [
  { name: 'test-config', schema: TestConfigSchema },
  { name: 'api-load', schema: ApiLoadBodySchema },
  { name: 'api-send', schema: ApiSendBodySchema },
  { name: 'api-call', schema: ApiCallBodySchema },
  { name: 'api-config', schema: ApiConfigBodySchema },
];

for (const { name, schema } of zodSchemas) {
  const jsonSchema = schema.toJSONSchema();
  const outputPath = path.join(schemasDir, `${name}.schema.json`);
  fs.writeFileSync(outputPath, JSON.stringify(jsonSchema, null, 2) + '\n');
  console.log(`✓ Generated ${name}.schema.json`);
}

// --- ts-json-schema-generator → JSON Schema for runner result types ---

const tsSchemaConfigs = [
  {
    name: 'hook-result',
    sourcePath: path.join(projectRoot, 'server/runner/types.ts'),
    typeName: 'HookResult',
  },
  {
    name: 'full-flow-result',
    sourcePath: path.join(projectRoot, 'server/runner/types.ts'),
    typeName: 'FullFlowResult',
  },
  {
    name: 'hook-call',
    sourcePath: path.join(projectRoot, 'server/runner/types.ts'),
    typeName: 'HookCall',
  },
  {
    name: 'http-request',
    sourcePath: path.join(projectRoot, 'server/runner/IWasmRunner.ts'),
    typeName: 'HttpRequest',
  },
  {
    name: 'http-response',
    sourcePath: path.join(projectRoot, 'server/runner/IWasmRunner.ts'),
    typeName: 'HttpResponse',
  },
];

for (const { name, sourcePath, typeName } of tsSchemaConfigs) {
  try {
    const generator = createGenerator({
      path: sourcePath,
      tsconfig: path.join(projectRoot, 'tsconfig.scripts.json'),
      type: typeName,
      skipTypeCheck: true,
      additionalProperties: true,
    });
    const schema = generator.createSchema(typeName);
    const outputPath = path.join(schemasDir, `${name}.schema.json`);
    fs.writeFileSync(outputPath, JSON.stringify(schema, null, 2) + '\n');
    console.log(`✓ Generated ${name}.schema.json`);
  } catch (err) {
    console.error(`✗ Failed to generate ${name}.schema.json:`, err);
    process.exit(1);
  }
}

console.log(`\n✅ All schemas generated in schemas/`);
