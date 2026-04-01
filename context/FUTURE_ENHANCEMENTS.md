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
