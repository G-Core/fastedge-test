---
doc_type: reference
audience: human
lang: en
tags: ['rules', 'structure', 'meta']
last_modified: 2026-03-10T15:53:32Z
copyright: '© 2026 gcore.com'
---

RULES DIRECTORY
===============

## TL;DR

One file = one topic. Short names in kebab-case.
Use `paths:` in frontmatter to scope a rule to specific file patterns.
Each file MUST have YAML frontmatter (doc_type, tags, last_modified) and a TL;DR section.

AI agent rule files. Symlink the rules you need into .claude/rules/ to auto-load them.

DIRECTORY STRUCTURE
-------------------

- meta/ — meta-rules (how to write rules, how to write CLAUDE.md)
- coding/ — code standards (per language or tool)
- docs/ — documentation rules

NAMING
------

- Short names without prefixes: `python.md`, not `rules-writing-python.md`
- Kebab-case: `git-commits.md`, `kubernetes-yaml.md`

FILE FORMAT
-----------

- YAML frontmatter required: doc_type, tags, last_modified (update on every change)
- TL;DR section right after header (3-5 lines)
- CAPS headers with `===` underline, subheaders with `---` underline
- Keep markdown minimal: flat lists with `-`, no nested lists, no heavy formatting
- Max 120 characters per line

LOADING BEHAVIOR
----------------

Every rule symlinked into `.claude/rules/` is loaded fully into the agent's context
(system prompt) at session start. This is the default — no extra configuration needed.
Every rule costs tokens every session, so keep rules concise.

PATH SCOPING
------------

Use `paths:` in YAML frontmatter to defer loading until the agent touches matching files:

```yaml
---
paths:
  - '**/*.yml'
  - '**/*.yaml'
---
```

How it works step by step:

01. You add `paths:` with glob patterns to the rule's YAML frontmatter
02. You symlink the rule into `.claude/rules/` as usual
03. On session start, the engine reads the frontmatter but does NOT load the rule body
04. During the session, when the agent reads/edits/creates a file, the engine checks
    the file path against all pending `paths:` patterns
05. If the path matches — the full rule is injected into the agent's context
06. Once loaded, the rule stays active for the rest of the session

Glob pattern syntax:

- `*` — matches any file name within one directory: `src/*.py` matches `src/main.py`
- `**` — matches any number of directories: `**/*.py` matches `src/utils/helpers.py`
- `{a,b}` — alternatives: `**/*.{yml,yaml}` matches both extensions
- Multiple patterns are OR-combined — any single match triggers loading

Example — a Python rule that only activates when working with .py files:

```yaml
---
doc_type: policy
tags: ['python']
paths:
  - '**/*.py'
last_modified: 2026-02-25T12:00:00Z
---

PYTHON STANDARDS
================
...rule content here...
```

If the agent never touches a .py file during the session, this rule costs zero tokens.
The moment the agent opens any .py file — the full rule loads.

When to use `paths:`:

- Language-specific rules: `'**/*.py'` for Python, `'**/*.rs'` for Rust
- Tool-specific rules: `'**/*.{yml,yaml}'` for YAML/Kubernetes
- Rules that are irrelevant to most tasks — saves context tokens when not needed

When NOT to use `paths:`:

- Rules that apply to all code (git commits, general coding standards)
- Meta-rules (how to write CLAUDE.md, how to write rules)
- Rules the agent should always have in mind regardless of file type

HOW TO ADD A RULE
-----------------

01. Create a .md file in the appropriate subdirectory
02. Add YAML frontmatter with doc_type, tags, last_modified
03. Add optional `paths:` for file-specific scoping
04. Follow the file format conventions above
05. Symlink into .claude/rules/ if the rule applies to this project

See the symlink examples in the root [README.md](../README.md#how-to-use).
