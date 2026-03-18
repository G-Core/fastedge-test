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

## RunnerConfig: dotenv

The `dotenv` object on `RunnerConfig` (passed to `runner.load()`) nests the toggle and path together:

```typescript
export interface RunnerConfig {
  dotenv?: {
    enabled?: boolean;  // Toggle — mirrors the UI toggle, persisted in fastedge-config.test.json
    path?: string;      // Directory override — only needed when .env files are not in CWD
  };
  // ...
}
```

### `dotenv.enabled`

The on/off toggle. This is the user-facing setting:
- Controlled by the standalone `DotenvPanel` component (shared by both CDN and HTTP views)
- `setDotenvEnabled` in the store is async — it updates state and calls `PATCH /api/dotenv` immediately if a WASM is loaded
- Persisted in `fastedge-config.test.json` under the `dotenv` object
- Sent via `POST /api/load` and `PATCH /api/dotenv` request bodies
- Defaults to `true` in the server, `false` in integration tests

### `dotenv.path`

Optional directory path override. Available both in the UI and programmatically:
- **UI (VSCode)**: Browse button in the `.env directory` row → native OS folder dialog via `openFolderPicker` message → extension returns absolute path
- **UI (standalone browser)**: Text input — user types/pastes the path
- **npm package users**: Leave unset. `fastedge-run` uses CWD = your project root, where `.env` files naturally live.
- **Integration tests within this repo**: Set to the fixture directory so test dotenv files are isolated from the repo root.
- **Non-standard layouts**: Monorepos or CI environments where `.env` files aren't at the project root.

Precedence (server-side): client-provided value → `WORKSPACE_PATH` env var (VSCode) → undefined (CWD).

```typescript
// Typical npm user — .env files in project root
await runner.load('./my-app.wasm', { dotenv: { enabled: true } });

// Integration test — isolated fixture files
await runner.load(wasmPath, {
  dotenv: {
    enabled: true,
    path: join(process.cwd(), 'server/__tests__/integration/http-apps/my-suite/fixtures'),
  },
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

### ✅ Completed (March 18, 2026) — DotenvPanel standalone component + bug fixes

- Dotenv UI extracted from `ServerPropertiesPanel` into `frontend/src/components/common/DotenvPanel/`
- Used by both `ProxyWasmView` (CDN) and `HttpWasmView` (HTTP) — HTTP was previously missing server sync entirely
- `setDotenvEnabled` and `setDotenvPath` made async in `configSlice`: call `applyDotenv` internally when `wasmPath !== null`
- Views now pass store actions directly — no more duplicated inline wrappers
- Fixed VSCode Browse button: `openFolderPicker` and `folderPickerResult` were missing from the webview wrapper script in `DebuggerWebviewProvider.ts`
- Description text updated to `"Load runtime variables from dotenv path when enabled:"` (generic — covers all `.env*` file formats)
- Dead state removed: `autoSave`, `isDirty`, `lastSaved`, `markDirty`, `markClean` (unbuilt save-config feature scaffolding)
- Server precedence: client value → `WORKSPACE_PATH` → CWD

### ✅ Completed (March 2026) — `DotenvPanel` shared component (refactor)

- Dotenv toggle and path UI extracted from `ServerPropertiesPanel` into a new top-level `DotenvPanel` component
- `DotenvPanel` is shared — sits below the `Request` panel in **both CDN and HTTP debugger views**
- CDN (`ProxyWasmView`): `DotenvPanel` → `ServerPropertiesPanel` → `HookStagesPanel`
- HTTP (`HttpWasmView`): `DotenvPanel` → Logging panel → Response panel
- Toggle in `DotenvPanel` header (right-aligned); expanding the panel reveals the path selector
- Auto-expand when toggled on; auto-collapse when toggled off; user can manually override collapsed state between syncs
- `ServerPropertiesPanel` is now properties-only (toggle and path UI fully removed)
- HTTP view now has full dotenv support — previously absent; uses simple store setters (dotenv is a CLI arg to `fastedge-run`, takes effect on next process start)
- Component lives at `frontend/src/components/common/DotenvPanel/` following the standard folder pattern

### ✅ Completed (March 18, 2026) — DotenvPanel: show resolved app root as default path label

- Default display was showing hardcoded `"workspace root (default)"` — misleading, since the real default is the app root (nearest `fastedge-config.test.json`, or `package.json`/`Cargo.toml`)
- `DotenvPanel` now sends a `getAppRoot` message to the extension on mount and stores the response as `resolvedRoot`
- When `path` is null, displays `resolvedRoot` (dimmed via `.defaultPath` style), falling back to `"app root (default)"` until the response arrives
- All `"workspace root"` references updated to `"app root"` (display text, tooltips, non-VSCode placeholder)
- Fixed vertical alignment issue: `.pathRow` changed from `align-items: center` to `align-items: baseline`
- Added `.defaultPath` CSS class (color `#707070`) to distinguish default from user-set path

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
- `frontend/src/components/common/DotenvPanel/` — shared toggle + path selector (VSCode browse / browser text input); used in both CDN and HTTP views
- `FastEdge-vscode/src/debugger/DebuggerWebviewProvider.ts` — `openFolderPicker` / `folderPickerResult` handler; `getAppRoot` / `appRootResult` handler for default path display
- `schemas/fastedge-config.test.schema.json` — IDE intellisense for config files
- `schemas/api-load.schema.json` — `POST /api/load` request body schema
- `schemas/api-config.schema.json` — `POST /api/config` config object schema
- `rust_host/fastedge-run/src/dotenv.rs` — Rust `DotEnvInjector` (HttpWasmRunner, via fastedge-run)
- `server/__tests__/integration/utils/http-wasm-helpers.ts` — `createHttpWasmRunnerWithDotenv()`
