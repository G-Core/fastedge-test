# Context Discovery Index

**🎯 Read this first. Then read only what you need for your task.**

This index helps you discover relevant documentation without reading thousands of lines upfront. Use the decision tree below to find what you need.

`context/` describes **current behaviour and design decisions**. History is `git log` (conventional commits; release notes are generated from them). Open work is tracked outside this repo.

---

## Quick Start

**Project**: fastedge-test, a local debugger and test runner for FastEdge wasm apps (CDN proxy-wasm apps and HTTP apps)
**Purpose**: Postman-like debugger plus a programmatic test framework, with production parity
**Tech Stack**: Node.js + Express + TypeScript (backend) | React + Vite + TypeScript + Zustand (frontend)
**WASM Runtime**: Node WebAssembly API with WASI preview1 (CDN apps); `fastedge-run` process (HTTP apps)
**Port**: 5179 (auto-increments through 5179-5228 if busy)

**Philosophy**: Production parity, no over-engineering, type safety, modular architecture

---

## 📚 Documentation Map

### 🏗️ Architecture (read when modifying structure)

**When to read**: Adding modules, refactoring, structural changes, understanding system design

- `architecture/BACKEND_ARCHITECTURE.md` - Server architecture, runners, module responsibilities, npm package layout
- `architecture/FRONTEND_ARCHITECTURE.md` - Pages, React components, UI organization
- `architecture/STATE_MANAGEMENT.md` - Zustand store, slices, state sync, persistence

### ✨ Features (read when working on specific features)

**When to read**: Implementing, debugging, or modifying a specific feature. Each doc holds the behaviour, the design decisions and any known divergence from the edge.

- `features/CROSS_PLATFORM.md` - ⚠️ **READ BEFORE writing any process, path, signal, or shell code**: platform rules for linux-x64 / darwin-arm64 / win32
- `features/HTTP_CALL_IMPLEMENTATION.md` - proxy_http_call PAUSE/resume loop, binary header format, Rust SDK init order
- `features/STORES.md` - Cache and Edge KV stores (node:sqlite): API, edge semantics, known differences, fixtures, Storage Explorer
- `features/REQUEST_CONTEXT.md` - Client / edge / origin context: presets, per-app-type expansion, explicit-wins rules, Request Context panel
- `features/RESOURCES.md` - Multi-app CDN resources: several apps on one request (one per hook, rules, HTTP-app origin), test and debugger API
- `features/BUILT_IN_RESPONDER.md` - Built-in origin: echo, fixed response, served folder; `x-debugger-status` / `x-debugger-content` control headers
- `features/HTTP_WASM_IMPLEMENTATION.md` - HTTP WASM runner, `fastedge-run` integration, process management, detection, `runnerType` override, UI
- `features/HTTP_WASM_PREVIEW.md` - SPA preview: Live toggle, Open in Browser, runner port via WebSocket, real-time log streaming
- `features/WEBSOCKET_IMPLEMENTATION.md` - Real-time sync between clients, event broadcasting
- `features/FASTEDGE_IMPLEMENTATION.md` - FastEdge CDN integration, secrets, env vars
- `features/PROPERTIES.md` - Property system, runtime calculation, property testing
- `features/PRODUCTION_PARITY_HEADERS.md` - Header serialization, SDK format
- `features/MULTI_VALUE_HEADERS.md` - Multi-value headers: HeaderMap/HeaderTuples/HeaderRecord, Set-Cookie correctness
- `features/CONFIG_SHARING.md` - `fastedge-config.test.json` sharing
- `features/CONFIG_EDITOR.md` - Config editor modal
- `features/DOTENV.md` - Environment variables, dotenv toggle, `dotenvPath` (CDN + HTTP)
- `features/CDN_VARIABLES_AND_SECRETS.md` - CDN env var/secret integration test
- `features/SEND_HTTP_RESPONSE.md` - send_http_response local response short-circuit
- `features/LOG_FILTERING.md` - Log filtering and display
- `features/HYBRID_LOADING.md` - WASM path vs buffer loading, temp file handling
- `features/WORKSPACE_WASM_AUTOLOAD.md` - Auto-loading the workspace wasm

### 🧪 Development (read when implementing/testing)

**When to read**: Writing code, following patterns, testing changes

