# fastedge-test - Project Overview

**📖 For detailed information, see [PROJECT_DETAILS.md](./PROJECT_DETAILS.md)**

---

## Project Goal

fastedge-test is a local replica of the FastEdge edge for debugging and testing wasm apps before deploying them. It ships as a Postman-like debugger UI (also embedded in the VSCode extension) and as the npm package `@gcoredev/fastedge-test` with a programmatic runner and test framework. An app that works here must work on the edge, and fail the same way.

The UI adapts to the loaded binary:

**CDN apps (proxy-wasm):**
- Hook-based execution: onRequestHeaders, onRequestBody, onResponseHeaders, onResponseBody, with a real or built-in origin in between
- Property system with runtime-calculated properties
- FastEdge host functions: secrets, dictionary (dotenv), `proxy_http_call`, `send_http_response`
- Origin: a URL, or a declared built-in origin (echo, fixed response, or a served folder)

**HTTP apps (wasi-http / component model):**
- Postman-like request/response, run through the `fastedge-run` CLI from FastEdge-lib
- SPA preview with a Live mode pointing at the running app

**Multi-app CDN resources:**
- The **Multi-app (CDN resource)** toggle on the Debugger page swaps in the resource view: several CDN apps on one request (one per hook, per rule) and an HTTP app as origin, as on a CDN resource on the edge

**Cache & Edge KV stores:**
- Local cache and Edge KV stores with edge semantics, shared between apps and runs
- The **Storage Explorer** page browses and edits their contents

**Request context:**
- Client and edge context (country, city, ASN, geo, POP...) from presets or explicit values; drives the matching properties and headers

**Common:**
- Automatic WASM type detection (override with `runnerType`)
- Path-based or buffer-based loading; VSCode auto-loads the workspace WASM and reloads on rebuild
- Real-time WebSocket sync across clients (UI, VSCode, agents calling the REST API)
- Log capture with level filtering
- Config save/load (`fastedge-config.test.json`), dotenv toggle

Known differences from the edge are listed in each feature doc in `context/features/`.

---

## Production Context

- **CDN apps**: run on the edge inside nginx (onRequestHeaders) and core-proxy (the other hooks), on a wasmtime host
- **HTTP apps**: run on the FastEdge-lib runtime (`fastedge-run` locally)
- **SDKs**: Gcore proxy-wasm AssemblyScript SDK (https://github.com/G-Core/proxy-wasm-sdk-as), Rust SDK, JS SDK
- **ABI**: Standard proxy-wasm ABI with the FastEdge-specific header format and host functions

---

## Tech Stack

- **Backend**: Node.js + Express + TypeScript
- **Frontend**: React 19 + Vite 7 + TypeScript + Zustand 5 (Immer middleware, auto-save)
- **WASM Runtime**: Node's WebAssembly API with WASI preview1 (CDN apps); `fastedge-run` process (HTTP apps)
- **Stores**: `node:sqlite`
- **WebSocket**: ws 8
- **Port**: 5179, auto-increments through 5179-5228 if busy (configurable via PORT env var)

---

## Philosophy

- **Production Parity**: Test runner must match FastEdge edge behavior exactly
- **No Over-Engineering**: Simple solutions over complex abstractions
- **Type Safety**: TypeScript throughout (frontend + backend)
- **Modular Architecture**: Clean separation of concerns

---

## Quick Start

```bash
pnpm install
pnpm run build
pnpm start  # Server on http://localhost:5179
```

**Development mode:**
```bash
pnpm run dev:backend    # Watch mode on port 5179
pnpm run dev:frontend   # Vite dev server on port 5173 (with proxy)
```

**Debug mode:**
```bash
PROXY_RUNNER_DEBUG=1 pnpm start
```

---

## Key Documentation

**Architecture:**
- [BACKEND_ARCHITECTURE.md](./architecture/BACKEND_ARCHITECTURE.md) - Server structure, runners, npm package
- [FRONTEND_ARCHITECTURE.md](./architecture/FRONTEND_ARCHITECTURE.md) - Pages, React components
- [STATE_MANAGEMENT.md](./architecture/STATE_MANAGEMENT.md) - Zustand patterns

**Features:**
- [RESOURCES.md](./features/RESOURCES.md) - Multi-app CDN resources
- [STORES.md](./features/STORES.md) - Cache and Edge KV, Storage Explorer
- [BUILT_IN_RESPONDER.md](./features/BUILT_IN_RESPONDER.md) - Built-in origin
- [REQUEST_CONTEXT.md](./features/REQUEST_CONTEXT.md) - Client / edge context
- [HTTP_CALL_IMPLEMENTATION.md](./features/HTTP_CALL_IMPLEMENTATION.md) - proxy_http_call PAUSE/resume loop
- [HTTP_WASM_IMPLEMENTATION.md](./features/HTTP_WASM_IMPLEMENTATION.md) - HTTP WASM runner
- [WEBSOCKET_IMPLEMENTATION.md](./features/WEBSOCKET_IMPLEMENTATION.md) - Real-time sync
- [FASTEDGE_IMPLEMENTATION.md](./features/FASTEDGE_IMPLEMENTATION.md) - FastEdge integration
- [PROPERTIES.md](./features/PROPERTIES.md) - Property system

**Development:**
- [IMPLEMENTATION_GUIDE.md](./development/IMPLEMENTATION_GUIDE.md) - Coding patterns
- [TESTING_GUIDE.md](./development/TESTING_GUIDE.md) - How to test

**See [CONTEXT_INDEX.md](./CONTEXT_INDEX.md) for complete documentation map.**

---

## References

- [Gcore Proxy-WASM AssemblyScript SDK](https://github.com/G-Core/proxy-wasm-sdk-as)
- [Proxy-WASM Spec](https://github.com/proxy-wasm/spec)
- [WebAssembly JavaScript API](https://developer.mozilla.org/en-US/docs/WebAssembly)
- [WASI Preview1](https://github.com/WebAssembly/WASI/blob/main/legacy/preview1/docs.md)
