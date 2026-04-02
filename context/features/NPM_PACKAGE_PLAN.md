# @gcoredev/fastedge-test — npm Package Plan (Option C)

## Overview

The fastedge-debugger is being evolved into a dual-purpose package: it continues to ship as a VSCode-embedded server+UI via GitHub Releases (ZIP artifact), and will **also** be published as `@gcoredev/fastedge-test` on npm.

This provides two distinct consumers:
1. **Human developers** — use the server+UI via the existing VSCode extension workflow
2. **AI agents / CI pipelines** — use the headless runner API for automated TDD against WASM binaries

The package will expose collapsed entry points:
- `.` — public runner API (headless testing)
- `./server` — the full debugger server
- `./test` — test framework layer for agent TDD
- `./schemas` — JSON Schema files for validation

---

## Phase Summary

| Phase | Name | Status | Risk |
|-------|------|--------|------|
| 1 | JSON Schema Contract | ✅ Complete (Feb 2026) | Low |
| 2 | Runner Isolation | ✅ Complete (Feb 2026) | Low-Medium |
| 3 | Package + Build Pipeline | ✅ Complete (Feb 2026) | Medium |
| 4 | Test Framework Layer | ✅ Complete (Feb 2026) | Medium |
| 5 | GitHub Actions npm Publish | 🔜 Future | Low |

---

## Phase 1: JSON Schema Contract ✅ COMPLETE

### What Was Built

Made `fastedge-config.test.json` and all API request/response bodies a versioned, validated contract using a **hybrid Zod v4 + TypeScript** approach.

**Schema Strategy:**
- **Config-facing types** (user-written): Zod v4 schemas → TypeScript types → JSON Schema via `schema.toJSONSchema()`
- **Runner-internal types** (execution results): TypeScript types → JSON Schema via `ts-json-schema-generator`

**New Files:**
- `server/schemas/config.ts` — Zod schemas: `TestConfigSchema`, `CdnRequestConfigSchema`, `HttpRequestConfigSchema`, `RequestConfigSchema` (backward-compat alias for `CdnRequestConfigSchema`), `ResponseConfigSchema`, `WasmConfigSchema`
- `server/schemas/api.ts` — Zod schemas: `ApiLoadBodySchema`, `ApiSendBodySchema`, `ApiCallBodySchema`, `ApiConfigBodySchema`
- `server/schemas/index.ts` — re-exports
- `scripts/generate-schemas.ts` — schema generation build step
- `tsconfig.scripts.json` — TypeScript config for ts-node scripts
- `schemas/*.schema.json` — 10 generated JSON schema files (checked into git)

**Modified Files:**
- `server/server.ts` — Zod `.safeParse()` on all 4 API endpoints; `GET /api/schema/:name`; config load validation
- `package.json` — `build:schemas` script added, prepended to `build`
- `fastedge-config.test.json` — `$schema` field added, fixed JS comments (invalid JSON)

**Generated Schemas (10 files):**
```
schemas/
├── fastedge-config.test.schema.json     ← TestConfig (what users write)
├── api-load.schema.json        ← POST /api/load body
├── api-send.schema.json        ← POST /api/send body
├── api-call.schema.json        ← POST /api/call body
├── api-config.schema.json      ← POST /api/config body
├── hook-result.schema.json     ← HookResult (runner output)
├── full-flow-result.schema.json ← FullFlowResult (runner output)
├── hook-call.schema.json       ← HookCall (runner input)
├── http-request.schema.json    ← HttpRequest type
└── http-response.schema.json  ← HttpResponse type
```

**API Behaviour Changes:**
- All API endpoints return structured 400 errors: `{ ok: false, error: { formErrors: [...], fieldErrors: {...} } }`
- `GET /api/config` returns `{ ok, config, valid, validationErrors }` — agents can detect invalid configs
- `GET /api/schema/:name` serves any schema file — agents can fetch the live contract

**$schema in fastedge-config.test.json:**
```json
{
  "$schema": "./schemas/fastedge-config.test.schema.json",
  ...
}
```
VS Code autocomplete now works on all `fastedge-config.test.json` properties.

### Key Implementation Notes

**Zod v4 (not v3) is installed.** API differences:
- Use `z.record(z.string(), z.string())` not `z.record(z.string())` (v4 requires key + value schema)
- Use `schema.toJSONSchema()` instance method (not top-level `toJSONSchema(schema)`)
- `zod-to-json-schema` package is installed but not needed — Zod v4 has built-in support
- Schemas use extensionless imports (`./config` not `./config.js`) to work with both esbuild and ts-node

**ts-json-schema-generator requires `tslib`:**
After installing, may need `pnpm install --force` to get tslib linked in pnpm virtual store.

---

## Phase 2: Runner Isolation ✅ COMPLETE

### Goal

