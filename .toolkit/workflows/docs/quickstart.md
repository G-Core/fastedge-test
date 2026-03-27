---
doc_type: guide
audience: human
lang: en
tags: ['quickstart', 'doctor', 'setup']
last_modified: 2026-03-25T00:00:00Z
copyright: '© 2026 gcore.com'
---

QUICKSTART: TECHNICAL SETUP OF DOCTOR IN A TARGET REPO
======================================================

## TL;DR

Copy the bootstrap `doctor.yml` from the current source repository into the
target repo, configure secrets, and run `doctor` once with `force_analyze=true`.


BOOTSTRAP FILE TO COPY
----------------------

Source:

- `workflows/runtime/doctor.yml`

Target:

- `.github/workflows/doctor.yml`

Do not copy `collect.py`, `doctor-analyze.md`, `doctor-analyze.prompt.md`, or
`doctor-analyze.lock.yml` into the target repository.


FIRST RUN
---------

The first run will:

- mirror source `toolkit/**` into target `.toolkit/**`
- leave `.github/workflows/doctor.yml` as manual bootstrap
- call `analyze` cross-repo through the pinned reusable workflow in `agent-toolkit`
- on a true first install, create the full `.toolkit/` tree
- on a clean reinstall with matching content, possibly open one marker-only sync PR for `.toolkit/SOURCE_SHA` and `.toolkit/DOCTOR_RUNTIME_SHA`
- report missing presence-only files through `analyze`


STEADY STATE
------------

After the marker PR is merged:

- `collect` should succeed
- `act` should be skipped
- `analyze` should succeed
- no new sync PR should appear
