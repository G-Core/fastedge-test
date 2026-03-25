---
doc_type: policy
audience: all
lang: en
tags: ['markdown', 'frontmatter', 'lint', 'rules']
last_modified: 2026-03-15T17:58:03Z
copyright: '© 2026 gcore.com'
---

# FRONTMATTER RULES

## TL;DR

This file is the source of truth for frontmatter linting in this repository.
Only the rule blocks in `## ENFORCEABLE RULES` change checker behaviour.
Use these rules through `frontmatter-lint`.
`.claude/rules/markdown.md` is enforced separately through `markdown-lint`.
Change rules here, not in the skill; the skill must execute these rules as written.

## PURPOSE

Use this file to define repository-wide frontmatter requirements in a form that is clear
to both humans and AI agents.

This file separates three things on purpose:

1. Scope: which markdown files are checked.
2. Contract: how enforceable rules must be written.
3. Rules: the actual frontmatter requirements the checker must apply.

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

Path patterns used in rule blocks are repo-relative POSIX globs. Use `/` as the
separator. Match case-sensitively. `*` matches within one path segment. `**`
matches zero or more complete path segments.

Changing the text inside a rule block changes lint behaviour immediately.
Changing text outside the rule blocks does not.

If a future rule block is missing a required labelled field, uses an unsupported
`Enforcement:` value, or contradicts itself, the checker must report that rule as a
rules-file issue, skip it, and continue with the remaining valid rules.

## NON-NORMATIVE GUIDANCE

Keep schemas explicit.
Prefer fixed key order only when it clearly improves readability or validation.
Prefer wording that a machine can evaluate over subjective wording.
Do not mix markdown rules into this file.

These are style preferences.
Only the rule blocks below are enforceable.

## ENFORCEABLE RULES

### FM-01 — Whole-file exclusions
Scope: Whole-file repo-relative path exclusions.
Requirement: Ignore these files completely:
  - `AGENTS.md`
  - `CLAUDE.md`
  - `README.md`
  - `.codex/**/*.md`
  - `.specify/memory/**/*.md`
  - `.specify/templates/**/*.md`
  - `specs/**/*.md`
Violation: Not applicable. These files are outside scope.
Enforcement: skip
Auto-fix: none.
Manual action: none.

### FM-02 — Standard frontmatter skip for internal files
Scope: Standard frontmatter rules FM-03 through FM-09 for every file whose
  repo-relative path matches any of the following:
  - `.claude/commands/*.md`
  - `.claude/skills/**/*.md`
Requirement: Do not apply FM-03 through FM-09 to these files. This skip does not
  disable specialized frontmatter schemas such as FM-10 or FM-11 when their scopes
  match.
Violation: Not applicable. The standard frontmatter family is out of scope for these
  files.
Enforcement: skip
Auto-fix: none.
Manual action: none.

### FM-03 — Standard frontmatter block
Scope: Every in-scope `.md` file not covered by FM-10 or FM-11.
Requirement: The file must start with a YAML frontmatter block. The opening
  delimiter must be the first bytes of the file, so no BOM, whitespace, or comments
  may appear before it. A valid block here means an opening line exactly `---`, a
  YAML top-level mapping, and a closing line exactly `---`. Top-level keys must be
  unique. The required keys must appear in this order: `doc_type`, `audience`,
  `lang`, `tags`, `last_modified`, `copyright`. Extra keys are allowed only after
  those required keys. This is the default frontmatter schema for all remaining
  in-scope markdown files.
Violation: The frontmatter block is missing, not first, missing its closing
  delimiter, is not a top-level mapping, is malformed YAML, duplicates a top-level
  key, is missing a required key, or places the required keys in a different order.
Enforcement: auto-fix if deterministic, otherwise manual
Auto-fix: If the frontmatter block exists and parses as a top-level mapping,
  preserve already valid values and auto-fix each deterministic field under FM-04
  through FM-09. If the block is missing or malformed, insert or rebuild it only
  when all six required keys can be written with valid values safely. Always write
  the complete block with all six required keys in the correct order. Never write
  placeholder values. If any required key cannot be determined safely, report that
  key as a separate manual item and do not rebuild the block automatically.
Manual action: Add or repair the standard frontmatter block intentionally. The
  block could not be rebuilt with valid deterministic values.

### FM-04 — `doc_type`
Scope: The `doc_type` field in every file covered by FM-03.
Requirement: `doc_type` must match `^[a-z0-9]+(?:-[a-z0-9]+)*$`. Use one of these
  common values when they fit exactly: `policy`, `reference`, `guide`, `meta`,
  `spec`. Other values are allowed only when they follow the same format and are
  clearly more precise.
Violation: `doc_type` is missing, empty, does not match the required format, or is
  clearly mismatched to the document purpose.