Create a clean headless runner API in `server/runner/index.ts` with no server leakage. The runner should work standalone — without WebSocket, without Express — so agents can `import { createRunner } from '@gcoredev/fastedge-test'` and run WASM hooks programmatically.

### Key Changes

**`server/runner/index.ts` (new — public API)**
```typescript
export { ProxyWasmRunner } from './ProxyWasmRunner.js';
export { HttpWasmRunner } from './HttpWasmRunner.js';
export { WasmRunnerFactory } from './WasmRunnerFactory.js';
export type { IWasmRunner, WasmType, RunnerConfig, HttpRequest, HttpResponse } from './IWasmRunner.js';
export type { HookResult, FullFlowResult, HookCall } from './types.js';
```

**`server/runner/standalone.ts` (new — factory for headless use)**
```typescript
export function createRunner(wasmPath: string, config?: RunnerConfig): Promise<IWasmRunner>;
export function createRunnerFromBuffer(buffer: Buffer, config?: RunnerConfig): Promise<IWasmRunner>;
```

**`StateManager` decoupling:**
- `StateManager` currently depends on `WebSocketManager` (requires WebSocket connection)
- Add `NullStateManager` that implements same interface with no-op event emission
- Runners accept `StateManager | null` — use `NullStateManager` when running headless
- OR: make `StateManager` an optional EventEmitter-style interface

**`tsconfig.lib.json` (new):**
- Validates that `server/runner/` has no imports from `server/websocket/` or `server/server.ts`
- Used by `build:lib` to ensure clean separation

### Files to Create
- `server/runner/index.ts` — public exports
- `server/runner/standalone.ts` — headless factory
- `server/runner/NullStateManager.ts` — no-op state manager for headless use
- `tsconfig.lib.json` — lib build config with strict include list

### Files to Modify
- `server/runner/ProxyWasmRunner.ts` — accept `StateManager | NullStateManager`
- `server/runner/HttpWasmRunner.ts` — accept `StateManager | NullStateManager`
- `server/runner/WasmRunnerFactory.ts` — pass null state manager by default

### Verification
```typescript
// Should work without server running
import { createRunner } from './server/runner/standalone.js';
const runner = await createRunner('./path/to/wasm.wasm');
const result = await runner.callFullFlow('https://example.com', 'GET', {}, '', {}, '', 200, 'OK', {}, true);
console.log(result.hookResults);
```

---

## Phase 3: Package + Build Pipeline 🔲 NEXT

### Goal

Make the package publishable as `@gcoredev/fastedge-test`. This involves:
1. Updating `package.json` metadata
2. Adding an `exports` map with collapsed entry points
3. Adding a library build (CJS + ESM + `.d.ts`) via esbuild in lib mode
4. Adding `"files"` array for publish control

### package.json Changes
```json
{
  "name": "@gcoredev/fastedge-test",
  "version": "0.1.0",
  "private": false,
  "exports": {
    ".":         { "import": "./dist/lib/index.js", "require": "./dist/lib/index.cjs" },
    "./server":  "./dist/server.js",
    "./test":    { "import": "./dist/lib/test-framework/index.js", "require": "./dist/lib/test-framework/index.cjs" },
    "./schemas": "./schemas/"
  },
  "files": [
    "dist/lib/",
    "dist/server.js",
    "dist/fastedge-cli/",
    "schemas/"
  ]
}
```

### New Scripts
```json
"build:lib": "node esbuild/bundle-lib.js",
"build:all": "pnpm build:schemas && pnpm build:lib && pnpm build:backend && pnpm build:frontend"
```

### `esbuild/bundle-lib.js` (new)
- Entry: `server/runner/index.ts` (from Phase 2)
- Output: `dist/lib/index.js` (ESM) + `dist/lib/index.cjs` (CJS) + `.d.ts` via tsc
- External: everything except the runner's own code (no bundling of express/ws/etc.)
- Mark Node.js builtins as external

### Verification
```bash
pnpm pack --dry-run    # Check what files would be published
node -e "const t = require('@gcoredev/fastedge-test'); console.log(Object.keys(t))"
```

---

## Phase 4: Test Framework Layer 🔲 PLANNED

### Goal

Create a test framework for agent TDD in `server/test-framework/`. Agents can write structured test suites against WASM binaries using a clean, familiar API.

### Entry Point: `./test`

```typescript
// Usage by an agent
import { defineTestSuite, runTestSuite } from '@gcoredev/fastedge-test/test';

const suite = defineTestSuite({
  wasmPath: './build/my-app.wasm',
  defaultRequest: { url: 'https://example.com', method: 'GET' },
  tests: [
    {
      name: 'injects x-custom header on request',
      run: async (runner) => {
        const result = await runner.callFullFlow('https://example.com', 'GET', {}, '', {}, '', 200, 'OK', {}, true);
        assert(result.hookResults.onRequestHeaders.output.request.headers['x-custom'] === 'expected');
      }
    }
  ]
});

const results = await runTestSuite(suite);
```

