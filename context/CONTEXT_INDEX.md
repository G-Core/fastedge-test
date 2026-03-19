# Context Discovery Index

**🎯 Read this first. Then read only what you need for your task.**

This index helps you discover relevant documentation without reading thousands of lines upfront. Use the decision tree below to find what you need.

---

## Quick Start

**Project**: Proxy-WASM Test Runner for FastEdge CDN binaries
**Purpose**: Postman-like test runner for debugging proxy-wasm binaries locally
**Tech Stack**: Node.js + Express + TypeScript (backend) | React + Vite + TypeScript + Zustand (frontend)
**WASM Runtime**: Node WebAssembly API with WASI preview1
**Port**: 5179

**Current Branch**: See git status
**Philosophy**: Production parity, no over-engineering, type safety, modular architecture

---

## 📚 Documentation Map

### 🏗️ Architecture (read when modifying structure)

**When to read**: Adding modules, refactoring, structural changes, understanding system design

- `architecture/BACKEND_ARCHITECTURE.md` (994 lines) - Server architecture, file organization, module responsibilities
- `architecture/FRONTEND_ARCHITECTURE.md` (1,500 lines) - React components, state management, UI organization
- `architecture/STATE_MANAGEMENT.md` (1,969 lines) - Zustand implementation, state sync, persistence
- `architecture/ZUSTAND_ARCHITECTURE.md` (1,300 lines) - Zustand design document, slices pattern, architecture decisions

### ✨ Features (read when working on specific features)

**When to read**: Implementing, debugging, or modifying a specific feature

- `features/CROSS_PLATFORM.md` (~100 lines) - ⚠️ **READ BEFORE writing any process, path, signal, or shell code** — platform rules for linux-x64 / darwin-arm64 / win32, what's already handled, known limitations
- `features/HTTP_CALL_IMPLEMENTATION.md` (~200 lines) - ✅ proxy_http_call PAUSE/resume loop, binary header format, Rust SDK init order (NEW)
- `features/NPM_PACKAGE_PLAN.md` (~250 lines) - ✅ Full 5-phase plan for @gcoredev/fastedge-test npm package (Phases 1-4 complete)
- `features/HTTP_WASM_IMPLEMENTATION.md` (~400 lines) - ✅ HTTP WASM runner support, FastEdge-run CLI integration, process management; detection + `runnerType` override section is current (Mar 2026); API section is outdated
- `features/HTTP_WASM_UI.md` (~1,200 lines) - ✅ Postman-like UI for HTTP WASM, adaptive UI architecture, component organization (NEW - Feb 10, 2026)
- `features/HTTP_WASM_PREVIEW.md` (~120 lines) - ✅ SPA preview: Live toggle (srcDoc vs src iframe), Open in Browser button, runner port via WebSocket, preview sizing fix, active tab hover fix (Mar 2026)
- `WEBSOCKET_IMPLEMENTATION.md` (586 lines) - Real-time sync between clients, event broadcasting
- `FASTEDGE_IMPLEMENTATION.md` (645 lines) - FastEdge CDN integration, secrets, env vars
- `PROPERTY_IMPLEMENTATION_COMPLETE.md` (495 lines) - Property system, runtime calculation
- `PRODUCTION_PARITY_HEADERS.md` (421 lines) - Header serialization, G-Core SDK format
- `CONFIG_SHARING.md` (281 lines) - fastedge-config.test.json sharing system
- `DOTENV.md` (~210 lines) - Environment variable system, dotenvPath support (CDN + HTTP)
- `CDN_VARIABLES_AND_SECRETS.md` (~120 lines) - ✅ CDN env var/secret integration test (7 tests); requires proxy-wasm-sdk-as@^1.2.2
- `DOTENV_TOGGLE_IMPLEMENTATION.md` (294 lines) - UI toggle for .env variables
- `LOG_FILTERING.md` (147 lines) - Log filtering and display
- `HYBRID_LOADING.md` (~550 lines) - WASM path vs buffer loading: performance benchmarks, Runner internals, temp file handling, migration guide
- `PROPERTY_TESTING.md` (285 lines) - Property system testing patterns

### 🧪 Development (read when implementing/testing)

**When to read**: Writing code, following patterns, testing changes

