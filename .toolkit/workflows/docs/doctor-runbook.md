---
doc_type: guide
audience: human
lang: en
tags: ['doctor', 'runbook', 'troubleshooting']
last_modified: 2026-03-21T00:00:00Z
copyright: '© 2026 gcore.com'
---

DOCTOR RUNBOOK
==============

## TL;DR

Troubleshooting guide for the current exact-mirror model.


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

Unexpected deletions in `.github/workflows/**`:

- expected behavior
- runtime sync is exact mirror from source `workflows/runtime/**`

Prompt/lock mismatch:

- reinstall all five runtime files from the current source repository

`act` is skipped:

- expected steady state
- it means `collect` found no managed drift
