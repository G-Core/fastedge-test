# AI Agent Instructions for Proxy-WASM Test Runner

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

**Task: "Add login feature"**
- Read: `context/development/IMPLEMENTATION_GUIDE.md` (patterns)
- Read: `context/architecture/FRONTEND_ARCHITECTURE.md` (relevant sections)
- Grep: `context/CHANGELOG.md` for similar past features

**Task: "Fix WebSocket bug"**
- Read: `context/features/WEBSOCKET_IMPLEMENTATION.md`
- Grep: `context/CHANGELOG.md` for "websocket" or "fix"
- Read: `context/development/TESTING_GUIDE.md` if adding tests

**Task: "Understand property system"**
- Read: `context/PROJECT_OVERVIEW.md` (lightweight overview)
- Read: `context/features/PROPERTY_IMPLEMENTATION_COMPLETE.md`
- Read: `context/wasm/wasm-properties-code.md` if working with WASM

**Task: "Refactor components"**
- Read: `context/development/COMPONENT_STYLING_PATTERN.md`
- Read: `context/architecture/FRONTEND_ARCHITECTURE.md` (relevant sections)
- Grep: `context/CHANGELOG.md` for "refactor" or "component"

### Step 3: Search, Don't Read Everything

**Use grep and search tools** instead of reading large docs linearly:

- **CHANGELOG.md** (~4,287 lines, Feb 2026+): **NEVER read linearly** - use grep to search for keywords; Jan 2026 and earlier entries are in `context/legacy/CHANGELOG_ARCHIVE.md`
- **Architecture docs** (1,000-2,000 lines): Read specific sections, not entire file
- **Feature docs**: Only read the feature you're working on

See `context/SEARCH_GUIDE.md` for search patterns and examples.

---

## 📋 Decision Tree Reference

**Quick lookup for common tasks:**

| Task Type | What to Read |
|-----------|-------------|
| **Adding a feature** | IMPLEMENTATION_GUIDE + relevant architecture doc section + grep CHANGELOG |
| **Fixing a bug** | Feature-specific doc + grep CHANGELOG for history |
| **Refactoring** | Architecture doc sections + IMPLEMENTATION_GUIDE + COMPONENT_STYLING_PATTERN (if UI) |
| **Understanding system** | PROJECT_OVERVIEW + architecture docs (skim structure) |
| **WebSocket/real-time** | WEBSOCKET_IMPLEMENTATION + STATE_MANAGEMENT (sections) |
| **WASM/proxy-wasm** | Relevant wasm/*.md file + FASTEDGE_IMPLEMENTATION (sections) |
| **proxy_http_call / HTTP callouts** | HTTP_CALL_IMPLEMENTATION (always read first) |
| **Testing** | TESTING_GUIDE + TEST_PATTERNS |
| **Properties** | PROPERTY_IMPLEMENTATION_COMPLETE + wasm/wasm-properties-code.md |
| **API changes** | AI_AGENT_API_GUIDE + BACKEND_ARCHITECTURE (API section) |
| **npm package / @gcoredev/fastedge-test** | NPM_PACKAGE_PLAN (always read first) + BACKEND_ARCHITECTURE (runner section) |

---

## 🚫 Anti-Patterns (What NOT to Do)

❌ **Don't**: Read all 4 "core" docs upfront (old pattern - wastes 6,000+ lines of tokens)
❌ **Don't**: Read CHANGELOG.md linearly (~4,287 lines - use grep instead)
❌ **Don't**: Read both BACKEND & FRONTEND architecture for simple single-file changes
❌ **Don't**: Read feature docs you're not working on
❌ **Don't**: Read entire docs when you need specific sections

✅ **Do**: Read CONTEXT_INDEX.md first
✅ **Do**: Use grep to search CHANGELOG and large docs for keywords
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

**After completing major features:**
- Update `context/CHANGELOG.md` - Add detailed entry at the TOP (reverse chronological)
- Update `context/PROJECT_OVERVIEW.md` - Update status sections
- Update or create feature-specific doc in `context/features/`

**After architectural changes:**
- Update relevant architecture doc in `context/architecture/`
- Update `context/CHANGELOG.md`
- Update `context/PROJECT_OVERVIEW.md` (architecture section)

**After significant bug fixes:**
- Update `context/CHANGELOG.md` with the fix
- Update feature doc's Known Issues section if applicable

**What NOT to document:**
- Trivial typo fixes
- Code formatting changes
- Comment updates
- Routine dependency updates (unless they change functionality)

### Changelog Entry Format

```markdown
## [Date] - [Feature Name]

### Overview
Brief description of what was accomplished

### 🎯 What Was Completed

#### 1. [Component/Feature Name]
- Detail 1
- Detail 2

**Files Modified:**
- path/to/file.ts - What changed

**Files Created:**
- path/to/file.ts - Purpose

### 🧪 Testing
How to test the changes

### 📝 Notes
Any important context, decisions, or gotchas
```

---

## 📁 Context Organization

The context folder is organized by topic:

```
context/
├── CONTEXT_INDEX.md          # Read this first (100 lines)
├── PROJECT_OVERVIEW.md       # Lightweight overview (138 lines)
├── PROJECT_DETAILS.md        # Deep dive (400 lines, optional)
├── CHANGELOG.md              # Search, don't read (~4,287 lines, Feb 2026+)
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
│   ├── PROPERTY_IMPLEMENTATION_COMPLETE.md
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
├── wasm/                     # Read when working with WASM
│   ├── wasm-host-functions.md
│   ├── wasm-properties-code.md
│   └── ... (other WASM docs)
│
└── legacy/                   # Rarely needed
    └── ... (archived docs)
```

---

## 🔍 Search Tips

**Instead of reading CHANGELOG.md (~4,287 lines, Feb 2026+):**
```bash
grep -i "websocket" context/CHANGELOG.md
grep -i "fix.*bug" context/CHANGELOG.md
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
- Port: 5179

**Common Commands:**
```bash
pnpm install
pnpm run build          # Build both backend and frontend
pnpm start              # Start server on port 5179
pnpm run dev:backend    # Backend watch mode
pnpm run dev:frontend   # Vite dev server (port 5173)
```

---

## Summary: How to Work Efficiently

1. **Read `context/CONTEXT_INDEX.md` first** (~100 lines, ~250 tokens)
2. **Use the decision tree** to identify what docs are relevant
3. **Read only what you need** for your current task (~500-4,000 tokens)
4. **Use grep to search** CHANGELOG and large docs instead of reading linearly
5. **Follow links** in documentation to discover related information
6. **Create task checklists** for non-trivial tasks
7. **Use parallel agents** when tasks are independent
8. **Update documentation** after completing significant work

**Token Savings**: 75-80% reduction vs. reading all "core" docs upfront

**Result**: Faster agent startup, better focus, scalable documentation system

---

**Last Updated**: February 2026
