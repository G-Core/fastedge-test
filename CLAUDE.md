# AI Agent Instructions for Proxy-WASM Test Runner

## Governance (REQUIRED)

Read `AGENTS.md` for company-wide agent rules. These are mandatory and override any conflicting behavior. Key rules: never go beyond the assigned task, never change code that was not asked to change, never "improve" or "optimize" without a clear request, always distinguish observations from action requests.

---

## 🚨 RULE ZERO: Production Parity

fastedge-test exists so developers and agents can build against a **local replica of the FastEdge
edge**. An app that works here must work on the edge, and an app that fails on the edge must fail
here **the same way**: same status codes, same errors, same values, same limits. A debugger that
is more lenient than production is a bug, even when it makes an app "work".

Before changing how a host function, property, header, store or response behaves:

1. **Establish what production does**, not what this repo's docs or tests assume. Use the
   production source if your environment gives you access to it (it is not public and is not
   referenced from this repo), `FastEdge-lib` for HTTP apps (`fastedge-run`, public), and the
   public FastEdge documentation.
2. **If that does not settle it, probe the live edge** (deploy a probe app) and record the
   result where the behaviour is implemented.
3. **When an app fails locally, first ask whether it fails on the edge too.** Check the app's build
   (stale binaries are common) before touching the debugger.
4. **Describe the production behaviour** in a comment where you implement it, and list any known
   divergence in the feature doc (`context/features/`). Never hide one.

