---
doc_type: policy
lang: en
tags: ['docs', 'meta', 'guidelines', 'best-practices']
last_modified: 2026-03-03T12:00:00Z
---

WRITING DOCS/
=============

How to author documentation files for the docs/ directory

TL;DR: docs/ is the agent's long-term memory — reference material retrieved on demand.
Zero token cost until the agent explicitly reads a file. Make docs/ discoverable.

WHAT DOCS/ IS AND WHAT BELONGS THERE
=====================================

docs/ is the agent's long-term memory — reference material looked up on demand.
Unlike CLAUDE.md (always loaded) and rules/ (auto-loaded when linked), docs/ files
are never injected automatically. The agent uses the Read tool to access them.
Zero token cost until accessed — docs/ can handle larger content than CLAUDE.md or
rules/, but that's not a license to be verbose.

Keep content concise and task-relevant. Skip anything discoverable from code,
widely known, or part of the model's training data. Focus on what's invisible:

- Naming conventions that deviate from community standards
- Performance constraints or SLAs not visible in code
- Security boundaries and trust zones
- Known gotchas ("don't call X before Y because...")

Rules vs docs: "do this when X" → rules/ (prescriptive). "Here's how X works" →
docs/ (descriptive). Useful every session → rules/. Useful occasionally → docs/.

For the full three-layer mental model see
[writing-claude-md.md](writing-claude-md.md#mental-model-three-layers-of-agent-cognition).

MAKING DOCS/ DISCOVERABLE
=========================

docs/ are only useful if the agent knows they exist. The recommended pattern is a
structured index file (DOCS.md) referenced from CLAUDE.md:

```text
# In CLAUDE.md:
see DOCS.md

# In DOCS.md — structured index with one-line descriptions:
- docs/architecture.md — system architecture, component diagrams
- docs/api.md — endpoint contracts, auth flow
- docs/deployment.md — staging/production deploy procedures
```

Progressive disclosure happens naturally: the agent reads the index, sees what exists,
and reads detailed docs/ when the task requires it.

Rules can also reference docs/ for deeper context — the agent discovers them when a
related rule loads.

FILE FORMAT
===========

Same format as rules/ (see [writing-rules.md#FILE FORMAT](writing-rules.md#file-format)).
Use `doc_type: reference` for lookup material, `doc_type: guide` for walkthroughs.

NAMING AND ORGANIZATION
========================

- Kebab-case filenames: `api-reference.md`, `context-loading.md`
- Group related docs/ in subdirectories: `docs/api/`, `docs/architecture/`
- Keep the top-level docs/ flat when possible — subdirectories only when there are
  3+ related files that form a logical group