- `IMPLEMENTATION_GUIDE.md` (1,102 lines) - Coding patterns, conventions, best practices
- `TESTING_GUIDE.md` (350 lines) - How to test your changes
- `development/INTEGRATION_TESTING.md` (450 lines) - ✅ Integration testing with compiled WASM applications
- `TEST_PATTERNS.md` (825 lines) - Testing patterns and examples
- `AI_AGENT_API_GUIDE.md` - Agent-specific notes (X-Source header, log filtering, TDD pointer); links to `docs/API.md` for full reference
- `COMPONENT_STYLING_PATTERN.md` (355 lines) - React component UI patterns

### 📖 Reference (search on-demand, don't read linearly)

**When to read**: Debugging, understanding past decisions, historical context

- `CHANGELOG.md` (~4,287 lines, Feb 2026+) - **Use grep to search**, don't read all
- `legacy/CHANGELOG_ARCHIVE.md` (~1,371 lines, Jan 2026 and earlier) - archived entries
- `PROJECT_OVERVIEW.md` (100 lines) - Lightweight project essentials
- `PROJECT_DETAILS.md` (400 lines) - Deep dive into project details

### 🔧 WASM/Technical (read when working with WASM)

**When to read**: Debugging WASM, implementing host functions, understanding proxy-wasm ABI

- `wasm/wasm-host-functions.md` (58 lines) - Host function implementations
- `wasm/wasm-properties-code.md` (81 lines) - Property system WASM details
- `wasm/wasm-change-header-code.md` (218 lines) - Header modification in WASM
- `wasm/wasm-print-debugger.md` (132 lines) - Debug tools for WASM

### 📦 User-Facing Documentation (read when updating public API or docs)

**When to read**: Updating the npm package API, adding new public exports, or checking what's documented for users

- `docs/TEST_FRAMEWORK.md` — User guide for `@gcoredev/fastedge-test`: test suites, runner API, assertions, CI usage
- `docs/LOCAL_SERVER.md` — Local debugger server: launch, UI, REST endpoints summary
- `docs/TEST_CONFIG.md` — `fastedge-config.test.json` schema, dotenv runtime secrets, CDN and HTTP-WASM examples
- `docs/API.md` — Full REST API reference (custom tooling / CI use cases)

### 🗄️ Legacy/Archived (rarely needed)

- `legacy/starter.md` (20 lines) - Old starter documentation
- `legacy/backend-server.md` (27 lines) - Old backend notes
- `legacy/CHANGELOG_ARCHIVE.md` (~1,371 lines) - Jan 2026 and earlier changelog entries

---

## 🧭 Decision Tree: What Should I Read?

### Adding a New Feature

1. Read `IMPLEMENTATION_GUIDE.md` (patterns and conventions)
2. Read relevant architecture doc section (`BACKEND_ARCHITECTURE.md` or `FRONTEND_ARCHITECTURE.md`)
3. Grep `CHANGELOG.md` for similar past features
4. Read related feature docs if building on existing features

### Fixing a Bug

1. Read feature-specific doc for the broken feature
2. Grep `CHANGELOG.md` for the feature name or bug keywords
3. Read `TESTING_GUIDE.md` if you need to add tests
4. Check relevant architecture doc section if the bug involves system structure

### Refactoring Code

1. Read relevant architecture doc (`BACKEND_ARCHITECTURE.md` or `FRONTEND_ARCHITECTURE.md`)
2. Read `IMPLEMENTATION_GUIDE.md` for current patterns
3. If refactoring UI components: Read `COMPONENT_STYLING_PATTERN.md`
4. Grep `CHANGELOG.md` to understand past refactoring decisions

### Understanding the System (New to Codebase)

