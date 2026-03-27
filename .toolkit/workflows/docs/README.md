---
doc_type: meta
audience: human
lang: en
tags: ['doctor', 'technical-map', 'architecture']
last_modified: 2026-03-21T00:00:00Z
copyright: '© 2026 gcore.com'
---

DOCTOR: SUBSYSTEM TECHNICAL MAP
===============================

## TL;DR

`doctor` now has two shipped source roots:

- `toolkit/` -> target `.toolkit/**`
- `workflows/runtime/` -> target `.github/workflows/**`

Both are exact mirrors.
Root files stay presence-only, and broken symlinks are reported as findings.


CURRENT MODEL
-------------

This installed doc set describes only target-repo behavior.

It ships exactly four docs:

- `README.md`
- `quickstart.md`
- `doctor-yml-contract.md`
- `doctor-runbook.md`

Builder scripts, tests, release procedures, and maintainer specs are not part
of the shipped bundle.


SYNC CONTRACT
-------------

Managed bundle:

- target `.toolkit/**` exactly mirrors source `toolkit/**`
- examples are shipped under `.toolkit/examples/**`
- SHA markers are still written in `.toolkit/SOURCE_SHA` and `.toolkit/DOCTOR_RUNTIME_SHA`

Managed runtime:

- target `.github/workflows/**` exactly mirrors source `workflows/runtime/**`

Presence-only checks:

- `AGENTS.md`
- `CLAUDE.md`
- `DOCS.md`
- `.specify/memory/constitution.md`
- `docs/quickstart.md`

Missing files and broken symlinks both fail these checks.


PUBLIC CONTRACT SUMMARY
-----------------------

Workflow input:

- `force_analyze`

Artifact schema versions:

- `doctor-stats/v3`
- `doctor-findings/v4`
- `doctor-report/v1`

Deterministic sync PR:

- branch: `toolkit/sync`
- title: `chore(toolkit): sync standard content`
- the first sync PR may contain only `.toolkit/SOURCE_SHA` and `.toolkit/DOCTOR_RUNTIME_SHA`
- steady state means `collect=success`, `act=skipped`, and `analyze=success`


DOCUMENT MAP
------------

- [quickstart.md](quickstart.md)
- [doctor-yml-contract.md](doctor-yml-contract.md)
- [doctor-runbook.md](doctor-runbook.md)
