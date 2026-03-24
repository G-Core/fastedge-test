---
doc_type: policy
audience: bot
lang: en
tags: ['markdown', 'lint', 'rules']
last_modified: 2026-03-15T18:05:44Z
copyright: '© 2026 gcore.com'
---

# MARKDOWN RULES

## TL;DR

This file is the source of truth for markdown linting in this repository.
Only the rule blocks in `## ENFORCEABLE RULES` change checker behaviour.
Use these rules through `markdown-lint`.
Frontmatter is enforced separately through `.claude/rules/frontmatter.md` and
`frontmatter-lint`.

## PURPOSE

Use this file to define repository-wide markdown requirements in a form that is clear to
both humans and AI agents.

This file separates three things on purpose:

1. Scope: which markdown files are checked by `markdown-lint`.
2. Contract: how enforceable rules must be written.
3. Rules: the actual markdown requirements the checker must apply.

Text outside `## ENFORCEABLE RULES` explains the system but is not itself a lint rule.

## RULE AUTHORING CONTRACT

The lint skill must treat only the `###` sections inside `## ENFORCEABLE RULES` as
enforceable rules.

Each rule block heading must use this format:

```text
### <rule-id> — <short title>
```

`<rule-id>` must be unique within the file and must not change between edits.

Each rule block must contain these labelled fields in this order:

1. `Scope:`
2. `Requirement:`
3. `Violation:`
4. `Enforcement:`
5. `Auto-fix:`
6. `Manual action:`

Allowed `Enforcement:` values are:

- `skip`
- `auto-fix`
- `manual`
- `auto-fix if deterministic, otherwise manual`

Within rule blocks, use `must` and `must not` for enforceable requirements, `should`
for guidance, and `may` for optional behaviour.

A valid leading YAML frontmatter block is any block that follows the frontmatter
schema defined in `.claude/rules/frontmatter.md`.

Paths and glob patterns are repository-relative, use forward slashes, and interpret `**`
as zero or more directories.

Changing the text inside a rule block changes lint behaviour immediately.
Changing text outside the rule blocks does not.

If a future rule block is missing a required labelled field, uses an unsupported
`Enforcement:` value, or contradicts itself, the checker must report that rule as a
rules-file issue and skip it.

## NON-NORMATIVE GUIDANCE

Keep formatting minimal.
Prefer inline code for commands, file names, parameters, and short identifiers.
Prefer fenced code blocks over indented code blocks.
Prefer lower-case code fence tags such as `bash`, `yaml`, `json`, and `text`.

These are style preferences.
Only the rule blocks below are enforceable.

## ENFORCEABLE RULES

### MD-01 — Whole-file exclusions
Scope: Whole-file path exclusions.
Requirement: Ignore these files completely:
  - `AGENTS.md`
  - `CLAUDE.md`
  - `.codex/**/*.md`
  - `specs/**/*.md`
  Example: `specs/api/errors.md` is out of scope. `docs/specs/api/errors.md` remains in
  scope.
Violation: Not applicable. These files are outside scope.
Enforcement: skip
Auto-fix: none.
Manual action: none.

### MD-02 — Single document H1
Scope: Every in-scope file not skipped by an earlier rule.
Requirement: After any valid leading YAML frontmatter block, the first non-empty line of
  the markdown body must start the one and only H1 that names the document. ATX and
  Setext H1 syntax are both allowed. Example (valid): `# MARKDOWN RULES`. Example
  (invalid): `## MARKDOWN RULES` when no H1 exists anywhere in the file.
Violation: There is no H1, more than one H1, or non-empty content appears before the H1.
Enforcement: auto-fix if deterministic, otherwise manual
Auto-fix: If the body contains only leading blank lines before an otherwise valid H1,
  remove the blank lines. If the top of the body already contains exactly one obvious
  title line or one H1-equivalent Setext title, normalize it to a single H1 without
  changing meaning. Otherwise do not guess.
Manual action: Add or repair the H1. The document title cannot be determined safely.

### MD-03 — Language-switch link placement
Scope: Every in-scope file not skipped by an earlier rule that either has at least one
  translation counterpart under `i18n/` or already contains a language-switch link.
Requirement: Two language-switch patterns are recognized:
  1. Document-level: one blockquote line that starts with `> i18n:`. It must appear
     immediately after the H1 and before `## TL;DR`. The line may contain one or more
     `[TAG](path)` entries separated by ` | `. Each `TAG` must be an uppercase BCP 47
     primary language tag matching the existing repository convention. Each `path` must
     be the relative path from the current file to an existing counterpart. Do not
     include the current file itself as a target. Example:
     `> i18n: [DE](i18n/de/markdown.md) | [JA](i18n/ja/markdown.md)`.
  2. Body-level: inline `[TAG](path) | [TAG](path)` segments within content. Entries use
     the same tag, path, separator, and target-existence rules as the document-level
     line.
  Compute every `path` relative to the current file. Do not hardcode prefixes such as
  `../../`; nested files must still resolve correctly.