This repo is **public**: never link or path-reference anything a public user cannot open:
private repositories, their files, or folders that only exist on your machine. That covers code,
comments, docs, tests and commit messages. Describe the production behaviour instead ("on the
edge, a write in `onRequestHeaders` never fails"). Naming edge components (nginx, core-proxy)
is fine.

---

## 🎯 CRITICAL: Read Smart, Not Everything

**DO NOT read all context files upfront.** This repository uses a **discovery-based context system** to minimize token usage while maximizing effectiveness.

---

## Getting Started: Discovery Pattern

### Step 1: Read the Index (REQUIRED - ~100 lines)

**First action when starting work**: Read `context/CONTEXT_INDEX.md`

This lightweight file (~100 lines) gives you:
- Project quick start
- Documentation map organized by topic
- Decision tree for what to read when
- Search patterns for finding information

### Step 2: Read Based on Your Task (JUST-IN-TIME)

Use the decision tree in CONTEXT_INDEX.md to determine what to read. **Only read what's relevant to your current task.**

**Examples:**

**Task: "Add a feature"**
- Read: `context/development/IMPLEMENTATION_GUIDE.md` (patterns)
- Read: `context/architecture/FRONTEND_ARCHITECTURE.md` (relevant sections)
- Grep: `context/features/` for related behaviour; `git log --oneline --grep=<term>` for how similar work was done

**Task: "Fix WebSocket bug"**
- Read: `context/features/WEBSOCKET_IMPLEMENTATION.md`
- History of the code you touch: `git log --oneline -- <file>` / `git log -S<symbol>`
- Read: `context/development/TESTING_GUIDE.md` if adding tests

**Task: "Understand property system"**
- Read: `context/PROJECT_OVERVIEW.md` (lightweight overview)
- Read: `context/features/PROPERTIES.md`

**Task: "Refactor components"**
- Read: `context/development/COMPONENT_STYLING_PATTERN.md`
- Read: `context/architecture/FRONTEND_ARCHITECTURE.md` (relevant sections)

### Step 3: Search, Don't Read Everything

**Use grep and search tools** instead of reading large docs linearly:

- **Behaviour and design decisions** live in `context/features/` — grep there first
- **History** (what changed, when, why) is `git log`: commits are conventional (`feat:` / `fix:`) and descriptive, and release notes are generated from them
- **Architecture docs** (1,000-2,000 lines): Read specific sections, not entire file
- **Feature docs**: Only read the feature you're working on

See `context/SEARCH_GUIDE.md` for search patterns and examples.

---

## 📋 Decision Tree Reference

**Quick lookup for common tasks:**

| Task Type | What to Read |
|-----------|-------------|
| **Adding a feature** | IMPLEMENTATION_GUIDE + relevant architecture doc section + grep `context/features/` |
| **Fixing a bug** | Feature-specific doc + `git log` of the files involved |
| **Refactoring** | Architecture doc sections + IMPLEMENTATION_GUIDE + COMPONENT_STYLING_PATTERN (if UI) |
| **Understanding system** | PROJECT_OVERVIEW + architecture docs (skim structure) |
| **WebSocket/real-time** | WEBSOCKET_IMPLEMENTATION + STATE_MANAGEMENT (sections) |
| **WASM/proxy-wasm** | FASTEDGE_IMPLEMENTATION (sections) + PRODUCTION_PARITY_HEADERS / MULTI_VALUE_HEADERS |
| **proxy_http_call / HTTP callouts** | HTTP_CALL_IMPLEMENTATION (always read first) |
| **Testing** | TESTING_GUIDE + TEST_PATTERNS |
| **Properties** | PROPERTIES |
| **API changes** | AI_AGENT_API_GUIDE + BACKEND_ARCHITECTURE (API section) |
| **npm package / @gcoredev/fastedge-test** | BACKEND_ARCHITECTURE (npm package and runner sections) |
| **Multi-app CDN resources** | RESOURCES + BUILT_IN_RESPONDER (declared origins) |
| **Cache / Edge KV** | STORES |

---

## 🚫 Anti-Patterns (What NOT to Do)

❌ **Don't**: Read all 4 "core" docs upfront (old pattern - wastes 6,000+ lines of tokens)
❌ **Don't**: Read both BACKEND & FRONTEND architecture for simple single-file changes
❌ **Don't**: Read feature docs you're not working on
❌ **Don't**: Read entire docs when you need specific sections

✅ **Do**: Read CONTEXT_INDEX.md first
✅ **Do**: Use grep to search large docs for keywords, and `git log` for history
✅ **Do**: Read only sections relevant to current task
✅ **Do**: Read documentation just-in-time when you need specific information
✅ **Do**: Follow links in docs to discover related information

---

## ⚡ Critical Working Practices

### Task Checklists (ALWAYS USE)

When starting any non-trivial task (multi-step, multiple files, refactoring, features, etc.):

1. **First action**: Use TaskCreate to break down the work into trackable tasks
2. Update task status as you work (`in_progress` → `completed`)
3. This gives the user real-time visibility into progress

**When to create task checklists:**
- Multi-step tasks (3+ steps)
- Tasks involving multiple files or components
- Refactoring work
- Feature implementation
- Bug fixes that affect multiple areas

### Parallel Agents (MASSIVE TIME SAVINGS)

When tasks are **independent** (different files, different components, no dependencies):

1. **Spawn multiple agents in parallel** using multiple Task tool calls in a **single message**
2. Each agent works concurrently on its task
3. **Massive time savings**: 10-15x faster than sequential processing

**Example**: Refactoring 13 components
- ❌ Sequential: ~6-8 minutes
- ✅ Parallel (13 agents at once): ~30-45 seconds

**When to use parallel agents:**
- Refactoring multiple components
- Testing multiple files
- Updating multiple documentation files
- Creating multiple similar features
- Any tasks modifying different files with no dependencies

**When NOT to use:**
- Tasks with dependencies (B needs A's output)
- Tasks modifying the same file
- Tasks requiring sequential logic

---

## 📝 Documentation Maintenance

### When to Update Context Files

`context/` describes **how things work now and why** — not history, not plans. There is no
changelog file: history is `git log`, and release notes are generated from conventional commits.

**After completing a feature:**
- Update or create the feature doc in `context/features/` (behaviour, design decisions, and any
  known difference from the edge)
- Update `context/PROJECT_OVERVIEW.md` if the feature list changes

**After architectural changes:**
- Update the relevant architecture doc in `context/architecture/`

**After a bug fix that changes behaviour:**
- Correct the feature doc so it states the right behaviour

**Commit messages carry the history:** conventional (`feat:` / `fix:` / `docs:` …), with a body
that says what changed and why. That is what `git log --grep` and the release notes show.

**What NOT to put in `context/`:**
- History ("added X in March", "Files Modified", test-run results) — that is `git log`
- Plans, backlogs, "Future Enhancements", known bugs to fix later — open work is tracked outside
  this repo
- Dated status lines ("✅ Completed …", "Last Updated")

---

## 📁 Context Organization

The context folder is organized by topic:

```
context/
├── CONTEXT_INDEX.md          # Read this first (100 lines)
├── PROJECT_OVERVIEW.md       # Lightweight overview (138 lines)
├── PROJECT_DETAILS.md        # Deep dive (400 lines, optional)
├── SEARCH_GUIDE.md           # How to search effectively
│
├── architecture/             # Read when modifying structure
│   ├── BACKEND_ARCHITECTURE.md
│   ├── FRONTEND_ARCHITECTURE.md
│   └── STATE_MANAGEMENT.md
│
├── features/                 # Read specific feature when needed
│   ├── WEBSOCKET_IMPLEMENTATION.md
│   ├── FASTEDGE_IMPLEMENTATION.md
│   ├── PROPERTIES.md
│   ├── RESOURCES.md
│   ├── STORES.md
│   ├── CONFIG_SHARING.md
│   ├── DOTENV.md
│   └── ... (other features)
│
├── development/              # Read when implementing/testing
│   ├── IMPLEMENTATION_GUIDE.md
│   ├── TESTING_GUIDE.md
│   ├── TEST_PATTERNS.md
│   ├── AI_AGENT_API_GUIDE.md
│   └── COMPONENT_STYLING_PATTERN.md
│
└── (top level)               # CONTEXT_INDEX, PROJECT_OVERVIEW/DETAILS, SEARCH_GUIDE,
                              # DIRECTORY_STRUCTURE, VSCODE_BUNDLING
```

---

## 🔍 Search Tips

**History of a feature or fix:**
```bash
git log --oneline --grep="websocket"
git log --oneline -- server/runner/cdnFlow.ts
git log -S"isBuiltInUrl" --oneline
```

**Find feature documentation:**
```bash
ls context/features/ | grep -i "feature-name"
```

**Search across all context:**
```bash
grep -r "keyword" context/
```

**See `context/SEARCH_GUIDE.md` for comprehensive search patterns.**

---

## Project Philosophy

- **Production Parity**: Test runner must match FastEdge CDN behavior
- **No Over-Engineering**: Simple solutions over complex abstractions
- **Type Safety**: TypeScript throughout (frontend + backend)
- **Modular Architecture**: Clean separation of concerns

---

## Quick Reference

**Tech Stack:**
- Backend: Node.js + Express + TypeScript
- Frontend: React + Vite + TypeScript + Zustand
- WASM: Node WebAssembly API with WASI preview1
- Port: 5179 (auto-increments through 5179-5228 if busy)

**Common Commands:**
```bash
pnpm install
pnpm run build          # Build both backend and frontend
pnpm start              # Start server (port 5179-5228, auto-increments)
pnpm run dev:backend    # Backend watch mode
pnpm run dev:frontend   # Vite dev server (port 5173)
```

---

## Summary: How to Work Efficiently

1. **Read `context/CONTEXT_INDEX.md` first** (~100 lines, ~250 tokens)
2. **Use the decision tree** to identify what docs are relevant
3. **Read only what you need** for your current task (~500-4,000 tokens)
4. **Use grep to search** large docs, and `git log` for history, instead of reading linearly
5. **Follow links** in documentation to discover related information
6. **Create task checklists** for non-trivial tasks
7. **Use parallel agents** when tasks are independent
8. **Update documentation** after completing significant work

**Token Savings**: 75-80% reduction vs. reading all "core" docs upfront

**Result**: Faster agent startup, better focus, scalable documentation system
