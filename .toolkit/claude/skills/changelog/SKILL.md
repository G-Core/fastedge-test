---
name: "gcore:changelog"
description: >-
  Generate a curated changelog from the most important commits in the current PR.
  Use this skill when asked to generate, update, or create a changelog entry from
  PR commits, or when the user runs /changelog.
last_modified: 2026-03-10T16:50:13Z
copyright: '© 2026 gcore.com'
---

GENERATE PR CHANGELOG
=====================

## TL;DR

You generate a curated changelog entry from the current PR's commits.
NOT a git log dump — a compiled summary of notable user-facing changes.
Filter out chore and refactor commits; keep features, fixes, and breaking changes.

STEPS
-----

1. Get the current PR's base branch and metadata:

```bash
gh pr view --json number,title,body,baseRefName -q '"\(.number) \(.title) [base: \(.baseRefName)]"'
```

2. Get all commits in this PR (current branch vs base):

```bash
BASE=$(gh pr view --json baseRefName -q '.baseRefName') && git log --oneline --no-merges "$(git merge-base HEAD "origin/$BASE")..HEAD"
```

3. Get the combined diff stat for context on what actually changed:

```bash
BASE=$(gh pr view --json baseRefName -q '.baseRefName') && git diff --stat "$(git merge-base HEAD "origin/$BASE")..HEAD"
```

4. If needed, read specific changed files to understand the nature of changes better.

FILTERING RULES
---------------

Skip these commits — they are NOT changelog-worthy:

- `chore:` commits (deps, CI, gitignore, symlinks, formatting)
- `docs:` commits that only fix typos or formatting
- merge commits
- commits that only change lockfiles, `.gitignore`, or CI configs
- refactors with no user-visible behavior change

KEEP these commits — they ARE changelog-worthy:

- `feat:` — new features
- `fix:` — bug fixes
- commits with `!` in header or `BREAKING CHANGE` footer — always include
- `security:` — vulnerability fixes
- `docs:` that add new documentation for new features
- any commit that changes public API, config format, or user-visible behavior

OUTPUT FORMAT
-------------

Follow the format defined in `rules/docs/changelog.md`.
Use today's date. Group by change type.

```markdown
YYYY-MM-DD
----------

### Added

- Description from user's perspective (#PR)

### Fixed

- Description from user's perspective (#PR)
```

Rules:
- One line per change, start with `-`
- Describe from user's perspective, NOT implementation details
- Merge related commits into a single entry (e.g., 3 commits about OAuth → one "Added OAuth 2.0 support" line)
- Reference the PR number at the end: `(#123)`
- Only include categories that have entries (Added, Changed, Deprecated, Removed, Fixed, Security)
- If ALL commits are chore/non-notable, say so explicitly — do not fabricate entries

AFTER GENERATING
----------------

Ask the user (numbered list):
1. Insert into CHANGELOG.md and push — find existing CHANGELOG.md, add entry under the
   header before older dates, commit and push
2. Just show the output — do nothing else
