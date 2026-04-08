---
name: markdown-lint
description: >-
  lint and optionally auto-fix markdown files against
  `.claude/rules/markdown.md`. use this skill when asked to check, lint,
  validate, normalize, or fix markdown structure, headings, tl;dr sections,
  code fences, bash blocks, or line length in markdown files.
last_modified: 2026-03-10T09:33:25Z
copyright: '© 2026 gcore.com'
---

# markdown-lint

## TL;DR

Load `.claude/rules/markdown.md`.
Apply only the rules declared in that file; do not restate or invent extra rules.
Check only markdown-body ownership. Frontmatter is out of scope for this skill.
Fix only what the rules mark as auto-fixable and only when the result is deterministic.

## PROCESS

Run the workflow in order and do not skip steps.

### 1. Load the rules file

Default path: `.claude/rules/markdown.md`.

If the caller explicitly provides another rules-file path, use that path instead.

If the chosen rules file does not exist:
- when the request comes from a human, ask once for the correct path;
- when the request comes from an automated caller, return an error and stop.

If the file exists but cannot be read as markdown text, return an error and stop.

### 2. Parse the rules file contract

Read the rules file and extract the `## ENFORCEABLE RULES` section.

Treat only `###` subsections inside that section as executable rules.
Ignore examples, guidance, and all other prose outside that section.

For each rule block:

1. Parse the rule ID from the `### <rule-id> — <short title>` heading.
2. Require these labelled fields in this order:
   `Scope:`, `Requirement:`, `Violation:`, `Enforcement:`, `Auto-fix:`,
   `Manual action:`.
3. Accept only these `Enforcement:` values:
   - `skip`
   - `auto-fix`
   - `manual`
   - `auto-fix if deterministic, otherwise manual`

A rule is invalid if any required field is missing, duplicated, out of order,
contradicts itself, or uses an unsupported enforcement value.

Invalid rules are never applied.
Record each invalid rule under `## Rules file issues` in the report and continue with the
remaining valid rules.

If the rules file contains no valid rule blocks, return an error and stop.

### 3. Determine the file scope

If the caller named specific files, use exactly those files.

If the caller did not name files:
- when the request comes from a human, ask once whether to check all `.md` files or a
  specific subset;
- when the request comes from an automated caller, check all `.md` files in the project.

Convert every candidate path to a repo-relative path.
Discard duplicates.
Sort the final candidate list in alphabetical path order before processing.

Evaluate path-only skip rules before reading file content.
If a skip rule requires content to evaluate, or excludes only a subset of rules or cases,
read only the minimum needed to evaluate that skip and continue processing the file for
all remaining applicable rules.
Stop processing a file only when a skip rule excludes the whole file.

Whole-file skips must appear under `## Skipped files`, must not be modified, and must not
receive any further rule results.
Files affected only by scoped skips must still be checked normally for later applicable
rules and must appear under `## File results`.

If a requested file does not exist, add it to `## File errors`, keep processing the rest,
and do not count it as checked.

### 4. Inspect each file

Process files one by one in alphabetical path order.

Before processing the first file, capture one run-scoped UTC snapshot. Use that same
snapshot for every rule that explicitly requires the current UTC date or year.

For each non-skipped file:

1. Read the file once.
2. Parse these structures as needed for rule evaluation:
   - optional leading valid YAML frontmatter block, only to identify the markdown body;
   - headings;
   - fenced code blocks and their language tags;
   - indented code blocks;
   - markdown tables;
   - physical line numbers.

Then evaluate the valid rules in the same order as they appear in the rules file.

### 5. Apply each rule

For each applicable rule, decide whether the file violates it by using only:
- the current file content;
- the file path;
- the rule text itself;
- when a rule explicitly requires current UTC values, the run-scoped UTC snapshot
  captured for this run.

Do not invent hidden file classes or extra requirements that are not written in the rules
file.

Treat frontmatter ownership strictly:
- Do not validate, repair, or report frontmatter schema issues with this skill.
- Treat a valid leading YAML frontmatter block as out of scope for markdown findings.
- If the opening block looks like frontmatter but is malformed, do not report that as a
  markdown issue. Continue only with markdown violations whose locations are still
  unambiguous in the body.

Apply enforcement exactly as written:

- `skip`:
  apply the whole-file versus scoped-skip semantics defined in step 3.
- `auto-fix`:
  modify the file only if the rule's `Auto-fix:` text defines a mechanical result that can
  be produced without choosing between multiple valid outcomes.
- `manual`:
  do not change the file; record a manual-action item using the rule ID and the rule's
  `Manual action:` text.
- `auto-fix if deterministic, otherwise manual`:
  auto-fix only when there is one safe result. If two or more possible results remain, do
  not guess; record a manual-action item instead.