- `development/IMPLEMENTATION_GUIDE.md` - Coding patterns, conventions, best practices
- `development/TESTING_GUIDE.md` - How to test your changes
- `development/INTEGRATION_TESTING.md` - Integration testing with compiled WASM apps, multi-variant tests, dogfooding the test framework
- `development/TEST_PATTERNS.md` - Testing patterns and examples
- `development/AI_AGENT_API_GUIDE.md` - Agent-specific notes (X-Source header, log filtering); links to `docs/API.md`
- `development/COMPONENT_STYLING_PATTERN.md` - React component UI patterns

### 📖 Overview

- `PROJECT_OVERVIEW.md` - Lightweight project essentials
- `PROJECT_DETAILS.md` - Deep dive into project details
- `DIRECTORY_STRUCTURE.md` - Repo layout
- `VSCODE_BUNDLING.md` - Server bundling for the VSCode extension, auto-start, port auto-increment

### 📦 User-Facing Documentation (read when updating public API or docs)

**When to read**: Updating the npm package API, adding new public exports, or checking what's documented for users

Generated from source code via `fastedge-plugin-source/generate-docs.sh`. Incremental updates preserve manual edits; only incorrect or missing content is changed. See `.generation-config.md` for per-file source mappings and rules.

- `docs/INDEX.md` — Navigation hub, package exports, quick links to all docs
- `docs/quickstart.md` — Getting started: install, interactive debugger, programmatic tests, low-level runner
- `docs/API.md` — Full REST API reference
- `docs/WEBSOCKET.md` — WebSocket protocol, event types, connection lifecycle
- `docs/TEST_FRAMEWORK.md` — Test framework API: suites, assertions, CI integration
- `docs/RUNNER.md` — Low-level runner API: factory functions, IWasmRunner interface, type definitions
- `docs/TEST_CONFIG.md` — `fastedge-config.test.json` schema, dotenv, CDN and HTTP-WASM examples
- `docs/DEBUGGER.md` — Debugger server CLI, programmatic startup, port config, health check

---

## 🧭 Decision Tree: What Should I Read?

### Adding a New Feature

1. Read `development/IMPLEMENTATION_GUIDE.md` (patterns and conventions)
2. Read relevant architecture doc section (`BACKEND_ARCHITECTURE.md` or `FRONTEND_ARCHITECTURE.md`)
3. Grep `context/features/` for similar features
4. Read related feature docs if building on existing features

### Fixing a Bug

1. Read feature-specific doc for the broken feature (including its known differences from the edge)
2. `git log --oneline --grep=<term>` for related changes
3. Read `development/TESTING_GUIDE.md` if you need to add tests
4. Check relevant architecture doc section if the bug involves system structure

### Refactoring Code

1. Read relevant architecture doc (`BACKEND_ARCHITECTURE.md` or `FRONTEND_ARCHITECTURE.md`)
2. Read `development/IMPLEMENTATION_GUIDE.md` for current patterns
3. If refactoring UI components: Read `development/COMPONENT_STYLING_PATTERN.md`
4. Design decisions behind the current shape are in the feature and architecture docs; `git log -S<code>` shows when code changed

### Understanding the System (New to Codebase)

