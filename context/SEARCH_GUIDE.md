# How to Search Context Effectively

**Don't read everything. Search for what you need.**

- **Behaviour and design decisions** → `context/features/` (one doc per feature, including known differences from the edge)
- **Structure** → `context/architecture/`
- **Patterns and testing** → `context/development/`
- **History** (what changed, when, why) → `git log`. Commits are conventional (`feat:` / `fix:` / `docs:`) and release notes are generated from them.

---

## Docs: grep

```bash
# Which docs mention a topic
grep -ril "websocket" context/

# Behaviour of a feature
grep -rn "dotenv" context/features/
ls context/features/ | grep -i "http"

# Section headers in a large doc, then read just that section
grep -n "^## " context/architecture/BACKEND_ARCHITECTURE.md

# Surrounding lines
grep -n -C 3 "WorkerProxyWasmRunner" context/architecture/BACKEND_ARCHITECTURE.md

# Either of two terms
grep -rniE "cache|kv" context/features/STORES.md
```

## History: git log

```bash
# Commits whose message mentions a term
git log --oneline --grep=websocket -i

# Commits that added or removed a string in the code
git log --oneline -S"isBuiltInUrl"

# History of a file (follows renames)
git log --oneline --follow -- server/runner/cdnFlow.ts

# Full message and diff of one commit
git show <sha>
```

## Code

The docs point at files; the code is the final word. When a doc and the code disagree, trust the code and fix the doc.

```bash
grep -rn "proxy_http_call" server/runner/
grep -rln "useAppStore" frontend/src/
```

---

## Search by Topic

| Topic | Start here | Keywords |
|-------|-----------|----------|
| WebSocket / real-time sync | `features/WEBSOCKET_IMPLEMENTATION.md` | websocket, broadcast, event |
| Properties | `features/PROPERTIES.md` | get_property, set_property, calculated |
| Headers | `features/PRODUCTION_PARITY_HEADERS.md`, `features/MULTI_VALUE_HEADERS.md` | serialize, HeaderManager, Set-Cookie |
| Proxy-wasm hooks / host functions | `features/FASTEDGE_IMPLEMENTATION.md`, `server/runner/HostFunctions.ts` | hook, host function |
| State management | `architecture/STATE_MANAGEMENT.md` | zustand, slice, persist |
| Testing | `development/TESTING_GUIDE.md`, `development/TEST_PATTERNS.md` | vitest, variants, runFlow |
| Env vars / secrets | `features/DOTENV.md`, `features/FASTEDGE_IMPLEMENTATION.md` | dotenv, dictionary, secret |
| Multi-app resources / origins | `features/RESOURCES.md`, `features/BUILT_IN_RESPONDER.md` | resource, origin, built-in |
| Cache / Edge KV | `features/STORES.md` | cache, kv, Storage Explorer |

---

## Tips

1. **Start broad, narrow down**: list matching files first (`grep -ril`), then read the relevant section.
2. **Use `-i`** to catch WebSocket / websocket / WEBSOCKET.
3. **Check file size first**: small feature docs can be read fully; architecture docs need targeted reads.
4. **Follow the links**: docs link to related docs.
