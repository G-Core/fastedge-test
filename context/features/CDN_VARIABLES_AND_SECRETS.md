# CDN Variables and Secrets Integration Test

**Status: ✅ Complete — all 7 tests passing**

This document tracks the integration test for env vars and secrets in CDN (proxy-wasm) apps,
paralleling the existing HTTP app integration test at `sdk-variables-and-secrets`.

---

## What Was Done

### 1. ProxyWasmRunner — `dotenv.path` support added ✅

`server/runner/ProxyWasmRunner.ts` was updated to respect `dotenv.path` from `RunnerConfig`.
Previously `loadDotenvIfEnabled()` hardcoded `"."` (CWD). Now it uses `this.dotenvPath`, which
is set from `config.dotenv?.path` in `load()`.

```typescript
// runner now respects:
await runner.load(buffer, { dotenv: { path: FIXTURES_DIR } });
```

### 2. `createTestRunnerWithDotenv()` helper added ✅

`server/__tests__/integration/utils/test-helpers.ts` — new export parallel to
`createHttpWasmRunnerWithDotenv()` in `http-wasm-helpers.ts`:

```typescript
export function createTestRunnerWithDotenv(): ProxyWasmRunner
```

### 3. CDN test application scaffolded ✅

`test-applications/cdn-apps/cdn-variables-and-secrets/`
- `assembly/variables-and-secrets.ts` — reads `USERNAME` via `getEnv`, `PASSWORD` via `getSecret`
  in `onRequestHeaders`; logs both values; adds them as `x-env-username` / `x-env-password` headers
- `package.json` — build script copying wasm to `wasm/cdn-apps/variables-and-secrets/`
- `asconfig.json` / `tsconfig.json` — mirrors other CDN apps

### 4. Fixtures and integration test created ✅

`server/__tests__/integration/cdn-apps/variables-and-secrets/`
- `fixtures/.env` — `FASTEDGE_VAR_ENV_USERNAME=cdn-test-user` + `FASTEDGE_VAR_SECRET_PASSWORD=cdn-test-secret`
- `variables-and-secrets.test.ts` — 6 tests covering log output, output headers, consistency,
  and return code

### 5. `WASM_TEST_BINARIES` updated ✅

`server/__tests__/integration/utils/wasm-loader.ts` — added:
```typescript
cdnApps: {
  variablesAndSecrets: {
    variablesAndSecrets: 'variables-and-secrets.wasm',
  },
  // ...
}
```

---

## What Is Blocked

### The blocker: `proxy-wasm-sdk-as` lacks `getEnv` in the published version

**Local repo** (`proxy-wasm-sdk-as/`):
- `assembly/fastedge/dictionary.ts` — exports `getEnv(name)` via `proxy_dictionary_get` ✅
- `assembly/fastedge/index.ts` — re-exports `./dictionary` ✅
- `assembly/imports.ts` — declares `proxy_dictionary_get` ✅
- Package version: `1.2.0`

**Installed in fastedge-test** (`@gcoredev/proxy-wasm-sdk-as@1.2.1`):
- NO `dictionary.ts` ❌
- NO `proxy_dictionary_get` in `imports.ts` ❌
- Has deprecated `getEnvVar` (uses WASI `process.env`, not `proxy_dictionary_get`)

**Why**: The local repo (`1.2.0`) has the new feature but was not yet published. The npm-published
`1.2.1` is missing it. The local version needs to be bumped and the workspace linked.

### Host side is already complete ✅

`server/fastedge-host/hostFunctions.ts` implements `proxy_dictionary_get`. The test runner fully
supports env vars via `proxy_dictionary_get` → `Dictionary` → dotenv `FASTEDGE_VAR_ENV_*`. The
missing piece is only on the WASM client side (the AS SDK).

---

## How to Unblock

**Option A (recommended): Bump local SDK version and link workspace**

