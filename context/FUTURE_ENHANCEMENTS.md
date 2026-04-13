# Future Enhancements

Planned improvements and feature ideas for `@gcoredev/fastedge-test`. Items are roughly prioritized.

---

## CLI Config Runner (`--config` flag)

**Problem**: Developers without the FastEdge VSCode extension have no quick way to run a `fastedge-config.test.json` fixture against a built WASM binary. Today they must either write a programmatic test script or manually drive the debugger server via curl.

**Proposed Solution**: Add a `--config` flag to the `fastedge-debug` CLI:

```bash
npx fastedge-debug --config ./fixtures/germany.test.json --wasm ./dist/handler.wasm
```

**Behavior**:
1. Read the `fastedge-config.test.json` file
2. Load the WASM from `--wasm` flag (falls back to `config.wasm.path`)
3. Apply dotenv settings from the config
4. Execute the request with the config's properties, headers, and body
5. Print the response (status, headers, body) to stdout
6. Exit with code 0 (success) or 1 (failure)

**Batch mode** (run all fixtures in a directory):

```bash
npx fastedge-debug --config ./fixtures/ --wasm ./dist/handler.wasm
```

Discovers all `*.test.json` files, runs each, prints a summary table.

**Why this matters**:
- Bridges the gap between "click Load Config in VSCode" and "write a test script"
- Enables CI pipelines to run fixture configs without custom test harnesses
- Makes fixtures a first-class portable testing artifact across all IDEs
- Low implementation cost: `loadConfigFile()`, `createRunner()`, and `runFlow()`/`runHttpRequest()` already exist

**Implementation notes**:
- Add argument parsing to `bin/fastedge-debug.js` (detect `--config` before starting the server)
- Reuse `loadConfigFile()` from `server/test-framework/suite-runner.ts`
- Reuse `createRunner()` + `runFlow()`/`runHttpRequest()` from the test framework
- Auto-detect CDN vs HTTP-WASM from the loaded binary to choose the right execution path
- Consider a `--json` flag for machine-readable output

---

## Response Preview: Content-Type Aware Rendering

**Problem**: The debugger's response preview currently only handles plain-text and HTML responses. FastEdge apps can respond with many other content types — PDFs (`application/pdf`), SVGs (`image/svg+xml`), images (`image/png`, `image/jpeg`), etc. — but these render as raw binary gibberish or are not displayed at all in the preview pane.

**Proposed Solution**: Make the response preview Content-Type aware, rendering each response body appropriately based on its `Content-Type` header.

**Rendering strategies by type**:
- `text/plain`, `text/html` — existing behavior (text / HTML preview)
- `image/svg+xml` — render inline as SVG
- `image/png`, `image/jpeg`, `image/gif`, `image/webp` — render as `<img>` with a data URI (`data:{mime};base64,...`)
- `application/pdf` — embed via `<iframe>` or `<object>` with a data URI, or offer a download link
- `application/json` — syntax-highlighted, collapsible JSON tree
- `application/octet-stream` / unknown — hex dump preview + download link

**Why this matters**:
- Several existing examples (PDF generation, image manipulation, SVG rendering) produce non-text responses that developers need to verify visually
- Without proper preview, developers must save the response body to a file and open it externally — breaking the debugger's fast feedback loop
- Content-Type aware rendering makes the debugger useful for the full range of FastEdge use cases, not just text-based apps

---

## Hot Dotenv Reload + Secret Rollover / Slots

**Problem**: The debugger currently loads `.env` files once at WASM startup. There is no way to update secrets at runtime without restarting the runner. This means the `secret_rollover` example (which uses `secret::get_effective_at()` with slot-based lookup) cannot be meaningfully tested in the debugger — the slot values are static and never change.

**Research needed**:
1. **Hot dotenv reload**: Can the debugger detect `.env` file changes (via file watcher or manual trigger) and push updated env vars / secrets into the running WASM instance without restarting?
2. **Slot-based secrets in the debugger**: How should the debugger model the `get_effective_at(slot)` API? The real FastEdge server maintains a history of secret values keyed by slot. The debugger currently only has "current" values from `.env.secrets`.
3. **Fixture support**: Should `fastedge-config.test.json` support defining multiple secret versions with slot values? e.g.:
   ```json
   {
     "secrets": {
       "TOKEN_SECRET": [
         { "slot": 0, "value": "original-token" },
         { "slot": 1719849600, "value": "rotated-token" }
       ]
     }
   }
   ```
4. **UI considerations**: How should the debugger UI expose secret history / slot editing? Could be a timeline or version list per secret.

**Context**: The `secret_rollover` example in `FastEdge-sdk-rust/examples/http/wasi/secret_rollover/` uses `x-slot` and `x-secret-name` request headers to query secrets at specific slots. The fixtures (`current.test.json`, `slot.test.json`) exercise this but currently only test against static dotenv values.

**Why this matters**:
- Secret rotation is a real production pattern (API key rollover, certificate rotation)
- Without slot support in the debugger, developers can't verify their rollover logic locally
- Hot reload would also benefit general development workflow (change an env var without restarting)
