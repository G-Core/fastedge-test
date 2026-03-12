# How to Search Context Effectively

**Don't read everything. Search for what you need.**

This guide shows you how to quickly find information across the context documentation using grep and other search tools.

---

## Quick Search Patterns

### Finding Feature Information

```bash
# Search across all feature docs
grep -r "websocket" context/features/

# Search for specific term in features
grep -i "property system" context/features/*.md

# Find all mentions of FastEdge
grep -r "FastEdge" context/
```

### Finding Past Decisions in CHANGELOG

**Never read CHANGELOG.md linearly (3,138 lines!).** Use grep instead:

```bash
# Find when feature was implemented
grep -i "websocket" context/CHANGELOG.md

# Find bug fixes
grep -i "fix.*header" context/CHANGELOG.md

# Find recent changes to a specific file
grep -i "ProxyWasmRunner" context/CHANGELOG.md

# Find changes in a specific month
grep "February.*2026" context/CHANGELOG.md
```

### Finding Code Patterns

```bash
# Search implementation guide for patterns
grep -i "zustand" context/development/IMPLEMENTATION_GUIDE.md

# Find testing patterns
grep -i "test.*property" context/development/TEST_PATTERNS.md

# Search for API endpoints
grep -i "POST.*api" context/development/AI_AGENT_API_GUIDE.md
```

### Finding Architecture Information

```bash
# Search backend architecture
grep -i "ProxyWasmRunner" context/architecture/BACKEND_ARCHITECTURE.md

# Search frontend architecture
grep -i "component" context/architecture/FRONTEND_ARCHITECTURE.md

# Find state management patterns
grep -i "slice" context/architecture/STATE_MANAGEMENT.md
```

### Finding WASM Information

```bash
# Search all WASM docs
grep -r "host function" context/wasm/

# Find property-related WASM code
grep -i "get_property" context/wasm/*.md

# Search for header handling
grep -i "serialize" context/wasm/*.md
```

---

## Search by Topic

### WebSocket / Real-Time Sync

**Keywords**: websocket, real-time, sync, broadcast, event, connection

```bash
grep -ri "websocket" context/
grep -ri "real-time" context/features/WEBSOCKET_IMPLEMENTATION.md
grep -ri "broadcast" context/architecture/BACKEND_ARCHITECTURE.md
```

### Properties System

**Keywords**: property, get_property, set_property, runtime calculation, property path

```bash
grep -ri "property" context/features/PROPERTY_IMPLEMENTATION_COMPLETE.md
grep -ri "get_property" context/wasm/wasm-properties-code.md
grep -ri "runtime.*calculat" context/
```

### Headers

**Keywords**: header, serialization, G-Core SDK format, HeaderManager

```bash
grep -ri "header.*serializ" context/
grep -ri "G-Core SDK" context/features/PRODUCTION_PARITY_HEADERS.md
grep -ri "HeaderManager" context/architecture/BACKEND_ARCHITECTURE.md
```

### WASM / Proxy-WASM

**Keywords**: wasm, host function, proxy-wasm, FastEdge, hooks

```bash
grep -ri "host function" context/wasm/
grep -ri "proxy-wasm" context/
grep -ri "hook.*execut" context/
```

### State Management

**Keywords**: zustand, store, slice, state, persistence

```bash
grep -ri "zustand" context/architecture/STATE_MANAGEMENT.md
grep -ri "slice" context/architecture/
grep -ri "persist" context/
```

### Testing

**Keywords**: test, testing, jest, patterns, coverage

```bash
grep -ri "test.*pattern" context/development/TEST_PATTERNS.md
grep -ri "jest" context/development/TESTING_GUIDE.md
grep -ri "coverage" context/
```

### FastEdge / Dotenv

**Keywords**: FastEdge, secret, dictionary, dotenv, env var

```bash
grep -ri "secret.*rotat" context/features/FASTEDGE_IMPLEMENTATION.md
grep -ri "dotenv" context/features/DOTENV.md
grep -ri "dictionary" context/
```

---

## Advanced Search Techniques

### Search with Context Lines

```bash
# Show 3 lines before and after match
grep -C 3 "pattern" context/file.md

# Show 5 lines after match
grep -A 5 "pattern" context/file.md

# Show 2 lines before match
grep -B 2 "pattern" context/file.md
```

