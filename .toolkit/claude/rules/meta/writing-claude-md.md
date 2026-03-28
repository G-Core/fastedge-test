---
doc_type: policy
lang: en
tags: ['claude-md', 'meta', 'guidelines', 'best-practices']
last_modified: 2026-03-03T12:00:00Z
---

WRITING CLAUDE.MD
=================

Rules for authoring effective CLAUDE.md files

TL;DR: CLAUDE.md is a system prompt loaded every session — keep it to 1-2 screens.
Three layers: subconscious (CLAUDE.md) = identity and reflexes, conscious (rules/) = knowledge
and skills, long-term memory (docs/) = on-demand references. CLAUDE.md holds only what the agent
must always know. Overloaded CLAUDE.md = ignored CLAUDE.md.

WHAT CLAUDE.MD IS
=================

CLAUDE.md is injected into the agent's system prompt on every session start.
Every line consumes context window tokens — the same window used for reasoning and code.

Mental model: three layers of agent cognition
----------------------------------------------

The agent's knowledge lives on three levels, like a human mind:

Subconscious — CLAUDE.md
........................

Always discovered, always active. The engine finds CLAUDE.md by walking up the directory
tree — no setup needed. Identity, reflexes, hard invariants.
"I speak English", "I never commit to main", "I challenge ideas, not agree blindly".
The agent doesn't think about these — it just acts on them.
Rule of thumb: if you wouldn't tattoo it on your arm, it doesn't belong here.

Conscious mind — rules/
.......................

Structured knowledge and skills, auto-loaded after the user links them. Unlike CLAUDE.md
(discovered automatically), rules require a deliberate curation step: symlink into
`.claude/rules/`. Once linked, they load every session — but the user decides which rules
apply to which project. Like knowing how to drive — you don't think about it while
cooking, but it kicks in the moment you sit behind the wheel.
See [writing-rules.md](writing-rules.md) for the full rule-authoring guide.

Long-term memory — docs/
.........................

Retrieved on demand. The agent decides when to look things up — architecture docs,
API references, onboarding guides. Requires conscious effort (Read tool).
Not injected automatically — zero token cost until accessed.
See [writing-docs.md](writing-docs.md) for the full docs-authoring guide.

WHY CLAUDE.MD MUST BE SHORT
====================

- 1-2 screens maximum (roughly 80-150 lines of content)
- A bloated CLAUDE.md gets partially ignored — the model deprioritizes later sections
- Every redundant line steals tokens from actual work
- If it takes more than 30 seconds to read, it's too long

WHAT TO INCLUDE
===============

Behavioral rules and invariants
--------------------------------

Hard constraints the agent must always follow. Use MUST/NEVER/ALWAYS language.

```text
- MUST run tests before suggesting a PR
- NEVER modify files outside the assigned task scope
- ALWAYS create a new branch from main before starting work
```

Communication style
-------------------

How the agent should talk to the user: language, tone, formality level.

Brief project context
---------------------

2-4 lines: what the project does, primary tech stack, anything non-obvious.
The agent can see the code — don't describe what's discoverable from `tree` or `package.json`.

Non-standard commands
---------------------

Only commands the agent can't guess from config files:

```text
Build: make build-all
Test: pytest -x --tb=short
Deploy: ./scripts/deploy.sh staging
```

Do NOT list 15 variants of the same command. One canonical form is enough.

Workflow checklists
-------------------

Short checklists for recurring processes (3-5 items max):

```text
Before PR: lint, test, update CHANGELOG
```

Domain terms
------------

Project-specific jargon the agent wouldn't know from code alone:

```text
- "ticket" = Jira issue
- "canary" = staged rollout to 5% of users
```

WHAT NOT TO INCLUDE
===================

Discoverable information
------------------------

- Directory structure (agent runs `tree`)
- Standard framework patterns (agent knows them)
- Package versions (agent reads lock files)

Tutorials and philosophy
------------------------

- Long explanations of why rules exist
- Programming best practices the model already knows
- Motivational text or design philosophy essays

Volatile content
----------------

- TODO lists, sprint plans, current task status
- Recently changed files or features
- Temporal notes ("as of January 2026...")

Logs, diffs, and code snippets
------------------------------

- Debug output or error logs
- Git diffs or commit hashes
- Large code examples (put them in docs/ or rules/)

Secrets
-------

- API keys, tokens, passwords — NEVER in CLAUDE.md or anywhere in git
- Even internal URLs with credentials

MODULARITY PRINCIPLE
====================

Each layer has its own job. Don't mix them.

```text
Subconscious — CLAUDE.md (always discovered)
  ├── Identity and hard rules (MUST/NEVER/ALWAYS)
  ├── Communication style
  ├── Brief project context
  └── Key commands

Conscious — rules/ (linked, then auto-loaded)
  ├── All topic-specific rules: coding, workflows, docs, meta, etc.
  └── See writing-rules.md for authoring guide

Long-term memory — docs/ (on-demand, zero cost until read)
  ├── Reference material the agent looks up when needed
  └── See writing-docs.md for authoring guide
```

Don't put conscious-level knowledge into the subconscious.
If something can be formulated as a standalone rule file on any topic, it belongs in rules/.
If it's reference material the agent rarely needs, it belongs in docs/.

ANTI-PATTERNS
=============

Kitchen sink
------------

Cramming everything into one file. Symptom: CLAUDE.md over 300 lines.
Fix: extract topics into rules/ files, leave only pointers.

Response rituals
----------------

Forcing the agent to repeat phrases, use specific emoji patterns, or follow rigid answer templates.
The agent works better with behavioral constraints than output scripts.

Task tracker
------------

Using CLAUDE.md as a TODO list or sprint board.
It's loaded every session — stale tasks waste tokens forever.

Auto-summarization
------------------

Asking the agent to append session summaries to CLAUDE.md.
This grows the file unboundedly and degrades quality over time.

EVOLUTION
=========

How to maintain CLAUDE.md over time:

- Error-driven: when the agent repeats a mistake, add a rule to prevent it
- Periodic cleanup: review every 2-4 weeks, remove rules that are no longer relevant
- Git-tracked: CLAUDE.md belongs in version control, changes are reviewable in PRs
- Test your rules: after adding a rule, verify the agent actually follows it
- One rule at a time: add rules incrementally, not in bulk rewrites