When a rule says `none.` or `none` in `Auto-fix:` or `Manual action:`, treat that field as
empty.

### 6. Determinism and safety test

A result is deterministic only when all of these are true:

1. The rule itself describes the target state precisely enough to produce one valid result.
2. The fix can be derived from the allowed inputs above without asking new questions.
3. The fix does not change document meaning, create new requirements, or introduce new
   meaningful content beyond what is already present in the file or explicitly required
   by the rule.
4. The fix does not make another applicable rule harder to satisfy.

If any of those checks fails, treat the case as manual unless the rule explicitly says
otherwise.

When multiple violations overlap, prefer the smallest safe change that keeps the file in a
valid state.
If fixing one item in isolation would leave the file partially broken, record the grouped
issue as one manual-action item instead of applying a partial fix.
Do not block a rule-authorized fix only because separate manual items remain after the
safe fix is applied.

### 7. Edge cases

Handle edge cases this way:

- Empty file:
  apply the normal rules. If required content cannot be derived safely, report the missing
  content as manual rather than inventing it.
- Valid frontmatter:
  use it only to locate the start of the markdown body. Do not lint or rewrite it.
- Malformed frontmatter:
  do not repair it and do not report it. Continue only with body-local markdown issues
  whose positions remain clear.
- Rule text that cannot be applied to the current file:
  record a rules-file issue for that rule and skip it for every file in this run.
- Explicit one-off exceptions from the caller:
  apply them only for this run and mention them under `## Notes`.
  Do not rewrite the rules file.
- Binary, unreadable, or non-text files with a `.md` extension:
  record a file error and continue.

### 8. Write changes

Modify a file only when at least one auto-fix was actually applied.

Write the file once after all auto-fixes for that file are decided.
Preserve unchanged content byte-for-byte as much as possible outside the edited ranges.

If manual issues remain, still write the file when the applied auto-fixes are safe and the
resulting state remains valid as far as deterministic enforcement can take it.
Do not write a partial result only when the written state itself would be unsafe,
structurally broken, or guess-dependent.
When safe fixes are written and manual items remain, report the file as `fixed+manual`.

### 9. Build the report

Always output the report in exactly this structure and in this order:

```text
# Markdown lint report

Rules file: <repo-relative-path>
Requested scope: <human request or auto-detected scope>
Mode: fix what is allowed, report the rest

## Rules file issues
- none
```

If there are rules-file issues, replace `- none` with one bullet per issue in this form:

```text
- [<rule-id>] <reason>. Skipped.
```

Then continue with these sections in this exact order:

```text
## Skipped files
- <path> — <reason>
```

Use `- none` when the section is empty.

```text
## File errors
- <path> — <reason>
```

Use `- none` when the section is empty.

```text
## File results

### <path>
Status: clean | fixed | manual | fixed+manual
Applied fixes:
- [<rule-id>] <location> — <description>
Manual actions:
- [<rule-id>] <location> — <instruction>
Notes:
- none
```

Rules for `## File results`:

- Include one subsection for every checked file, in alphabetical path order.
- Files affected only by scoped skips still count as checked files and must appear here.
- `Status:` values are exclusive and must be exactly one of the four listed values.
- Use `fixed+manual` whenever at least one auto-fix was written and at least one manual
  action remains.
- When no fixes were applied, write `Applied fixes:` on one line and `- none` on the next.
- When no manual actions were recorded, write `Manual actions:` on one line and `- none`
  on the next.
- When there are no file-specific notes, write `Notes:` on one line and `- none` on the
  next.
- Use final-file line numbers for manual actions when the location is still stable after
  fixes. Otherwise use one of these location labels: `H1`, `TL;DR`, `code block`,
  `table`, `file-wide`.

Finish with this exact summary section:

```text
## Summary
Files checked: <number>
Files changed: <number>
Fixes applied: <number>
Manual actions: <number>
Files skipped: <number>
File errors: <number>
Rules file issues: <number>
```

If there are no fixes, no manual actions, no skipped files, no file errors, and no rules-
file issues, still output the full report above.
In that case `## Rules file issues`, `## Skipped files`, and `## File errors` each use
`- none`, every checked file still appears under `## File results` with `Status: clean`,
and the counts are all zero except `Files checked`.

## BOUNDARIES

Do not create, move, rename, or delete files.
Do not change the rules file unless the user explicitly asked to edit the rules file itself.
Do not validate, repair, or report frontmatter schema issues with this skill.
Do not silently ignore a markdown rule violation.
Do not ask more than the two questions allowed above:
1. the rules-file path when the default path is missing;
2. whether to lint all markdown files or a specific subset when no file scope was given.

Every other ambiguity must be resolved by the rule's enforcement mode:
fix if deterministic, otherwise report.