Enforcement: auto-fix if deterministic, otherwise manual
Auto-fix: Determine `doc_type` from the document purpose. Use `policy` for rules
  and requirements. Use `reference` for definitions, schemas, APIs, or lookup
  material. Use `guide` for step-by-step instructions. Use `meta` for indexes,
  navigation, or link collections. Use `spec` for formal technical contracts. If
  more than one value fits equally well, do not guess.
Manual action: Choose `doc_type` intentionally. The document fits more than one
  type equally well.

### FM-05 — `audience`
Scope: The `audience` field in every file covered by FM-03.
Requirement: `audience` must be exactly one of `human`, `bot`, or `all`.
Violation: `audience` is missing, uses another value, or clearly mismatches the
  document.
Enforcement: auto-fix if deterministic, otherwise manual
Auto-fix: Use `bot` when the file lives in `.claude/` and clearly addresses an
  agent directly or uses machine-oriented rule language such as MUST, NEVER, or
  ALWAYS. Use `human` for explanatory text, tutorials, and user-facing
  documentation. Use `all` only when both humans and agents are clearly first-class
  readers. Do not use `all` as a fallback for uncertainty. If `human` and `bot`
  fit equally well, do not guess.
Manual action: Choose `audience` intentionally. The intended reader is truly
  unclear.

### FM-06 — `lang`
Scope: The `lang` field in every file covered by FM-03.
Requirement: `lang` must be a well-formed BCP 47 language tag for the primary
  natural language of the document body. Ignore fenced code blocks and inline code
  while detecting language.
Violation: `lang` is missing, empty, malformed, or clearly wrong for the document
  body.
Enforcement: auto-fix
Auto-fix: Detect the main natural language of the non-code text and write the
  simplest accurate tag, such as `en` or `ru`. Add script or region subtags only
  when needed for accuracy, such as `pt-BR` or `zh-Hans`. If the
  non-code text is too little or too mixed to identify a primary language reliably,
  write `und`.
Manual action: none.

### FM-07 — `tags`
Scope: The `tags` field in every file covered by FM-03.
Requirement: `tags` must be a YAML flow sequence containing one to five unique
  tags. Each tag must match `^[a-z0-9]+(?:-[a-z0-9]+)*$`.
Violation: `tags` is missing, empty, contains duplicates, contains more than five
  items, or contains an item that does not match the required format.
Enforcement: auto-fix
Auto-fix: Get candidate text from the document H1 and H2 headings first. If that
  gives no usable tags, get candidate text from the repo-relative file name and
  parent directory names. Use exact words or multiword phrases already present in
  those sources. Do not invent synonyms, shorten words, or add concepts that are
  not written there. Normalize by lowercasing, converting spaces and underscores to
  hyphens, removing other punctuation, removing repeated hyphens, trimming
  leading and trailing hyphens, removing empty results, removing duplicates, and
  keeping at most five items in source order.
Manual action: none.

### FM-08 — `last_modified`
Scope: The `last_modified` field in every file covered by FM-03.
Requirement: `last_modified` must use the exact UTC format `YYYY-MM-DDTHH:mm:ssZ`.
Violation: `last_modified` is missing, malformed, or was not updated after the
  checker changed the file.
Enforcement: auto-fix
Auto-fix: Whenever the checker writes a file covered by FM-03, get the current
  UTC timestamp from the runtime and set `last_modified` to that value in the
  required format. On Unix-like systems, `date -u +"%Y-%m-%dT%H:%M:%SZ"` is an
  acceptable equivalent command. Do not guess or hardcode the time. Do not change
  `last_modified` in untouched files.
Manual action: none.

### FM-09 — `copyright`
Scope: The `copyright` field in every file covered by FM-03.
Requirement: `copyright` must be exactly `'© <current_year> gcore.com'`, with
  `<current_year>` replaced by the current UTC year.
Violation: `copyright` is missing or differs from the required text.
Enforcement: auto-fix
Auto-fix: Replace the value with the exact required text for the current UTC year.
Manual action: none.

### FM-10 — Skill entrypoint frontmatter
Scope: Every file whose repo-relative path matches `.claude/skills/*/SKILL.md`.
Requirement: The file must start with a YAML frontmatter block. The opening
  delimiter must be the first bytes of the file. A valid block here means an
  opening line exactly `---`, a YAML top-level mapping, and a closing line exactly
  `---`. Top-level keys must be unique. The first four keys must be exactly `name`,
  `description`, `last_modified`, `copyright` in that order. `name` must match
  `^[a-z0-9]+(?:-[a-z0-9]+)*$`. `description` must be a non-empty scalar string
  that states what the skill does and when it should be used. `last_modified` must
  use the exact UTC format `YYYY-MM-DDTHH:mm:ssZ`. `copyright` must be exactly
  `'© <current_year> gcore.com'`, with `<current_year>` replaced by the current UTC
  year. After those four required keys, these optional keys are allowed in any
  order: `argument-hint` (non-empty string), `disable-model-invocation` (boolean),
  `user-invocable` (boolean), `allowed-tools` (non-empty comma-separated string of
  non-empty tokens), `model` (non-empty string), `context` (non-empty string),
  `agent` (non-empty string), `hooks` (YAML object). No other keys are allowed.