### Case-Insensitive Search

```bash
# Case insensitive
grep -i "websocket" context/

# Case insensitive recursive
grep -ri "property" context/
```

### Search Multiple Patterns

```bash
# Match either pattern
grep -E "websocket|real-time" context/

# Match lines with both patterns (using double grep)
grep "websocket" context/ | grep "connection"
```

### Find Section Headers

```bash
# Find all ## headers in a file
grep "^##" context/development/IMPLEMENTATION_GUIDE.md

# Find specific section
grep -n "## Testing" context/development/TESTING_GUIDE.md
```

### Count Occurrences

```bash
# Count how many times a term appears
grep -c "property" context/features/PROPERTY_IMPLEMENTATION_COMPLETE.md

# Count across all files
grep -r "websocket" context/ | wc -l
```

---

## Search Workflows

### Workflow 1: Understanding a Feature

```bash
# 1. Search CHANGELOG for when it was implemented
grep -i "feature-name" context/CHANGELOG.md

# 2. Find feature documentation
ls context/features/ | grep -i "feature"

# 3. Search implementation guide for patterns
grep -i "feature" context/development/IMPLEMENTATION_GUIDE.md

# 4. Find related code in architecture docs
grep -ri "feature" context/architecture/
```

### Workflow 2: Debugging an Issue

```bash
# 1. Search for error message or symptom
grep -ri "error keyword" context/

# 2. Check CHANGELOG for related fixes
grep -i "fix.*keyword" context/CHANGELOG.md

# 3. Find implementation details
grep -ri "keyword" context/features/

# 4. Check testing patterns
grep -ri "keyword" context/development/TEST_PATTERNS.md
```

### Workflow 3: Implementing Similar Feature

```bash
# 1. Find similar existing feature
grep -ri "similar-feature" context/

# 2. Read that feature's implementation doc
cat context/features/SIMILAR_FEATURE.md

# 3. Check implementation patterns
grep -i "pattern-name" context/development/IMPLEMENTATION_GUIDE.md

# 4. Find testing examples
grep -i "similar-feature" context/development/TEST_PATTERNS.md
```

---

## Tool-Specific Search

### Using Grep Tool (Claude Code)

When using Claude Code's Grep tool:

```
pattern: "websocket"
output_mode: "files_with_matches"  # Just show which files match
path: "context/"                   # Search in context directory
```

Or with content:

```
pattern: "property.*runtime"
output_mode: "content"             # Show matching lines
-i: true                           # Case insensitive
-C: 3                              # Show 3 lines of context
path: "context/features/"
```

### Using Glob Tool (Claude Code)

Find files by name pattern:

```
pattern: "**/IMPLEMENTATION*.md"   # Find implementation docs
pattern: "**/*WASM*.md"            # Find WASM-related docs
pattern: "**/features/*.md"        # All feature docs
```

---

## Documentation Size Quick Reference

When searching, consider file sizes:

**Quick reads** (< 200 lines):
- wasm/*.md files (~60-220 lines)
- DOTENV.md (~169 lines)
- LOG_FILTERING.md (~147 lines)

**Medium reads** (200-700 lines):
- Feature docs in features/ (~280-650 lines)
- Development docs (~350-600 lines)

**Section-based reading** (700-2000 lines):
- Architecture docs (~994-1,969 lines)
- Use grep to find relevant sections

**Search only** (> 2000 lines):
- CHANGELOG.md (~3,138 lines) - NEVER read linearly

---

## Tips for Efficient Searching

1. **Start broad, narrow down**: Search all files first, then specific directories
2. **Use case-insensitive**: Add `-i` flag to catch variations (WebSocket, websocket, WEBSOCKET)
3. **Search CHANGELOG with keywords**: Don't read it linearly, grep for feature names or dates
4. **Use context lines**: `-C 3` shows surrounding lines for better understanding
5. **Combine searches**: Pipe grep results to another grep to refine
6. **Check file size first**: Small files can be read fully, large ones need targeted searches
7. **Follow the links**: Docs link to related docs - follow the trail

---

**Last Updated**: February 2026