1. Read `PROJECT_OVERVIEW.md` (lightweight, 100 lines)
2. Read `BACKEND_ARCHITECTURE.md` and `FRONTEND_ARCHITECTURE.md` (skim structure, read relevant sections)
3. Read `IMPLEMENTATION_GUIDE.md` (patterns you'll follow)
4. Optionally read `PROJECT_DETAILS.md` for deep dive

### Working with WebSocket/Real-time Features

1. Read `WEBSOCKET_IMPLEMENTATION.md`
2. Read `STATE_MANAGEMENT.md` (state sync patterns)
3. Grep `CHANGELOG.md` for "websocket" or "sync"

### Working with WASM/Proxy-WASM

1. Read relevant `wasm/*.md` file for your specific task
2. Read `FASTEDGE_IMPLEMENTATION.md` (FastEdge context)
3. Read `PRODUCTION_PARITY_HEADERS.md` if dealing with headers
4. Grep for examples in codebase

### Working with proxy_http_call / HTTP Callouts

1. **Read first**: `features/HTTP_CALL_IMPLEMENTATION.md` (PAUSE loop, binary header format, Rust init order)
2. Read `server/runner/ProxyWasmRunner.ts` (`callHook` PAUSE loop) for implementation
3. Read `server/runner/HostFunctions.ts` (`proxy_http_call` + state fields) for host side
4. See integration test: `server/__tests__/integration/cdn-apps/http-call/http-call.test.ts`

### Working with HTTP WASM (Component Model)

1. Read `features/HTTP_WASM_IMPLEMENTATION.md` (HTTP WASM runner architecture — note: API section is outdated, detection section is current)
2. Read `BACKEND_ARCHITECTURE.md` (runner architecture section)
3. Read `TESTING_GUIDE.md` if adding tests

### Working with HTTP WASM Preview / Live Mode / Logging

1. Read `features/HTTP_WASM_PREVIEW.md` — full design rationale, data flow, files changed
2. Key facts: runner port flows via `wasm_loaded` WS event → Zustand `httpRunnerPort`; live iframe points directly at `fastedge-run` (no proxy); `fastedge-run` stays alive between requests
3. **Logging**: All `fastedge-run` stdout/stderr is streamed in real-time via `http_wasm_log` WebSocket events and appended to the log panel — covering both explicit Send requests and live mode asset requests. See "Real-Time Log Streaming" section in `HTTP_WASM_PREVIEW.md`.
4. Run tests:
   - `pnpm run test:integration` - All tests (CDN + HTTP in parallel)
   - `pnpm run test:integration:http` - Only HTTP WASM tests (sequential)
   - `pnpm run test:integration:cdn` - Only CDN tests (parallel)

### WASM Type Detection / `runnerType` Override

Applies when: tests fail because HTTP apps are run as proxy-wasm (or vice versa), or you need to understand how runner selection works.

1. **Detection lives in**: `server/utils/wasmTypeDetector.ts` — uses `WebAssembly.compile()` failure to identify component-model (HTTP) binaries. This is the canonical detector; do not add detection logic elsewhere.
2. **Override via `RunnerConfig`**: Add `runnerType: 'http-wasm'` or `runnerType: 'proxy-wasm'` to bypass detection entirely.
3. **Two runner types**: `"http-wasm"` spawns `fastedge-run http` process; `"proxy-wasm"` uses Node WebAssembly API directly.
4. Grep `CHANGELOG.md` for `"WASM Type Detection"` for full fix history (March 5, 2026).

### Writing Process, Path, Signal, or Shell Code

**Triggers**: spawning child processes, killing processes, file paths, temp files, shell scripts, package.json scripts, port handling, graceful shutdown

1. **Always read first**: `features/CROSS_PLATFORM.md` — rules, patterns, and what's already handled
2. Check `server/utils/fastedge-cli.ts` as the reference implementation for platform branching

### Testing Changes

1. Read `TESTING_GUIDE.md` (how to test)
2. Read `TEST_PATTERNS.md` (testing patterns and examples)
3. Read feature-specific doc for the feature you're testing

### Working with Integration Tests

1. Read `development/INTEGRATION_TESTING.md` (comprehensive integration testing guide)
2. Read `TESTING_GUIDE.md` (overall testing approach)
3. Read `TEST_PATTERNS.md` (testing patterns and conventions)
4. Read relevant feature doc for what you're testing (e.g., `PROPERTY_IMPLEMENTATION_COMPLETE.md`)

### CDN Variables and Secrets Integration Test

✅ Complete — 7 tests passing. Requires `proxy-wasm-sdk-as@^1.2.2` (published, installed).

Test file: `server/__tests__/integration/cdn-apps/variables-and-secrets/variables-and-secrets.test.ts`
WASM app: `test-applications/cdn-apps/cdn-variables-and-secrets/`
WASM output: `wasm/cdn-apps/variables-and-secrets/variables-and-secrets.wasm`

### Working with Properties System

1. Read `PROPERTY_IMPLEMENTATION_COMPLETE.md`
2. Read `PROPERTY_TESTING.md` if testing
3. Read `wasm/wasm-properties-code.md` for WASM details

### API Changes or New Endpoints

1. Read `docs/API.md` (canonical API reference — update this when endpoints change)
2. Read `BACKEND_ARCHITECTURE.md` (API layer architecture)
3. Grep `CHANGELOG.md` for similar API changes

### Working on the npm Package (@gcoredev/fastedge-test)

1. **Always read first**: `features/NPM_PACKAGE_PLAN.md` (full 5-phase plan, current status, all specs)
2. Read `BACKEND_ARCHITECTURE.md` (runner section) for Phase 2 (runner isolation)
3. Read `docs/API.md` for Phase 3 (exports map aligns with API surface)
4. Grep `CHANGELOG.md` for "npm" or "Phase" for history of what's been done
5. Read `docs/TEST_FRAMEWORK.md` for the user-facing API surface (test framework + runner)

---

## 🔍 Search Tips

### Don't Read CHANGELOG.md Linearly

It's ~4,287 lines (Feb 2026+)! Use grep instead. For Jan 2026 and earlier, grep `legacy/CHANGELOG_ARCHIVE.md`:

```bash
# Find when feature was implemented
grep -i "feature-name" context/CHANGELOG.md

# Find bug fixes
grep -i "fix.*bug-keyword" context/CHANGELOG.md

# Find recent changes to a file
grep -i "filename" context/CHANGELOG.md
```

### Search Across Feature Docs

```bash
# Find all docs mentioning a topic
grep -r "websocket" context/*.md

# Find implementation patterns
grep -r "pattern-name" context/IMPLEMENTATION_GUIDE.md
```

### Use Section Headers in Large Docs

Large docs like `IMPLEMENTATION_GUIDE.md` and architecture docs have clear section headers. Use grep to find the section you need:

```bash
# Find specific section
grep -n "## Section Name" context/IMPLEMENTATION_GUIDE.md
```

---

## 📊 Documentation Size Reference

**Tiny** (read in full when needed):

- PROJECT_OVERVIEW.md: ~100 lines
- wasm-host-functions.md: ~58 lines

**Small** (quick read):

- DOTENV.md: ~169 lines
- LOG_FILTERING.md: ~147 lines
- CONFIG_SHARING.md: ~281 lines

**Medium** (read sections as needed):

- TESTING_GUIDE.md: ~350 lines
- COMPONENT_STYLING_PATTERN.md: ~355 lines
- PRODUCTION_PARITY_HEADERS.md: ~421 lines
- development/INTEGRATION_TESTING.md: ~450 lines
- PROPERTY_IMPLEMENTATION_COMPLETE.md: ~495 lines
- WEBSOCKET_IMPLEMENTATION.md: ~586 lines
- AI_AGENT_API_GUIDE.md: ~601 lines
- FASTEDGE_IMPLEMENTATION.md: ~645 lines

**Large** (search or read specific sections):

- TEST_PATTERNS.md: ~825 lines
- BACKEND_ARCHITECTURE.md: ~994 lines
- IMPLEMENTATION_GUIDE.md: ~1,102 lines
- ZUSTAND_ARCHITECTURE.md: ~1,300 lines
- FRONTEND_ARCHITECTURE.md: ~1,500 lines
- STATE_MANAGEMENT.md: ~1,969 lines

**Very Large** (use grep, never read linearly):

- CHANGELOG.md: ~4,287 lines (Feb 2026+; Jan 2026 and earlier in `legacy/CHANGELOG_ARCHIVE.md`)

---

## ⚡ Quick Action Patterns

**Pattern 1: Feature Implementation**

```
Read: IMPLEMENTATION_GUIDE.md + relevant architecture doc section + feature doc
Grep: CHANGELOG.md for similar features
Time: 5-10 minutes of reading vs. 20-30 minutes reading everything
```

**Pattern 2: Bug Fix**

```
Read: Feature doc for broken feature + TESTING_GUIDE.md
Grep: CHANGELOG.md for feature history
Time: 3-5 minutes of reading
```

**Pattern 3: WASM Work**

```
Read: Relevant wasm/*.md file + FASTEDGE_IMPLEMENTATION.md sections
Grep: Codebase for examples
Time: 5-7 minutes of reading
```

---

**Last Updated**: March 2026
