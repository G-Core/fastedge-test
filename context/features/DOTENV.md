# DotEnv Configuration for FastEdge Test Runner

This test runner supports dotenv files for configuring env vars and secrets during local development, following the same pattern as the [FastEdge VSCode extension](https://github.com/G-Core/FastEdge-vscode/blob/main/DOTENV.md).

## Overview

Instead of hard-coding secrets and configuration in `fastedge-config.test.json`, you can use `.env` files to store sensitive data locally. This approach:

- Keeps sensitive data out of version control
- Matches production FastEdge behavior
- Simplifies local development workflow

## Two-Runner Architecture

Dotenv works differently for the two runner types:

### ProxyWasmRunner (CDN apps)

Dotenv loading is handled in **Node.js** by `server/utils/dotenv-loader.ts`. When enabled, it calls `loadDotenvFiles(".")` and injects secrets/dictionary values into the runner's `FastEdgeConfig` before WASM execution.

### HttpWasmRunner (HTTP apps)

Dotenv loading is handled by **`fastedge-run`** itself (the Rust binary). When enabled, the runner passes `--dotenv [path]` to the `fastedge-run http` process. The binary reads dotenv files from the specified directory (or CWD if no path given) and makes them available to the WASM via `getEnv()` and `getSecret()` in the JS SDK.

---

## File Structure

Both runner types support the same file formats:

```
.
├── .env                  # Combined file with FASTEDGE_VAR_ prefixes
├── .env.secrets          # Secrets only (no prefix needed)
├── .env.variables        # Env vars only (no prefix needed)
├── .env.req_headers      # Request headers (no prefix needed) — HTTP only
└── .env.rsp_headers      # Response headers (no prefix needed) — HTTP only
```

---

## Usage Patterns

### Option 1: Single `.env` file with prefixes

```bash
# Env vars — accessed via getEnv() / proxy_dictionary_get()
FASTEDGE_VAR_ENV_API_URL=https://api.example.com
FASTEDGE_VAR_ENV_LOG_LEVEL=debug

# Secrets — accessed via getSecret() / proxy_get_secret()
FASTEDGE_VAR_SECRET_JWT_SECRET=my-secret-key
FASTEDGE_VAR_SECRET_API_KEY=sk_test_12345
```

### Option 2: Separate files (no prefix needed)

**.env.variables**
```bash
API_URL=https://api.example.com
LOG_LEVEL=debug
```

**.env.secrets**
```bash
JWT_SECRET=my-secret-key
API_KEY=sk_test_12345
```

---

## RunnerConfig: dotenvEnabled and dotenvPath

Both fields are on `RunnerConfig` (passed to `runner.load()`):

```typescript
export interface RunnerConfig {
  dotenvEnabled?: boolean;   // Toggle — mirrors the UI toggle, persisted in fastedge-config.test.json
  dotenvPath?: string;       // Directory override — only needed when .env files are not in CWD
  // ...
}
```

### `dotenvEnabled`

The on/off toggle. This is the user-facing setting:
- Controlled by the debugger UI toggle (`ServerPropertiesPanel`)
- Persisted in `fastedge-config.test.json`
- Sent via `POST /api/load` and `PATCH /api/dotenv` request bodies
- Defaults to `true` in the server, `false` in integration tests

### `dotenvPath`

Optional directory path override. Available both in the UI and programmatically:
- **UI (VSCode)**: Browse button in the `.env directory` row → native OS folder dialog via `openFolderPicker` message → extension returns absolute path
- **UI (standalone browser)**: Text input — user types/pastes the path
- **npm package users**: Leave unset. `fastedge-run` uses CWD = your project root, where `.env` files naturally live.
- **Integration tests within this repo**: Set to the fixture directory so test dotenv files are isolated from the repo root.
- **Non-standard layouts**: Monorepos or CI environments where `.env` files aren't at the project root.

Precedence (server-side): client-provided value → `WORKSPACE_PATH` env var (VSCode) → undefined (CWD).

```typescript
// Typical npm user — .env files in project root
await runner.load('./my-app.wasm', { dotenvEnabled: true });

// Integration test — isolated fixture files
await runner.load(wasmPath, {
  dotenvEnabled: true,
  dotenvPath: join(process.cwd(), 'server/__tests__/integration/http-apps/my-suite/fixtures'),
});
```

---

## Implementation Status

### ✅ Completed (February 2026) — ProxyWasmRunner (CDN apps)

- FastEdge host function implementation (`proxy_get_secret`, `proxy_dictionary_get`)
- SecretStore with time-based rotation support
- Dictionary for configuration values
- Type-safe TypeScript interfaces
- Integration into `HostFunctions.ts`
- Dotenv file parsing and loading (`server/utils/dotenv-loader.ts`)
- API endpoint updates (`/api/load` with `dotenvEnabled` parameter)
- Frontend UI for dotenv toggle (`ServerPropertiesPanel` component)
- Support for `.env`, `.env.secrets`, and `.env.variables` files

### ✅ Completed (March 2026) — HttpWasmRunner (HTTP apps)

- `dotenvPath?: string` added to `RunnerConfig`
- `HttpWasmRunner` passes `--dotenv <path>` when `dotenvPath` is set, `--dotenv` (CWD) when just enabled
- `createHttpWasmRunnerWithDotenv()` test helper added
- Integration test coverage: `sdk-variables-and-secrets` suite (6 tests)
- Test fixtures at `server/__tests__/integration/http-apps/sdk-variables-and-secrets/fixtures/.env`

### ✅ Completed (March 2026) — ProxyWasmRunner `dotenvPath` support

- `ProxyWasmRunner.load()` now reads `config.dotenvPath` and stores it as `this.dotenvPath`
- `loadDotenvIfEnabled()` now uses `this.dotenvPath` instead of the hardcoded `"."`
- `createTestRunnerWithDotenv()` helper added to `server/__tests__/integration/utils/test-helpers.ts`

### 🚧 In Progress — CDN variables-and-secrets integration test

All scaffold is in place but blocked on `proxy-wasm-sdk-as` publishing `getEnv()`:
- Test app: `test-applications/cdn-apps/cdn-variables-and-secrets/`
- Integration test: `server/__tests__/integration/cdn-apps/variables-and-secrets/`
- See `context/features/CDN_VARIABLES_AND_SECRETS.md` for full status and how to complete

### ✅ Completed (March 2026) — `dotenvPath` UI in `ServerPropertiesPanel`

- `dotenvPath` promoted from programmatic-only to a first-class UI setting
- New `.env directory` row below the dotenv notice, visible when dotenvEnabled is true
- VSCode: Browse button → `openFolderPicker` postMessage → extension `showOpenDialog({ canSelectFolders: true })` → absolute path returned via `folderPickerResult`
- Standalone browser: text input (browser APIs cannot return absolute paths from a folder picker)
- `dotenvPath` added to `ConfigState`, `configSlice`, `TestConfig`, all API call sites, and all JSON schemas
- `wasmSlice.loadWasm` reads `dotenvPath` from store via `get()` — no signature change to `loadWasm`
- Path change fires `applyDotenv` immediately when WASM loaded; toggle change continues to do a full reload
- Server precedence: client value → `WORKSPACE_PATH` → CWD

### 📝 Notes

- `dotenvEnabled` is the UI/API toggle — it's what the user controls
- `dotenvPath` is now both a UI setting and a programmatic override
- The two fields are intentionally separate: `dotenvEnabled` can be `true` without a path (defaults to CWD)
- For `HttpWasmRunner`, dotenv loading happens inside `fastedge-run` (Rust), not Node.js
- For `ProxyWasmRunner`, dotenv loading happens in Node.js via `dotenv-loader.ts`

---

## WASM Usage Examples

### JavaScript / TypeScript (HTTP apps, wasi-http)

```javascript
import { getSecret } from "fastedge::secret";
import { getEnv } from "fastedge::env";

const jwtSecret = getSecret("JWT_SECRET");
const apiUrl = getEnv("API_URL");
```

### Rust (CDN apps, proxy-wasm)

```rust
use proxy_wasm::traits::*;
use proxy_wasm::types::*;

// Get a secret
let jwt_secret = self.get_property(vec!["secret", "JWT_SECRET"])?;

// Get dictionary value
let api_url = self.get_property(vec!["dictionary", "API_URL"]);
```

---

## Security Notes

⚠️ **Important**: Always add `.env*` files to your `.gitignore`:

```gitignore
# Environment files
.env
.env.*
!.env.example
```

---

## File Hierarchy (priority order)

For both runner types, CLI args/direct config takes priority over dotenv files:

1. CLI args / direct `RunnerConfig` values (highest priority)
2. `.env` file (with `FASTEDGE_VAR_` prefixes)
3. `.env.secrets` / `.env.variables` / `.env.req_headers` / `.env.rsp_headers` (separate files)
4. `fastedge-config.test.json` fallback (lowest priority)

---

## Architecture Reference

- `server/runner/IWasmRunner.ts` — `RunnerConfig` interface with `dotenvEnabled` and `dotenvPath`
- `server/runner/HttpWasmRunner.ts` — builds `--dotenv [path]` args, `dotenvPath` field
- `server/runner/ProxyWasmRunner.ts` — `loadDotenvIfEnabled()` uses `this.dotenvPath`
- `server/utils/dotenv-loader.ts` — Node.js dotenv parser (ProxyWasmRunner only)
- `server/schemas/api.ts` — `dotenvPath` in `ApiLoadBodySchema`
- `server/schemas/config.ts` — `dotenvPath` in `TestConfigSchema`
- `server/server.ts` — precedence logic: client → `WORKSPACE_PATH` → CWD
- `frontend/src/stores/types.ts` — `dotenvPath` in `ConfigState`, `ConfigActions`, `TestConfig`
- `frontend/src/stores/slices/configSlice.ts` — `setDotenvPath`, restore/export
- `frontend/src/stores/slices/wasmSlice.ts` — reads `dotenvPath` from store via `get()`
- `frontend/src/api/index.ts` — `dotenvPath` forwarded in all relevant API calls
- `frontend/src/components/proxy-wasm/ServerPropertiesPanel/` — Browse button (VSCode) / text input (browser)
- `FastEdge-vscode/src/debugger/DebuggerWebviewProvider.ts` — `openFolderPicker` / `folderPickerResult` handler
- `schemas/fastedge-config.test.schema.json` — IDE intellisense for config files
- `schemas/api-load.schema.json` — `POST /api/load` request body schema
- `schemas/api-config.schema.json` — `POST /api/config` config object schema
- `rust_host/fastedge-run/src/dotenv.rs` — Rust `DotEnvInjector` (HttpWasmRunner, via fastedge-run)
- `server/__tests__/integration/utils/http-wasm-helpers.ts` — `createHttpWasmRunnerWithDotenv()`