Violation: The block is missing, not first, missing its closing delimiter, is not a
  top-level mapping, is malformed YAML, duplicates a top-level key, is missing a
  required key, uses a different required-key order, places an allowed optional key
  before the required block, contains an unknown key, or contains a value with the
  wrong type or an empty string where a non-empty string is required.
Enforcement: auto-fix if deterministic, otherwise manual
Auto-fix: If the block parses as a top-level mapping, all present keys are allowed
  by this schema, and only deterministic issues remain, fix the required-key
  order and update `last_modified` and `copyright`. Do not invent or rewrite
  non-deterministic fields such as `name`, `description`, `allowed-tools`,
  `model`, `context`, `agent`, or `hooks`. If any unknown key, missing
  non-deterministic required value, or invalid optional value is present, stop and
  report manual action.
Manual action: Repair the skill-entrypoint frontmatter intentionally. This path uses
  a different schema from standard markdown files and non-deterministic fields must
  not be guessed.

### FM-11 — Command frontmatter schema
Scope: Every file whose repo-relative path matches `.claude/commands/*.md`.
Requirement: The file must start with a YAML frontmatter block. The opening
  delimiter must be the first bytes of the file. A valid block here means an
  opening line exactly `---`, a YAML top-level mapping, and a closing line exactly
  `---`. Top-level keys must be unique. The first three keys must be exactly
  `description`, `last_modified`, `copyright` in that order. `description` must be a
  non-empty scalar string. `last_modified` must use the exact UTC format
  `YYYY-MM-DDTHH:mm:ssZ`. `copyright` must be exactly `'© <current_year> gcore.com'`,
  with `<current_year>` replaced by the current UTC year. After those required
  keys, these optional keys are allowed in any order: `handoffs` (YAML list of
  objects, where each object contains non-empty string `label`, non-empty string
  `agent`, non-empty string `prompt`, and optional boolean `send`), `name`
  (non-empty string), `argument-hint` (non-empty string),
  `disable-model-invocation` (boolean), `user-invocable` (boolean), `allowed-tools`
  (non-empty comma-separated string of non-empty tokens), `model` (non-empty
  string), `context` (non-empty string), `agent` (non-empty string), `hooks`
  (YAML object). No other keys are allowed.
Violation: The block is missing, not first, missing its closing delimiter, is not a
  top-level mapping, is malformed YAML, duplicates a top-level key, is missing a
  required key, uses a different required-key order, places an allowed optional key
  before the required block, contains an unknown key, or contains a value with the
  wrong type or an empty string where a non-empty string is required.
Enforcement: auto-fix if deterministic, otherwise manual
Auto-fix: If the block parses as a top-level mapping, all present keys are allowed
  by this schema, and only deterministic issues remain, fix the required-key
  order and update `last_modified` and `copyright`. Do not invent or rewrite
  non-deterministic fields such as `description`, `handoffs`, `name`,
  `argument-hint`, `allowed-tools`, `model`, `context`, `agent`, or `hooks`. If
  any unknown key, missing non-deterministic required value, or invalid optional
  value is present, stop and report manual action.
Manual action: Repair the command frontmatter intentionally. This schema is
  separate from the standard markdown frontmatter and non-deterministic fields must
  not be guessed.

## EXAMPLES

Standard frontmatter example:

```yaml
---
doc_type: policy
audience: all
lang: en
tags: ['markdown', 'lint']
last_modified: 2026-03-07T14:30:00Z
copyright: '© 2026 gcore.com'
---
```

Invalid standard frontmatter example:

```yaml
---
audience: TODO
doc_type: Policy
lang: english
tags: ['Frontmatter', 'lint']
last_modified: 2026/03/07 14:30:00
copyright: © 2026 gcore.com
---
```

Skill entrypoint frontmatter example:

```yaml
---
name: frontmatter-lint
description: lint and optionally auto-fix markdown frontmatter against the
  repository frontmatter rules
last_modified: 2026-03-08T19:43:21Z
copyright: '© 2026 gcore.com'
allowed-tools: Read,Write,Edit,Bash
---
```

Command frontmatter example:

```yaml
---
description: Generate a quality checklist for the PRD and validate it.
last_modified: 2026-03-08T19:21:18Z
copyright: '© 2026 gcore.com'
handoffs:
  - label: Clarify Gaps
    agent: prdkit.clarify
    prompt: Resolve the gaps found during validation
  - label: Analyze Consistency
    agent: prdkit.analyze
    prompt: Run cross-section consistency analysis on the PRD
    send: true
---
```

Invalid command frontmatter example:

```yaml
---
name: prd-validator
description:
last_modified: 2026-03-08
copyright: '© 2026 gcore.com'
handoffs:
  - label: Clarify Gaps
    prompt: Resolve the gaps found during validation
---
```
