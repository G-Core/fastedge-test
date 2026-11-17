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
- `setDotenvEnabled` in the store is synchronous — it updates state only; `App.tsx` triggers a WASM reload when this changes, which re-uploads with the new dotenv state
- Persisted in `fastedge-config.test.json` under the `dotenv` object
- Sent via `POST /api/load` and `PATCH /api/dotenv` request bodies
- UI store default: `false` (users must opt in; panel starts collapsed)
- Server-side API default (`POST /api/load`): `false` when `dotenv.enabled` is omitted from the request body (opt-in)
- Integration tests: explicitly set `false` (unchanged)

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

## Behaviour

### CDN apps (ProxyWasmRunner)

- `loadDotenvIfEnabled()` reads `.env`, `.env.secrets` and `.env.variables` from `dotenv.path`
  (CWD if unset) via `server/utils/dotenv-loader.ts`, and merges the values into the runner's
  secret store and dictionary (dotenv wins over values already configured).
- Apps read them with `proxy_get_secret` / `proxy_dictionary_get`.
- The parser handles `#` comments, quoted values and empty values, and strips the
  `FASTEDGE_VAR_SECRET_` / `FASTEDGE_VAR_ENV_` prefixes.

### HTTP apps (HttpWasmRunner)

- The runner passes `--dotenv <path>` to `fastedge-run` (bare `--dotenv` = CWD); the binary reads
  the files itself. A change takes effect when the process restarts (`applyDotenv()` restarts it).

### API

- `POST /api/load` takes `dotenv: { enabled, path }`. `enabled` defaults to `false` when omitted
  (opt-in), and the server hands `{ enabled, path }` on to `runner.load()`.
- `PATCH /api/dotenv` changes the setting for the loaded app (`runner.applyDotenv()`) without
  re-uploading the WASM.
- Path precedence on the server: client value → `WORKSPACE_PATH` (VS Code) → CWD. A relative path
  is resolved before use (`resolveDotenvPath()`).

### UI: `DotenvPanel`

- `frontend/src/components/common/DotenvPanel/`, shared by the CDN and HTTP views.
- The toggle sits in the panel header; the UI default is off. Switching it on expands the panel,
  off collapses it; loading a config updates the toggle without expanding or collapsing.
- `setDotenvEnabled` / `setDotenvPath` (config slice) call `applyDotenv` when a WASM is loaded.
- `.env directory` row: in VS Code a Browse button opens a native folder dialog
  (`openFolderPicker` → `folderPickerResult`); in a standalone browser it is a text input, since
  browsers cannot return absolute paths from a folder picker.
- When no path is set the panel shows the resolved app root (asked from the extension with
  `getAppRoot`), falling back to "app root (default)".
- `enabled` and `path` are separate on purpose: dotenv can be on without a path (CWD).

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

## Relative Path Resolution

Config files can specify `dotenv.path` as a relative path (e.g., `"./fixtures"`). Relative paths are resolved **against the config file's directory**, not the server's CWD. This ensures the same config file works identically across all loading flows.

### Resolution by flow:

| Flow | Resolution base | Implementation |
|------|----------------|----------------|
| **Test framework CLI** (`loadConfigFile`) | Config file's directory | `suite-runner.ts` resolves before returning |
| **GET /api/config** (default .fastedge-debug) | Config file's directory | `server.ts` resolves before responding |
| **VSCode file picker / auto-load** | Config file's directory | Extension sends `configDir`, frontend resolves before `loadFromConfig` |
| **Browser file drop** | WORKSPACE_PATH (fallback) | Browser security hides full path; `resolveDotenvPath()` in server.ts catches remaining relative paths |

### Example

Given `geo_redirect/fastedge-config.test.json`:
```json
{
  "dotenv": { "enabled": true, "path": "./fixtures" }
}
```

The dotenv path resolves to `geo_redirect/fixtures/` regardless of which flow loads it.

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

- `server/runner/IWasmRunner.ts` — `RunnerConfig` interface with `dotenv: { enabled, path }`
- `server/runner/HttpWasmRunner.ts` — builds `--dotenv [path]` args, `dotenvPath` field
- `server/runner/ProxyWasmRunner.ts` — `loadDotenvIfEnabled()`
- `server/utils/dotenv-loader.ts` — Node.js dotenv parser (ProxyWasmRunner only)
- `server/schemas/api.ts` — `dotenv` in the `/api/load` and `/api/dotenv` body schemas
- `server/schemas/config.ts` — `dotenv` in `TestConfigSchema`
- `server/server.ts` — precedence logic: client → `WORKSPACE_PATH` → CWD; `resolveDotenvPath()` resolves relative paths to absolute; `GET /api/config` resolves dotenv.path against config directory before returning
- `frontend/src/stores/types.ts` — `dotenv` state in `ConfigState`, `ConfigActions`, `TestConfig`
- `frontend/src/stores/slices/configSlice.ts` — `setDotenvPath`, restore/export
- `frontend/src/stores/slices/wasmSlice.ts` — reads the dotenv path from the store via `get()`
- `frontend/src/api/index.ts` — dotenv enabled/path forwarded in the load and dotenv API calls
- `frontend/src/components/common/DotenvPanel/` — shared toggle + path selector (VSCode browse / browser text input); used in both CDN and HTTP views
- `server/test-framework/suite-runner.ts` — `loadConfigFile()` resolves relative dotenv.path against config file directory
- `FastEdge-vscode/src/debugger/DebuggerWebviewProvider.ts` — `openFolderPicker` / `folderPickerResult` handler; `getAppRoot` / `appRootResult` handler for default path display; sends `configDir` in `filePickerResult` message for relative path resolution
- `schemas/fastedge-config.test.schema.json` — IDE intellisense for config files
- `schemas/api-load.schema.json` — `POST /api/load` request body schema
- `schemas/api-config.schema.json` — `POST /api/config` config object schema
- `rust_host/fastedge-run/src/dotenv.rs` — Rust `DotEnvInjector` (HttpWasmRunner, via fastedge-run)
- `server/__tests__/integration/utils/http-wasm-helpers.ts` — `createHttpWasmRunnerWithDotenv()`
