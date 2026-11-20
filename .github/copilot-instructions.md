# Copilot PR Review Instructions — fastedge-test

## Constitution

This repository is `@gcoredev/fastedge-test` — a Proxy-WASM and HTTP-WASM test runner for FastEdge CDN binaries. It provides a local debugger server, programmatic test framework, and assertion helpers.

### Principles (enforce during review)

1. **Production parity** — Test runner behavior must match the FastEdge CDN runtime. Deviations are bugs, not features.
2. **No over-engineering** — Simple solutions over complex abstractions. Three similar lines > premature abstraction.
3. **Type safety** — TypeScript throughout. No `any` without justification in a comment.
4. **Modular architecture** — Runner, server, test framework, and frontend are independent layers.
5. **Dual audience** — The npm package serves both interactive use (debugger UI) and programmatic use (CI test suites). API design must support both.

### Public API contract

The public API surface is defined by `package.json` exports:
- `.` — Low-level runner (`createRunner`, `createRunnerFromBuffer`)
- `./test` — High-level test framework (`defineTestSuite`, `runTestSuite`, `runAndExit`, `runFlow`)
- `./server` — Debugger server (`startServer`)
- `./schemas` — JSON schema files

Changes to these exports require updated `docs/`, updated tests, and a semver-appropriate version bump.

Full constitution: `.specify/memory/constitution.md`

## Generated Content — `docs/`

Files in `docs/` are **machine-generated** from source code by `./fastedge-plugin-source/generate-docs.sh`. They must not be edited by hand — manual changes will be silently overwritten on the next generation run.

### When reviewing PRs that touch `docs/`:

- **Never** suggest manual edits to any file in `docs/`
- If docs are stale or incorrect, suggest: **Run `./fastedge-plugin-source/generate-docs.sh`**
- If the generated output itself is wrong (e.g., wrong structure, missing section), the fix belongs in `fastedge-plugin-source/.generation-config.md`, not in `docs/` directly
- If a PR modifies `docs/` files without a corresponding source code change, flag it — the change should come from the generation script, not a hand-edit

### When reviewing PRs that change source code covered by `docs/`:

- Check whether the change affects the public API or user-facing behavior
- If yes, and `docs/` was not regenerated in the same PR, **request changes** with:
  > Source code affecting public API was changed but docs/ was not regenerated.
  > Run: `./fastedge-plugin-source/generate-docs.sh`

## Documentation Freshness

### Public API changes (must regenerate docs/)
- New, modified, or removed REST endpoints in `server/server.ts`
- Changes to WebSocket message types or protocol in `server/websocket/`
- Changes to exported types/interfaces in `server/runner/index.ts` or `server/test-framework/index.ts`
- Changes to `package.json` exports
- New or changed CLI flags in `bin/fastedge-debug.js`
- Changes to `schemas/*.schema.json`

### Configuration changes (must update docs/TEST_CONFIG.md)
- Changes to `fastedge-config.test.json` schema or defaults
- New environment variables read by the server
- Changes to dotenv behavior

### Mapping: code location → doc file

| Code path | Doc file |
|-----------|----------|
| `server/server.ts` (endpoints) | `docs/API.md` |
| `server/websocket/` | `docs/WEBSOCKET.md` |
| `server/runner/` | `docs/RUNNER.md` |
| `server/test-framework/` | `docs/TEST_FRAMEWORK.md` |
| `schemas/fastedge-config.test.schema.json` | `docs/TEST_CONFIG.md` |
| `server/server.ts` (startup, port, health) | `docs/DEBUGGER.md` |
| `bin/fastedge-debug.js` | `docs/DEBUGGER.md` |
| `package.json` (exports) | `docs/INDEX.md` |
| `server/stores/`, `server/runner/StoresHost.ts` | `docs/STORES.md` |
| `server/runner/resource.ts`, `schemas/resource-config.schema.json` | `docs/RESOURCES.md` |
| `fastedge-plugin-source/manifest.json` | `.github/copilot-instructions.md` |

### Violation example

> PR adds `POST /api/foo` handler in `server/server.ts` but `docs/API.md` has no `/api/foo` section → **request changes**. Run `./fastedge-plugin-source/generate-docs.sh` before merge.

### Quickstart protection

If any public API signature or behavior changes, check whether `docs/quickstart.md` examples are still accurate. Request regeneration if examples would no longer work against the updated code.

### Pipeline source contract

If `fastedge-plugin-source/manifest.json` lists source files that overlap with files changed in this PR, request that `docs/` is regenerated (run `./fastedge-plugin-source/generate-docs.sh`) to keep the plugin pipeline's source material current.

## Quality Rules

- No `any` types without justification in a comment
- All public endpoints must have corresponding tests
- Production parity: test runner behavior must match FastEdge CDN runtime
- No marketing language in documentation — precise, technical prose only
