# Context Index

Read this first, then only the section your task needs. `context/` describes how fastedge-test works **now**, for contributors. Users' docs are in `docs/`. History is `git log`.

fastedge-test is a local debugger and test runner for FastEdge wasm apps: CDN (proxy-wasm) apps and HTTP apps. Its first rule is production parity: an app must succeed and fail here exactly as on the edge (see `CLAUDE.md`, "RULE ZERO").

## The docs

| Doc | Holds |
|---|---|
| `ARCHITECTURE.md` | Processes, entry points, runners, the CDN flow, origins, headers, the HTTP runner, the storage service, frontend, VS Code integration, security boundaries, invariants |
| `BEHAVIOUR.md` | What an app observes: properties, headers, origins, request context, dotenv, secrets, `proxy_http_call`, resources, stores; one table of every known difference from the edge |
| `DEVELOPMENT.md` | Setup, running the debugger and the tests, test rules, test apps and variants, coding conventions, finding things, notes for AI agents |
| `docs/` | Public API, WebSocket protocol, test framework, runner, config schema, debugger CLI (generated from source) |

## Where to start for a task

| Task | Read |
|---|---|
| New to the codebase | `ARCHITECTURE.md` §1–2, then `DEVELOPMENT.md` §1–3 |
| Change a host function, property or header | `BEHAVIOUR.md` (the topic, and "Known differences from the edge"), `ARCHITECTURE.md` §6 and §9, `DEVELOPMENT.md` §7.3–7.4 |
| `proxy_http_call` | `ARCHITECTURE.md` §6 (PAUSE loop), `BEHAVIOUR.md` "proxy_http_call" |
| Origins, built-in origin, file serving | `BEHAVIOUR.md` "Origins", `ARCHITECTURE.md` §7–8 |
| Resources (several apps on one request) | `BEHAVIOUR.md` "Resources", `ARCHITECTURE.md` §12 |
| Cache / Edge KV | `BEHAVIOUR.md` "Stores", `ARCHITECTURE.md` §11 |
| HTTP apps, `fastedge-run`, live preview | `ARCHITECTURE.md` §10 and §13, `BEHAVIOUR.md` "HTTP apps" |
| Dotenv, variables, secrets | `BEHAVIOUR.md` "Dotenv" and "Variables and secrets" |
| Frontend, state, WebSocket events | `ARCHITECTURE.md` §13, `docs/WEBSOCKET.md` |
| Server routes, auth, startup, ports | `ARCHITECTURE.md` §3–4 and §16, `docs/API.md` |
| npm package, bundling, VS Code | `ARCHITECTURE.md` §3 and §14 |
| Writing or fixing tests, adding a test app | `DEVELOPMENT.md` §3–6 and §8 |
| Process, path, signal or shell code | `DEVELOPMENT.md` §7.1 (hard rule) |
| Public API or config schema change | the matching `docs/` file, `DEVELOPMENT.md` §7.5 |

## Searching

```bash
grep -n "^## \|^### " context/ARCHITECTURE.md   # sections, then read just one
grep -rn "<term>" context/ docs/
git log --oneline --grep=<term>                 # commits mentioning a term
git log --oneline -S<code>                      # commits that added or removed code
git log --oneline --follow -- <file>            # history of a file
```
