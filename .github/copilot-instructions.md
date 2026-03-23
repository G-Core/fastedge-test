# Copilot PR Review Instructions — fastedge-test

## Constitution

This repository's working agreement is defined in `.specify/memory/constitution.md`. All review guidance below derives from that constitution.

## Documentation Freshness

When reviewing PRs, check whether code changes affect any of the following and flag if `docs/` was not updated accordingly:

### Public API changes (must update docs/)
- New, modified, or removed REST endpoints in `server/server.ts` or `server/routes/`
- Changes to WebSocket message types or protocol
- Changes to exported types/interfaces in `server/runner/index.ts` or `server/test-framework/index.ts`
- Changes to `package.json` exports
- New or changed CLI flags in `bin/fastedge-debug.js`
- Changes to `schemas/*.schema.json`

### Configuration changes (must update docs/TEST_CONFIG.md)
- Changes to `fastedge-config.test.json` schema or defaults
- New environment variables read by the server
- Changes to dotenv behavior

### Mapping: code location -> doc file
| Code path | Doc file |
|-----------|----------|
| `server/server.ts`, `server/routes/` | `docs/API.md` |
| `server/test-framework/` | `docs/TEST_FRAMEWORK.md` |
| `schemas/fastedge-config.test.schema.json` | `docs/TEST_CONFIG.md` |
| `server/server.ts` (startup, port, health) | `docs/DEBUGGER.md` |

### Pipeline source contract
If `fastedge-plugin-source/.generation-config.md` exists, check whether changed source files overlap with those listed in it. If so, flag that `docs/` may need updating to keep the plugin pipeline's source material current.

## Quality Rules

- No `any` types without justification in comment
- All public endpoints must have corresponding tests
- Production parity: test runner behavior must match FastEdge CDN runtime
