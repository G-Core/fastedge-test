---
doc_type: guide
audience: human
lang: en
tags: ['doctor', 'runbook', 'troubleshooting']
last_modified: 2026-03-25T00:00:00Z
copyright: '© 2026 gcore.com'
---

DOCTOR RUNBOOK
==============

## TL;DR

Troubleshooting guide for the thin-bootstrap model.


COMMON FAILURES
---------------

`collect` cannot read source repo:

- check `TOOLKIT_READ_TOKEN`

First run opens a tiny sync PR with only SHA markers:

- expected behavior on a clean reinstall
- merge it, then rerun `doctor`

Missing root files but no sync PR:

- expected behavior
- root files are presence-only checks
- missing files and broken symlinks are reported through `analyze`

Unexpected deletions in `.toolkit/**`:

- expected behavior
- bundle sync is exact mirror from source `toolkit/**`

Missing or changed `.github/workflows/doctor.yml` with no sync PR:

- expected behavior
- `doctor.yml` is a manual bootstrap file
- update it manually from `workflows/runtime/doctor.yml`

Prompt/lock mismatch:

- rebuild and republish the reusable lock from `agent-toolkit`
- update target `doctor.yml` manually if the bootstrap file is still on an older major version

`act` is skipped:

- expected steady state
- it means `collect` found no managed drift
