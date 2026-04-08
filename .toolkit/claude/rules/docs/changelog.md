---
doc_type: policy
audience: bot
lang: en
tags: ['changelog', 'documentation']
last_modified: 2026-03-15T17:40:06Z
copyright: '© 2026 gcore.com'
paths:
  - '**/CHANGELOG.md'
---

CHANGELOG RULES
===============

## TL;DR

Use a date-based changelog with Keep a Changelog categories:
`Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`.
This repository uses dates instead of versions or release numbers.
Document notable user-facing or operator-facing changes only. Newest date first.
One section per date. No empty categories. Do not mirror the git log
(inspired by https://keepachangelog.com/en/1.1.0/).

FORMAT
------

Header
------

Every `CHANGELOG.md` starts with this header. Do not add YAML frontmatter to
the target `CHANGELOG.md` file:

```markdown
CHANGELOG
=========

All notable changes to this project are documented in this file.
```

Date sections
-------------

Each date is a section header. Use ISO 8601 full-date format: `YYYY-MM-DD`.

```markdown
2026-02-22
----------

### Added

- Added OAuth 2.0 login support for dashboard users. (#1842)

### Changed

- Default API timeout is now 30s.

### Security

- Updated OpenSSL to address a vulnerability in TLS session handling. (#842)

2026-02-20
----------

### Fixed

- Fixed a token refresh loop after session expiry.
```

- Newest date first, oldest last
- One section per date. Do not create duplicate sections for the same date.
- The date is the merge date into the default branch. Use the project timezone.
  If no timezone is set, use UTC.
- Category order is fixed: `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`,
  `Security`
- Only include categories that have entries
- When you edit an existing file, keep unrelated formatting and entry order intact

CHANGE TYPES
------------

Group changes under these categories. Only include categories that have entries:

- `Added` — new features, commands, endpoints, flags, or workflows
- `Changed` — changes to how existing features work, including defaults,
  performance, supported runtimes, or operator workflows
- `Deprecated` — still works now, but planned for removal. Include the
  replacement and removal date when known.
- `Removed` — features that have been removed. Include the migration path
  when known.
- `Fixed` — bug fixes with user-visible or operator-visible impact
- `Security` — vulnerability fixes, hardening, permission changes, or other
  security updates that affect users or operators

Put each change in one category only. Dependency, CI, config, and infrastructure
changes belong here only when they have external effect: behavior visible to
users, security impact, compatibility change, or required operator action.

ENTRY RULES
-----------

- One bullet per notable change. Start with `-`.
- Write from the user's point of view, not from the author's implementation
  point of view
- For libraries and SDKs, the "user" is the developer who integrates the API
- For services and internal platforms, the "user" includes operators and SREs
- State the effect visible to users. Add internal details only when needed.
- Do NOT paste commit subjects, PR titles, or raw git log lines
- Reference issues, PRs, incidents, or tickets where relevant: `(#123)`,
  `PROJ-456`
- Do NOT leave empty categories
- Do NOT duplicate the same change across categories
- If an entry already exists for the same change, update it instead of adding
  a duplicate
- Internal-only changes do NOT belong in the changelog unless they have
  user-facing, operator-facing, breaking, or security impact
- Breaking changes should start with `BREAKING:` and include the migration or
  replacement when known
- Deprecations MUST name the replacement and the planned removal date or version
  when known

Examples
--------

Good:

```markdown
- Added SSO login with Google and GitHub providers. (#1842)
- BREAKING: Removed the legacy `/v1/images` endpoint; use `/v2/images` instead. (#1901)
- Deprecated the `--legacy-auth` flag; use `--auth-mode=compat`. Planned removal: 2026-06-01.
- Updated `axios` to address a dependency vulnerability affecting proxy requests. (#1933)
- Fixed webhook retries getting stuck after a 429 response. (#1887)
```

Bad:

```markdown
- feat(auth): add oauth
- refactor auth service
- Merge branch 'main'
- bump deps
- fix stuff
```

WHEN TO UPDATE
--------------

- Update `CHANGELOG.md` when a notable change is merged to the default branch
- Do NOT add a changelog entry for every commit
- If multiple commits make one user-visible change, write one entry
- If a section for today's date already exists, add the entry there. Otherwise,
  create a new date section in the correct position.
- Breaking changes, deprecations, removals, and security fixes MUST be
  documented
- Do NOT skip an entry only because the commit type is `chore`, `ci`, `build`,
  or similar. Decide based on user or operator impact.
- Do NOT update the changelog for internal-only refactors, tests, style,
  formatting, or comment-only changes unless they affect users or operators
- Keep unrelated text unchanged when you edit the file. Make the smallest change
  needed.
- If no notable external change happened, do NOT edit `CHANGELOG.md`

CHECKLIST
---------

- Header matches the required template
- Changes grouped by date (newest first)
- Dates use ISO 8601 full-date `YYYY-MM-DD`
- Only one section exists for each date
- Changes grouped by type in this order:
  `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`
- No empty categories
- Entries describe user-facing or operator-facing changes, not raw commits
- Breaking changes documented with migration guidance when known
- Deprecations include the replacement and planned removal target when known
- No duplicate entries
- No YAML frontmatter in the target `CHANGELOG.md` file
