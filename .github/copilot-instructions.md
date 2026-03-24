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

## Documentation Freshness

`docs/` is the single source of truth for public API documentation. When code changes affect the public API or user-facing behavior, **request changes** if the corresponding doc file was not updated in the same PR.

### Public API changes (must update docs/)
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

### Violation example

> PR adds `POST /api/foo` handler in `server/server.ts` but `docs/API.md` has no `/api/foo` section → **request changes**. The endpoint must be documented before merge.

### Quickstart protection

If any public API signature or behavior changes, check whether `docs/quickstart.md` examples are still accurate. Request changes if examples would no longer work against the updated code.

### Pipeline source contract

If `fastedge-plugin-source/manifest.json` lists source files that overlap with files changed in this PR, request that `docs/` is updated to keep the plugin pipeline's source material current.

## Quality Rules

- No `any` types without justification in a comment
- All public endpoints must have corresponding tests
- Production parity: test runner behavior must match FastEdge CDN runtime
- No marketing language in documentation — precise, technical prose only