Violation: A document-level `> i18n:` line is missing when counterparts exist, is not
  immediately after the H1, appears more than once, contains duplicate or malformed
  tags, links to the current file, points to a missing file, uses the wrong relative
  path, or uses inconsistent formatting. A body-level segment that breaks the same rules
  is also a violation.
Enforcement: auto-fix if deterministic, otherwise manual
Auto-fix: If the file contains exactly one document-level `> i18n:` line in the wrong
  position, move it to immediately after the H1. If each link target can be resolved
  unambiguously from repository state, fix tag formatting, recompute relative
  paths, and insert or rewrite the document-level line. Recompute body-level segment
  paths only when the intended targets are unambiguous. Otherwise do not guess.
Manual action: Add or repair language-switch links when the counterpart set is missing,
  ambiguous, or intentionally incomplete.

### MD-04 — TL;DR section
Scope: Every in-scope file not skipped by an earlier rule.
Requirement: A `## TL;DR` section must appear immediately after the H1 and any
  document-level language-switch line placed by MD-03. Its body must contain three to
  five consecutive non-empty lines of prose. Inline code and inline links are allowed.
  Do not use lists, tables, headings, or code fences inside this section. Example
  (invalid): `- Summary point`.
Violation: The section is missing, uses another heading text or level, is not in the
  required position, contains fewer than three lines, contains more than five lines, or
  uses list, table, heading, or code-fence syntax.
Enforcement: auto-fix if deterministic, otherwise manual
Auto-fix: If the file already contains exactly one `TL;DR` section whose body meets
  the line and content rules but is in the wrong position, move it. If the heading
  differs only by case or heading level and the meaning is clear, normalize it to
  `## TL;DR`. Do not generate, paraphrase, or summarize new text.
Manual action: Add or rewrite the `## TL;DR` section when content must be authored,
  condensed, or split into valid lines.

### MD-05 — Fenced code block language tags
Scope: Every fenced code block in every in-scope file not skipped by an earlier rule.
Requirement: Every fenced code block must declare an explicit lower-case info string.
  Indented code blocks are not allowed because they cannot declare one consistently. Use
  `text` for plain output, transcripts, placeholder text, or mixed command/output
  examples. Use `bash` only for executable POSIX shell content without prompts or
  output. Use `yaml`, `json`, or the appropriate lower-case language name for structured
  data and source code. Example (valid): use `bash` for `pnpm lint` and `text` for a
  transcript that includes `$ pnpm lint` plus output.
Violation: A fenced block has no info string, uses an indented code block, uses a
  clearly wrong tag, or is tagged `bash` even though it contains prompts, output, or
  non-shell prose.
Enforcement: auto-fix if deterministic, otherwise manual
Auto-fix: Add `text` to an untagged fence that contains only plain output, placeholder
  text, or a mixed command/output transcript. Add `yaml` to a fence that is clearly YAML.
  Add `json` to a fence that is strict JSON. Add `bash` only to a fence that contains
  executable POSIX shell commands with no prompts or output. Convert an indented block
  into a fenced block only when its boundaries are unambiguous. Otherwise do not guess.
Manual action: Add or correct the info string, or convert an indented block into a
  fenced block with an explicit info string.

### MD-06 — Bash block copy-paste safety
Scope: Every fenced code block tagged `bash` in every in-scope file not skipped by an
  earlier rule.
Requirement: A `bash` block must be safe to paste as-is. It may contain one or more
  lines when those lines are meant to be run together or sequentially. Do not include
  interactive prompts, captured output, or narrative prose inside the block. Shell
  comments are allowed only when they are part of the pasted example and do not replace
  surrounding explanation. Use `text` for transcripts and output. Example (invalid): a
  block that starts with `$ pnpm lint`.
Violation: The block contains interactive prompts, output lines, narrative prose, or a
  sequence of lines that cannot be pasted safely in order.
Enforcement: manual
Auto-fix: none.
Manual action: Move output or prompts into `text` blocks, move explanations into
  surrounding prose, and split transcripts into separate `bash` and `text` blocks when
  needed.

### MD-07 — Line length
Scope: Every in-scope file outside valid leading YAML frontmatter blocks, fenced code
  blocks, markdown tables, link reference definitions, and standalone link/image-only
  lines that was not skipped by an earlier rule.
Requirement: Lines must be 120 characters or fewer unless the extra length comes from
  a single unbreakable token such as a bare URL, link destination, or hash. Example
  (invalid): a long prose line with spaces beyond column 120.
Violation: A non-exempt line exceeds 120 characters.
Enforcement: auto-fix if deterministic, otherwise manual
Auto-fix: Reflow plain paragraphs, list items, and block quotes without changing words,
  link destinations, markdown structure, or meaning. Do not reflow headings, frontmatter
  values, markdown tables, link reference definitions, or exempt long-token lines.
  Otherwise do not guess.
Manual action: Shorten or restructure the long line without changing meaning or markdown
  rendering.
