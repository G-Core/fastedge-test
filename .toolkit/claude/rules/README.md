---
doc_type: reference
lang: en
tags: ['rules', 'structure', 'meta']
last_modified: 2026-03-03T12:00:00Z
---

RULES DIRECTORY
===============

TL;DR: AI agent rule files. One file = one topic. Symlink the ones you need into
`.claude/rules/` to auto-load them.

For the full rule-writing guide see [meta/writing-rules.md](meta/writing-rules.md).

WHAT ARE RULES
==============

Rules are structured knowledge files that define how an AI agent should behave when working
with code, docs, and workflows. Each file covers one topic — a language standard, a workflow
checklist, a documentation convention. Once linked into `.claude/rules/`, they get
auto-loaded into the agent's context.

DIRECTORY STRUCTURE
===================

- README.md — this file
- meta/ — meta-rules (how to write CLAUDE.md, rules, and docs/)
- coding/ — code standards (per language or tool)
- docs/ — documentation rules

