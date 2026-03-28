---
doc_type: policy
audience: bot
lang: en
tags: ['git', 'commits', 'conventional-commits', 'version-control', 'standards']
last_modified: 2026-03-15T19:45:47Z
copyright: '© 2026 gcore.com'
---

GIT COMMITS AND VERSION CONTROL POLICY
======================================

## TL;DR

Conventional Commits are required: `<type>: <subject>`, `<type>(scope): <subject>`,
and the `!` variants for breaking changes. English, imperative, no period.
One commit = one logical change. Keep each commit in a working state.
Shared branches are linear: merge via PR using rebase or squash. Never force-push
shared branches.

CONVENTIONAL COMMITS
--------------------

Required format
---------------

Header formats:

```text
<type>: <subject>
<type>(<scope>): <subject>
<type>!: <subject>
<type>(<scope>)!: <subject>
```

Rules:
- Scope is optional. Omit it if no short, stable scope exists.
- `!` is optional and means BREAKING CHANGE only. It does not mean "urgent",
  "security", or "hotfix".
- Team policy (stricter than the Conventional Commits spec): if a commit is
  breaking, use both `!` in the header and a `BREAKING CHANGE:` footer.
- Types outside the allowed list below are not used in this repository.

Allowed types
-------------

Type     | Use when                                                     | Example
-------- | ------------------------------------------------------------ | ----------------------------------------------
feat     | Add user-visible functionality                                | feat(auth): add OAuth 2.0 login
fix      | Fix a bug                                                     | fix(api): return 400 on invalid token
perf     | Improve performance without changing behavior                 | perf(db): reduce N+1 queries in orders
refactor | Restructure code without changing behavior                    | refactor(api): split route handlers into controller layer
docs     | Documentation only                                            | docs: document rollback procedure
test     | Add/fix tests only                                            | test(api): add contract tests for /orders
style    | Formatting only (no behavior change)                          | style: run formatter
build    | Build system/tooling (bundler, compiler, build scripts)       | build: enable incremental builds
ci       | CI/CD config and scripts                                      | ci: cache npm dependencies
chore    | Repo maintenance not better covered by build/ci/docs/test     | chore(deps): bump axios to 1.7.0
revert   | Revert a previous change                                      | revert(auth): remove OAuth 2.0 login

Scope rules
-----------

- Use a short, stable noun for a logical area: `auth`, `api`, `db`, `ui`,
  `docs`, `deps`, `ci`, `security`.
- Prefer existing scopes.
- If no stable scope exists, omit the scope. Do not invent one-off scopes
  just to fill the slot.
- Use lowercase and hyphens only. No spaces.

Subject rules
-------------

- English (required).
- Imperative mood: `add`, `fix`, `remove`, `prevent`, `allow`, `support`.
- No period at the end.
- Aim for a maximum of 50 characters. This is a team style target, not a Git
  requirement. Move details to the body.
- Start with lowercase, except proper nouns/acronyms (`JWT`, `OAuth`, `GitHub`).
- Describe the outcome, not the activity.
- Good: `fix(api): return 400 on invalid token`.
- Bad: `fix(api): update token handling`.
- Exception: Git-generated or temporary cleanup subjects (`Revert "..."`,
  `fixup!`, `amend!`) may exceed 50 characters on personal branches. Clean
  them up before merge unless the final commit is an intentional revert.

Body rules
----------

Use a body when the change is not obvious from the subject, or when reviewers
or operators need context.

- Blank line between subject and body (required).
- Wrap lines at ~72 characters where practical (hard stop at 100 for URLs,
  paths, commands, hashes, and similar unbreakable text).
- Explain WHY and any non-obvious WHAT. Do not describe the diff line by line.
- If operational work is required (migration, backfill, cache clear, flag flip),
  state it explicitly.
- If the commit has multiple related points, use a dash list inside the body.

Footer rules
------------

Footers are structured trailers. Keep a blank line before trailers so tooling
parses them correctly.

- Breaking changes: `BREAKING CHANGE: ...` (see BREAKING CHANGES).
- Issue/reference footers:
  - Use `Refs: ABC-123` for traceability.
  - Use `Closes #123` only when merging the commit/PR into the default branch
    should close the issue.
  - Do not treat `Refs` and `Closes` as interchangeable.
- External tracker IDs like `ABC-123` only auto-link if the hosting platform
  supports it.

BREAKING CHANGES
----------------

Definition
----------

A breaking change is any change that requires consumers to update code,
configuration, data, or operations.
Severity is not the same as breaking. A critical security fix can be
non-breaking.

Required marking
----------------

Team policy (stricter than the Conventional Commits spec): if a commit is
breaking, do BOTH:

- Add `!` in the header.
- Add a `BREAKING CHANGE:` footer that states the required migration/action.

Example:

```text
feat(auth)!: replace API keys with OAuth 2.0

BREAKING CHANGE: API keys are no longer accepted. Use OAuth 2.0 bearer tokens.
```

HOTFIXES AND SECURITY FIXES
---------------------------

- Use `fix` for hotfixes. They are still fixes.
- Do NOT use `!` unless the hotfix is actually breaking.
- Security severity and breaking status are independent.
- If a secret or credential was committed, do not rely on a revert alone.
  Revoke/rotate the secret and follow the repo's secret-remediation process.

Example (non-breaking security fix):

```text
fix(security): patch auth token validation bypass

Refs: CVE-XXXX-YYYY
```

ATOMIC COMMITS
--------------