1. Read `PROJECT_OVERVIEW.md`
2. Read `BACKEND_ARCHITECTURE.md` and `FRONTEND_ARCHITECTURE.md` (skim structure, read relevant sections)
3. Read `development/IMPLEMENTATION_GUIDE.md` (patterns you'll follow)
4. Optionally read `PROJECT_DETAILS.md` for deep dive

### Working with WebSocket/Real-time Features

1. Read `features/WEBSOCKET_IMPLEMENTATION.md`
2. Read `architecture/STATE_MANAGEMENT.md` (state sync patterns)

### Working with WASM/Proxy-WASM

1. Read `features/FASTEDGE_IMPLEMENTATION.md` (FastEdge context)
2. Read `features/PRODUCTION_PARITY_HEADERS.md` if dealing with header display/injection
3. Read `features/MULTI_VALUE_HEADERS.md` if dealing with host functions (add/replace/remove/get)
4. Host functions live in `server/runner/HostFunctions.ts`; grep the codebase for examples

### Working with proxy_http_call / HTTP Callouts

1. **Read first**: `features/HTTP_CALL_IMPLEMENTATION.md` (PAUSE loop, binary header format, Rust init order)
2. Read `server/runner/ProxyWasmRunner.ts` (`callHook` PAUSE loop) for implementation
3. Read `server/runner/HostFunctions.ts` (`proxy_http_call` + state fields) for host side
4. See integration test: `server/__tests__/integration/cdn-apps/http-call/http-call.test.ts`

### Working with HTTP WASM (Component Model)

1. Read `features/HTTP_WASM_IMPLEMENTATION.md` (HTTP WASM runner architecture)
2. Read `BACKEND_ARCHITECTURE.md` (runner architecture section)
3. Read `development/TESTING_GUIDE.md` if adding tests

### Adding / Modifying Rust Test Applications

1. Read `development/INTEGRATION_TESTING.md` — full structure, variant system, how to add apps
2. Source: `test-applications/http-apps/rust/basic/` (deprecated `#[fastedge::http]`) and `rust/wasi/` (`#[wstd::http_server]`); both use `fastedge = "0.3"` from crates.io
3. Build: `cd rust/basic && cargo build --release` or `cd rust/wasi && cargo build --release` (both use `wasm32-wasip1` target)
4. Tests: parameterized via `shared/variants.ts` — write once, runs against all variants
5. Legacy detection: `server/utils/legacy-wasm-detect.ts` — self-contained, delete when sync is retired

### Working with HTTP WASM Preview / Live Mode / Logging

1. Read `features/HTTP_WASM_PREVIEW.md` — design rationale and data flow
2. Key facts: runner port flows via `wasm_loaded` WS event → Zustand `httpRunnerPort`; live iframe points directly at `fastedge-run` (no proxy); `fastedge-run` stays alive between requests
3. **Logging**: All `fastedge-run` stdout/stderr is streamed in real-time via `http_wasm_log` WebSocket events and appended to the log panel — covering both explicit Send requests and live mode asset requests.
4. Run tests:
   - `pnpm run test:integration` - All tests (CDN + HTTP in parallel)
   - `pnpm run test:integration:http` - Only HTTP WASM tests (sequential)
   - `pnpm run test:integration:cdn` - Only CDN tests (parallel), run twice: in-process and through the worker (`FASTEDGE_TEST_CDN_RUNNER=worker`)

### WASM Type Detection / `runnerType` Override

Applies when: tests fail because HTTP apps are run as proxy-wasm (or vice versa), or you need to understand how runner selection works.

1. **Detection lives in**: `server/utils/wasmTypeDetector.ts` — uses `WebAssembly.compile()` failure for component-model binaries, plus export inspection (`incoming-handler`, `process`) and import inspection (`wasi:http/`, `wasi:io/`) for core-module HTTP binaries. Tests in `server/__tests__/unit/utils/wasmTypeDetector.test.ts`. Do not add detection logic elsewhere.
2. **Override via `RunnerConfig`**: Add `runnerType: 'http-wasm'` or `runnerType: 'proxy-wasm'` to bypass detection entirely.
3. **Two runner types**: `"http-wasm"` spawns `fastedge-run http` process; `"proxy-wasm"` uses Node WebAssembly API directly.

### Writing Process, Path, Signal, or Shell Code

**Triggers**: spawning child processes, killing processes, file paths, temp files, shell scripts, package.json scripts, port handling, graceful shutdown

1. **Always read first**: `features/CROSS_PLATFORM.md` — rules, patterns, and what's already handled
2. Check `server/utils/fastedge-cli.ts` as the reference implementation for platform branching

### Server Startup, Port Selection, and `bin/fastedge-debug.js`

`dist/server.js` unconditionally calls `startServer()` on load. This works for both the CLI (`bin/fastedge-debug.js` does `import("../dist/server.js")`) and the VSCode extension (`fork()`). Library consumers use `dist/lib/` entry points, which do not auto-start.

1. `startServer()` probes ports 5179-5228 via HTTP `/health` check (50 slots, enough for Codespaces / multi-session workflows); first available port wins
2. Port file written to `{WORKSPACE_PATH || cwd()}/.fastedge-debug/.debug-port`
3. Startup messages go to stderr (`console.error()`) so an MCP stdio transport is not corrupted
4. No `require.main === module` guard: it fails when the bundled CJS is loaded via dynamic `import()`

Key files: `server/server.ts` (startServer, port probing, port file), `bin/fastedge-debug.js` (CLI entry). See `BACKEND_ARCHITECTURE.md` → "npm Package".

### Testing Changes

1. Read `development/TESTING_GUIDE.md` (how to test)
2. Read `development/TEST_PATTERNS.md` (testing patterns and examples)
3. Read feature-specific doc for the feature you're testing

### Working with Integration Tests

1. Read `development/INTEGRATION_TESTING.md` (comprehensive integration testing guide)
   - **⚠️ MANDATORY**: Read the "Dogfood the Test Framework" section — all integration tests (CDN and HTTP) must use framework helpers (`runFlow`/`runHttpRequest` + assertion helpers from `server/test-framework/`), not raw `expect()` calls
2. Read `development/TESTING_GUIDE.md` (overall testing approach)
3. Read `development/TEST_PATTERNS.md` (testing patterns and conventions)
4. Read relevant feature doc for what you're testing (e.g., `features/PROPERTIES.md`)

### CDN Variables and Secrets Integration Test

Parameterized via `shared/variants.ts` (AS + Rust).

Test file: `server/__tests__/integration/cdn-apps/variables-and-secrets/variables-and-secrets.test.ts`
WASM apps: `test-applications/cdn-apps/as/cdn-variables-and-secrets/` + `test-applications/cdn-apps/rust/cdn-variables-and-secrets/`
Variant system: `server/__tests__/integration/cdn-apps/shared/variants.ts`

### Writing CDN Integration Tests (choosing origin strategy)

1. **Default**: Use `"built-in"` as targetUrl — no port allocation, no process spawning, much faster
2. Read `features/BUILT_IN_RESPONDER.md` for control headers (`x-debugger-status`, `x-debugger-content`)
3. **Only use http-responder** when you need to validate real HTTP fetch behavior (network headers, connection handling)
4. **Only use a real URL** when testing against a specific external service

### Working with send_http_response / Local Response Short-Circuit

1. Read `features/SEND_HTTP_RESPONSE.md` — design, runner implementation, test app, integration tests
2. Short-circuit check after `onRequestHeaders` is in `server/runner/ProxyWasmRunner.ts`
3. `localResponse` state and `proxy_send_local_response` are in `server/runner/HostFunctions.ts`
4. Test app: `test-applications/cdn-apps/as/cdn-redirect/` — redirect example
5. Integration tests: `server/__tests__/integration/cdn-apps/redirect/cdn-redirect.test.ts`

### Working with Properties System

1. Read `features/PROPERTIES.md`
2. Host side: `server/runner/PropertyResolver.ts`, `server/runner/HostFunctions.ts`

### API Changes or New Endpoints

1. Read `docs/API.md` (canonical API reference — update this when endpoints change)
2. Read `BACKEND_ARCHITECTURE.md` (API layer architecture)

### Working on the npm Package (@gcoredev/fastedge-test)

1. Read `BACKEND_ARCHITECTURE.md` → "npm Package" (exports, build outputs, what is published)
2. Read `docs/API.md` (exports map aligns with API surface)
3. Read `docs/TEST_FRAMEWORK.md` for the user-facing API surface (test framework + runner)

---

## 🔍 Search Tips

### Behaviour and Decisions: grep the docs

```bash
# Find all docs mentioning a topic
grep -ril "websocket" context/

# Behaviour and design decisions for a feature
grep -rn "dotenv" context/features/

# Find a section in a large doc
grep -n "^## " context/development/IMPLEMENTATION_GUIDE.md
```

### History: git log

```bash
# Commits mentioning a term
git log --oneline --grep=<term>

# Commits that added or removed a piece of code
git log --oneline -S<code>

# History of one file
git log --oneline -- server/runner/ProxyWasmRunner.ts
```

See `SEARCH_GUIDE.md` for more patterns.

---

## 📊 Documentation Size Reference

**Small** (read in full when needed): `PROJECT_OVERVIEW.md`, `DIRECTORY_STRUCTURE.md`, most `features/*.md`, `development/AI_AGENT_API_GUIDE.md`

**Medium** (read sections as needed): `development/TESTING_GUIDE.md`, `development/COMPONENT_STYLING_PATTERN.md`, `development/INTEGRATION_TESTING.md`, `PROJECT_DETAILS.md`

**Large** (search or read specific sections): `development/TEST_PATTERNS.md`, `development/IMPLEMENTATION_GUIDE.md`, `architecture/*.md`

---

## ⚡ Quick Action Patterns

**Pattern 1: Feature Implementation**

```
Read: IMPLEMENTATION_GUIDE.md + relevant architecture doc section + feature doc
Grep: context/features/ for similar features
```

**Pattern 2: Bug Fix**

```
Read: Feature doc for broken feature + TESTING_GUIDE.md
Search: git log --oneline --grep=<feature>
```

**Pattern 3: WASM Work**

```
Read: FASTEDGE_IMPLEMENTATION.md sections + relevant feature doc
Grep: codebase for examples
```
