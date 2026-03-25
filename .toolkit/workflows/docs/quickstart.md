---
doc_type: guide
audience: human
lang: en
tags: ['quickstart', 'doctor', 'setup']
last_modified: 2026-03-21T18:49:13Z
copyright: '© 2026 gcore.com'
---

QUICKSTART: TECHNICAL SETUP OF DOCTOR IN A TARGET REPO
======================================================

## TL;DR

Copy the five tracked runtime files from the current source repository into the
target repo, configure secrets, and run `doctor` once with
`force_analyze=true`.


RUNTIME FILES TO COPY
---------------------

Source:

- `workflows/runtime/doctor.yml`
- `workflows/runtime/collect.py`
- `workflows/runtime/doctor-analyze.md`
- `workflows/runtime/doctor-analyze.prompt.md`
- `workflows/runtime/doctor-analyze.lock.yml`

Target:

- `.github/workflows/doctor.yml`
- `.github/workflows/collect.py`
- `.github/workflows/doctor-analyze.md`
- `.github/workflows/doctor-analyze.prompt.md`
- `.github/workflows/doctor-analyze.lock.yml`

Copy these tracked files as-is. Do not rebuild the analyze lock in the target
repository.


FIRST RUN
---------

The first run will:

- mirror source `toolkit/**` into target `.toolkit/**`
- mirror source `workflows/runtime/**` into target `.github/workflows/**`
- on a true first install, create the full `.toolkit/` tree and all runtime files
- on a clean reinstall with matching content, possibly open one marker-only sync PR for `.toolkit/SOURCE_SHA` and `.toolkit/DOCTOR_RUNTIME_SHA`
- report missing presence-only files through `analyze`


STEADY STATE
------------

After the marker PR is merged:

- `collect` should succeed
- `act` should be skipped
- `analyze` should succeed
- no new sync PR should appear