Rules
-----

- One commit = one logical change.
- Each commit should leave the branch in a working state:
  - the project builds for the changed area;
  - relevant tests pass;
  - if you did not run checks, do not claim they passed.
- Split unrelated changes even if they are small.
- Refactor + docs => 2 commits (`refactor` + `docs`).
- Feature + required build/config wiring => prefer 2 commits (`feat` +
  `build`/`chore`) when that makes review clearer; keep them together only if
  splitting would leave history broken or misleading.
- Use `git add -p` to stage only the intended hunks for the commit.
- Dependency updates: keep manifest and lockfile changes together, and avoid
  mixing dependency bumps with code changes unless the dependency change is
  required for the same logical change.
- Generated files: commit them with the source change only when the repo
  requires generated artifacts to be versioned.

Separating commits by meaning
----------------------------

Rule: if changes are logically independent or would naturally have different
commit types, split them.
Exception: tests that are part of a fix usually stay with the fix.

Wrong (one commit mixes unrelated changes):

```text
fix(config): correct timeout default
```

But the commit actually contains:
- a runtime timeout bug fix;
- a new pre-commit hook;
- documentation updates.

Correct (split by meaning):

```text
fix(config): use correct timeout default
build(devx): add pre-commit lint hook
docs: document configuration constants
```

Tests with fixes
----------------

Default: commit a bug fix and its tests together for bisectability.
Split only when the test change is large/reusable, or when keeping it together
would hide the main change.

AI AGENT GUARDRAILS
-------------------

- Derive type and scope from the actual diff and repo conventions, not from
  the task wording alone.
- Never invent ticket IDs, commit SHAs, migration steps, or `BREAKING CHANGE`
  claims.
- Omit scope instead of inventing a one-off scope.
- Never state that builds/tests passed unless you actually ran the relevant
  commands.
- Do not use `--no-verify`, `--force`, or history rewrite on a shared branch
  unless the task/project explicitly allows it.
- On personal branches, prefer `git commit --fixup`,
  `git commit --fixup=reword`, `git commit --amend`, and
  `git rebase --autosquash` to clean up review feedback before merge.

HISTORY POLICY FOR SHARED BRANCHES
----------------------------------

No force push
-------------

- Forbidden: `git push --force` to shared branches (`main`, `develop`, release
  branches).
- Allowed on your own branches when rewriting history, but use
  `--force-with-lease`, not `--force`.
- Shared branches should be protected in the hosting platform to enforce this
  policy.

No merge commits (linear history)
---------------------------------

- Shared branches must be linear.
- Merge via PR using rebase and merge when the branch contains multiple
  meaningful commits and you want to preserve them.
- Merge via PR using squash and merge when the branch is a single logical
  change or contains WIP/fixup commits.
General guideline:
- If commits are already clean and atomic, preserve them (rebase and merge).
- If commits are noisy, clean them up first (interactive rebase) or squash at
  merge time.
- Before merging to a shared branch, remove `fixup!`, `amend!`, and similar
  temporary cleanup commits unless squash merge will collapse them.

LANGUAGE POLICY
---------------

English only: commit messages, branch names, and PR titles.
Keep externally defined identifiers unchanged (`ABC-123`, product names,
API names, version tags).

COMMIT EXAMPLES
---------------

Short (subject only)
--------------------

```bash
git commit -m "fix(api): return 400 on invalid token"
```

```bash
git commit -m "chore(deps): bump axios to 1.7.0"
```

```bash
git commit -m "docs: add runbook for database restore"
```

Extended (subject + body + footer)
----------------------------------

Prefer using your editor (`git commit`) for multi-line messages.

```text
refactor(api): extract validation layer

Move request validation out of controllers to improve testability.

Refs: ABC-123
```

```text
feat(auth)!: replace API keys with OAuth 2.0

BREAKING CHANGE: API keys are no longer accepted. Use OAuth 2.0 bearer tokens.
```

Revert
------

`git revert <sha>` creates a Git-generated revert message by default:

```text
Revert "feat(auth): add OAuth 2.0 login"

This reverts commit abc123def.
```

If your workflow normalizes the final subject to Conventional Commits before
merge, rewrite it:

```text
revert(auth): remove OAuth 2.0 login

This reverts commit abc123def.
```

Incorrect examples
------------------

```text
Added new feature                  # No Conventional Commit type
feat: Added new feature            # Not imperative
feat: add OAuth 2.0.               # Period at end
FEAT: add OAuth 2.0                # Types are lowercase
update                             # Too vague, no type
fix!: critical security issue      # `!` is for breaking changes, not severity
chore/build: update bundler        # Invalid type notation
```

CHECKLIST FOR EACH COMMIT
-------------------------

- Type is valid and matches the outcome of the change.
- Scope (if used) is stable and accurate; otherwise omit it.
- Subject is English, imperative, no period, and concise.
- Commit is atomic and leaves the branch in a working state.
- Relevant checks/tests were run, or their status is noted in the PR.
- Breaking changes are marked with `!` and a `BREAKING CHANGE:` footer.
- Footers match intent (`Refs` for traceability, `Closes` for closing issues).
- No secrets, credentials, or private keys were committed.
- If a secret was exposed, rotate/revoke it and follow secret-remediation
  procedure; do not rely on a revert alone.
- No WIP/fixup/amend cleanup commits remain before merging to a shared branch
  unless squash merge will collapse them.
- Update `CHANGELOG.md` only when the repo's PR/release workflow requires it.