1. Bump `proxy-wasm-sdk-as/package.json` version from `1.2.0` to `1.2.2` (satisfies `^1.2.1`)
2. Add to `fastedge-test/pnpm-workspace.yaml`:
   ```yaml
   packages:
     - test-applications/cdn-apps/*
     - test-applications/http-apps/*
     - ../proxy-wasm-sdk-as        # ← add this
   ```
3. Update `fastedge-test/package.json`:
   ```json
   "@gcoredev/proxy-wasm-sdk-as": "workspace:*"
   ```
4. Run `pnpm install` from `fastedge-test/`

**Option B: Publish `1.2.2` to npm**

Publish the local `proxy-wasm-sdk-as` with the `dictionary.ts` changes as version `1.2.2`,
then update `fastedge-test/package.json` to `^1.2.2` and run `pnpm install`.

---

## Steps to Complete After SDK Is Fixed

Once `getEnv` is available via `@gcoredev/proxy-wasm-sdk-as/assembly/fastedge`:

### 1. Clean up the assembly file

`test-applications/cdn-apps/cdn-variables-and-secrets/assembly/variables-and-secrets.ts`
currently has an inline `proxy_dictionary_get` declaration and a local `getEnv` workaround.
Replace with the clean SDK import:

```typescript
import {
  getEnv,
  getSecret,
  setLogLevel,
} from "@gcoredev/proxy-wasm-sdk-as/assembly/fastedge";
```

Remove the `// Declare proxy_dictionary_get directly...` block and local `getEnv` function.

### 2. Create the wasm output directory

```bash
mkdir -p fastedge-test/wasm/cdn-apps/variables-and-secrets
```

### 3. Build the CDN test app

```bash
cd fastedge-test
pnpm run build:cdn-test-apps
```

Verify `fastedge-test/wasm/cdn-apps/variables-and-secrets/variables-and-secrets.wasm` exists.

### 4. Run the integration test

```bash
pnpm run test:integration:cdn
```

The test file is: `server/__tests__/integration/cdn-apps/variables-and-secrets/variables-and-secrets.test.ts`

---

## Test Coverage (when complete)

| Test | Assertion |
|------|-----------|
| loads WASM successfully | `runner.getType() === 'proxy-wasm'` |
| reads USERNAME env var | logs contain `"USERNAME: cdn-test-user"` |
| reads PASSWORD secret | logs contain `"PASSWORD: cdn-test-secret"` |
| adds x-env-username header | `result.output.request.headers['x-env-username'] === 'cdn-test-user'` |
| adds x-env-password header | `result.output.request.headers['x-env-password'] === 'cdn-test-secret'` |
| consistent across multiple calls | all 3 iterations return correct values |
| returns Continue | `result.returnCode === 0` |

---

## Architecture Notes

### How env vars flow for CDN apps

```
fixtures/.env
  FASTEDGE_VAR_ENV_USERNAME=cdn-test-user
         ↓ (dotenv-loader.ts)
  Dictionary { USERNAME: "cdn-test-user" }
         ↓ (proxy_dictionary_get host function)
  WASM: getEnv("USERNAME") → "cdn-test-user"
         ↓
  stream_context.headers.request.add("x-env-username", "cdn-test-user")
         ↓
  result.output.request.headers['x-env-username']
```

### How secrets flow for CDN apps

```
fixtures/.env
  FASTEDGE_VAR_SECRET_PASSWORD=cdn-test-secret
         ↓ (dotenv-loader.ts)
  SecretStore { PASSWORD: "cdn-test-secret" }
         ↓ (proxy_get_secret host function)
  WASM: getSecret("PASSWORD") → "cdn-test-secret"
```

### Key difference from HTTP app test

HTTP apps use `fastedge-run` (Rust) for dotenv loading — the runner passes `--dotenv <path>` as
a CLI flag. CDN apps use Node.js `dotenv-loader.ts` which populates `Dictionary` and `SecretStore`
directly in the runner. Both use the same `RunnerConfig.dotenv` API surface.
