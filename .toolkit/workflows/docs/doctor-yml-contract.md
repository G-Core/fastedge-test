---
doc_type: reference
audience: human
lang: en
tags: ['runtime-workflow-contract', 'doctor']
last_modified: 2026-03-25T00:00:00Z
copyright: '© 2026 gcore.com'
---

RUNTIME WORKFLOW CONTRACT: `doctor.yml`
=======================================

## TL;DR

`doctor.yml` is installed into a target repository from source
`workflows/runtime/doctor.yml`.

It wires together:

1. `collect`
2. `act`
3. `analyze`


SOURCE SURFACES
---------------

Bundle source:

- `toolkit/**`

Runtime source:

- `workflows/runtime/doctor.yml`
- `workflows/runtime/collect.py`
- `workflows/runtime/doctor-analyze.md`
- `workflows/runtime/doctor-analyze.prompt.md`
- `workflows/runtime/doctor-analyze.lock.yml`
- `.github/workflows/doctor-analyze.lock.yml`


ARTIFACT CONTRACT
-----------------

- `doctor-stats.json` uses `doctor-stats/v3`
- `doctor-findings.json` uses `doctor-findings/v4`
- `doctor-report.json` uses `doctor-report/v1`


TARGET SURFACES
---------------

Managed exact-mirror bundle:

- `.toolkit/**`

Manual bootstrap runtime:

- `.github/workflows/doctor.yml`

Cross-repo reusable runtime:

- `G-Core/agent-toolkit/.github/workflows/doctor-analyze.lock.yml@doctor-v1`

Presence-only checks:

- `AGENTS.md`
- `CLAUDE.md`
- `DOCS.md`
- `.specify/memory/constitution.md`
- `docs/quickstart.md`

Missing files and broken symlinks both fail these checks.


RUNTIME BEHAVIOR
----------------

Fresh install:

- the first sync PR may contain only `.toolkit/SOURCE_SHA` and `.toolkit/DOCTOR_RUNTIME_SHA`
- `collect` runs from pinned source ref `doctor-v1`
- `analyze` runs through the reusable lock in the source repo

Steady state:

- `collect` succeeds
- `act` is skipped
- `analyze` still runs