### Key Functions

**`defineTestSuite(config)`** — Validates config, returns a typed test suite definition
**`runTestSuite(suite)`** — Creates runner, executes all tests, returns structured results
**`loadConfigFile(path)`** — Loads `fastedge-config.test.json` and validates with `TestConfigSchema`
**Assert helpers** — Thin wrappers over existing `test-helpers.ts` utilities

### Files to Create
- `server/test-framework/index.ts` — exports: `defineTestSuite`, `runTestSuite`, `loadConfigFile`
- `server/test-framework/types.ts` — `TestSuite`, `TestCase`, `TestResult`, `SuiteResult`
- `server/test-framework/assertions.ts` — re-exports and wraps `server/__tests__/integration/utils/test-helpers.ts`
- `server/test-framework/suite-runner.ts` — orchestrates runner lifecycle + test execution

### Verification
```bash
# Agent workflow
pnpm build:lib
node -e "
  const { defineTestSuite, runTestSuite } = require('@gcoredev/fastedge-test/test');
  const suite = defineTestSuite({ wasmPath: './test-applications/cdn-apps/...' });
  runTestSuite(suite).then(r => console.log(r.passed, '/', r.total));
"
```

---

## Phase 5: GitHub Actions npm Publish 🔜 FUTURE DEVELOPMENT

### Goal

Add automatic npm publish to the existing `create-release.yml` workflow. On a version tag push, it:
1. Runs existing build + ZIP release steps (unchanged)
2. Runs `pnpm build:lib` for the library bundle
3. Publishes to npm as `@gcoredev/fastedge-test`

### Workflow Changes (`create-release.yml`)

```yaml
# After existing ZIP release step:
- name: Build library bundle
  run: pnpm build:lib

- name: Publish to npm
  run: pnpm publish --access public --no-git-checks
  env:
    NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

### Requirements
- `NPM_TOKEN` secret added to repository settings
- `package.json` must have `"private": false` (Phase 3)
- `"publishConfig": { "access": "public" }` in package.json (Phase 3)

### Verification
- Tag a release `v0.1.0` → workflow runs → package appears on npm
- `npm install @gcoredev/fastedge-test` works in a fresh project

---

## Architecture Vision (End State)

```
@gcoredev/fastedge-test
│
├── ./                    ← Runner API (headless)
│   ├── createRunner()
│   ├── createRunnerFromBuffer()
│   └── Types: IWasmRunner, HookResult, FullFlowResult, ...
│
├── ./server              ← Full Express server + UI
│   └── (existing dist/server.js — unchanged from ZIP release)
│
├── ./test                ← Test framework for agent TDD
│   ├── defineTestSuite()
│   ├── runTestSuite()
│   └── loadConfigFile()
│
└── ./schemas             ← JSON Schema files
    ├── fastedge-config.test.schema.json
    ├── api-*.schema.json
    └── hook-*.schema.json
```

---

## Critical Files Reference

| File | Role | Phase |
|------|------|-------|
| `server/schemas/config.ts` | Zod: TestConfig | 1 ✅ |
| `server/schemas/api.ts` | Zod: API bodies | 1 ✅ |
| `server/schemas/index.ts` | Schema re-exports | 1 ✅ |
| `scripts/generate-schemas.ts` | Schema generation | 1 ✅ |
| `schemas/*.schema.json` | Generated output | 1 ✅ |
| `server/server.ts` | Zod validation on endpoints | 1 ✅ |
| `fastedge-config.test.json` | $schema field | 1 ✅ |
| `server/runner/index.ts` | Public runner API | 2 ✅ |
| `server/runner/standalone.ts` | Headless factory | 2 ✅ |
| `server/runner/NullStateManager.ts` | No-op state manager | 2 ✅ |
| `server/runner/IStateManager.ts` | StateManager interface | 2 ✅ |
| `tsconfig.lib.json` | Lib build config | 2-3 ✅ |
| `esbuild/bundle-lib.js` | Library esbuild config | 3 ✅ |
| `server/test-framework/index.ts` | Test framework API | 4 ✅ |
| `.github/workflows/create-release.yml` | npm publish step | 5 🔲 |

---

## Dependencies Added (Phase 1)

```json
"dependencies": {
  "zod": "^4.3.6",
  "zod-to-json-schema": "^3.25.1"   ← installed but unused (Zod v4 has built-in toJSONSchema)
},
"devDependencies": {
  "ts-json-schema-generator": "^2.5.0",
  "ts-node": "^10.9.2",
  "tslib": "^2.8.1"
}
```

---

**Last Updated**: February 2026
**Branch**: test-server
