# CDN Variables and Secrets

How env vars, dictionary entries and secrets reach CDN (proxy-wasm) apps, and the integration test
that covers them (the CDN counterpart of the HTTP `variables-and-secrets` suite).

- Test: `server/__tests__/integration/cdn-apps/variables-and-secrets/variables-and-secrets.test.ts`,
  run against every CDN language variant (AssemblyScript and Rust).
- Apps: `test-applications/cdn-apps/as/cdn-variables-and-secrets/` and
  `test-applications/cdn-apps/rust/cdn-variables-and-secrets/`.
- Fixtures: `fixtures/.env` with `FASTEDGE_VAR_ENV_USERNAME`, `FASTEDGE_VAR_ENV_LARGE_DATA` and
  `FASTEDGE_VAR_SECRET_PASSWORD`, loaded with `runner.load(buffer, { dotenv: { enabled: true, path } })`
  (helper: `createTestRunnerWithDotenv()` in `server/__tests__/integration/utils/test-helpers.ts`).

## Test Coverage

| Test | Assertion |
|------|-----------|
| loads WASM | `runner.getType() === 'proxy-wasm'` |
| `getEnv("USERNAME")` (WASI env) | logged; `x-env-username` request header |
| `getDictionary("LARGE_DATA")` (`proxy_dictionary_get`) | logged; `x-dict-large-data` request header |
| `getSecret("PASSWORD")` (`proxy_get_secret`) | logged; `x-env-password` request header |
| consistency | same values across repeated hook calls |
| return code | `Continue` (0) |

## Architecture Notes

### Three access surfaces

```
fixtures/.env
  FASTEDGE_VAR_ENV_USERNAME=…     → WASI env USERNAME + dictionary USERNAME
  FASTEDGE_VAR_ENV_LARGE_DATA=…   → WASI env LARGE_DATA + dictionary LARGE_DATA
  FASTEDGE_VAR_SECRET_PASSWORD=…  → SecretStore PASSWORD
        ↓ (server/utils/dotenv-loader.ts)
  getEnv(name)        → WASI environ (small values)
  getDictionary(name) → proxy_dictionary_get host function (large values)
  getSecret(name)     → proxy_get_secret host function
```

The WASI env is the dictionary's contents. When the dictionary is empty the runner sets a
`__FASTEDGE_RUNNER__` sentinel, because Node's WASI `environ_get` rejects an empty table (which
breaks the AssemblyScript shim) while the edge always provides one (`createImports()` in
`ProxyWasmRunner.ts`).

### Difference from HTTP apps

HTTP apps get dotenv from `fastedge-run` (Rust): the runner passes `--dotenv <path>`. CDN apps use
the Node.js `dotenv-loader.ts`, which fills the dictionary, WASI env and `SecretStore` directly.
Both use the same `RunnerConfig.dotenv` API. See [DOTENV.md](DOTENV.md).
