---
name: plain-english
description: >-
  Simplify English in text files to B1-B2 CEFR level while preserving
  technical accuracy, document structure, and code elements. Use this skill
  when asked to simplify English, make documentation more readable, reduce
  language complexity, or rewrite technical docs in plain English:
  /plain-english <file>, "simplify the English in docs/setup.md", "make this
  doc easier to read for non-native speakers", "rewrite in plain English",
  and any mention of simplifying, clarifying, or reducing complexity of
  English prose in documentation — even if the user does not use the phrase
  "plain English". Supported file types are defined below.
last_modified: 2026-03-10T09:36:54Z
copyright: '© 2026 gcore.com'
---

# plain-english

## TL;DR

Reads a supported text file and rewrites English prose to B1-B2 CEFR level.
Preserves technical accuracy, document structure, code blocks, inline code,
URLs, paths, and technical terms. Writes the result as a `.simple-en` file,
then offers to overwrite the original.

## Process

Follow the steps strictly in order, skipping none.

### 1. Determine input parameters

Extract one parameter from the user's command:

- **File** — path to the text file to simplify

If the invocation is structured (`/plain-english <file>`), the parameter is explicit.
If free text ("simplify the English in docs/setup.md"), extract the file path from the text.

If the file is not specified — ask the user.

### 2. Read and validate the source file

Read the file at the specified path.

If the file is not found — report: `<path> not found` and stop.
If the file content is binary (non-text) — report: `<path> is binary, not a text file`
and stop.

Supported source files:

- Markdown: `.md`
- Flat plain text with extension: `.txt`
- Flat plain text without extension: `LICENSE`, `NOTICE`, `COPYING`, `AUTHORS`

Unsupported source files:

- Structured text: `.json`, `.yaml`, `.yml`, `.toml`, `.mdx`, `.rst`
- Config/build files: `Dockerfile`, `.gitignore`, `.env`, `Makefile`
- Source code files and any text files with syntax that must not be rewritten as prose

If the file is outside the supported set — report:
`<path> is a structured or unsupported text format. Simplification is supported only for
.md, .txt, LICENSE, NOTICE, COPYING, AUTHORS.`
and stop. Do not create an output file.

### 3. Detect the source language

Detection order:

1. For `.md` files: if valid YAML frontmatter with a `lang` field exists — use it
2. For all supported files: if language was not determined from frontmatter — detect
   from prose content
3. If detection is impossible — ask the user

If the file is not in English — report:
`<path> is not in English. This skill only simplifies English text.`
and stop. Do not create an output file.

Mixed language files (English prose with non-English fragments): treat as English.
Simplify only the English prose, leave non-English fragments unchanged.

### 4. Simplify prose to B1-B2

This is the key step. Rewrite English prose to B1-B2 CEFR level following the rules below.

#### What to simplify

- Paragraphs
- List item text (bulleted and numbered)
- Table cell text (text portion)
- Heading text (word choice only — preserve heading level and count)
- Blockquote text except the exact `> i18n:` line
- Link text (`[text](url)`) — simplify text only, leave the URL unchanged
- Image alt text (`![alt-text](url)`) — simplify alt text only, leave the URL unchanged

#### What NOT to simplify

- **Fenced code blocks** (` ```...``` `) — content must be byte-identical to the original
- **Inline code** (`` `...` ``) — content must be byte-identical to the original
- **URLs and file paths** — do not modify
- **YAML frontmatter values** — do not modify (frontmatter is handled separately in step 5)
- **The exact markdown line** `> i18n: [LANG](path)` — preserve byte-identical
- **Technical terms** — leave unchanged (see the "Technical terms" section)
- **Normative keywords** — leave exact force words unchanged: `MUST`, `SHOULD`, `MAY`,
  `NEVER`, `REQUIRED`, `RECOMMENDED`, `OPTIONAL`
- **Markdown structure** — heading levels, list markers, table syntax, link syntax, link
  targets, image syntax

#### Simplification guidelines

- Prefer common, familiar words over rarer synonyms when meaning stays exact.
- Split long sentences when one sentence carries more than one main idea.
- Prefer direct subject-verb-object order over many nested clauses when the meaning
  stays exact.
- Replace phrases that use too many abstract nouns with clear verbs when the technical meaning
  stays exact.
- Remove filler qualifiers that do not change the requirement or fact, such as
  "basically", "simply", "clearly", "obviously".
- Keep one requirement, fact, or action per sentence when possible.
- Avoid idioms, figurative language, and culture-specific phrasing.
- Expand contractions to their full forms (`isn't` → `is not`, `don't` → `do not`,
  `it's` → `it is`). Full forms are easier to parse for B1-B2 readers, especially in
  long sentences.
- Do not simplify a sentence if the simpler wording would weaken precision, scope, or
  normative force.

#### Preservation rules

These rules take priority over simplification — accuracy over simplicity:

- Preserve all technical facts and constraints — no information loss
- Do not add new information, opinions, or examples not in the original
- Do not change the tone from formal to informal or vice versa — keep neutral
  technical register
- Sentences already at B1-B2 level — leave unchanged
- Sentences that cannot be simplified without losing technical nuance — keep
  original wording

#### Mixed content

- Line with prose + inline code: simplify only the prose, leave inline code unchanged
- Table with description + code: simplify the description, leave code unchanged
- Markdown link: simplify only the visible link text, leave destination unchanged
- Markdown image: simplify only the alt text, leave destination unchanged
- Prose with non-English fragments: simplify only English, leave non-English unchanged
- Exact `> i18n:` line: preserve it byte-identical

### 5. Handle frontmatter

Skip this step for non-markdown files.

If the original contains YAML frontmatter:

1. Copy all frontmatter fields to the output
2. If a `last_modified` field exists, run `date -u +"%Y-%m-%dT%H:%M:%SZ"` to get
   the current UTC timestamp and set `last_modified` to the returned value
3. If the output markdown file would be in scope for
   `.claude/rules/frontmatter.md`, ensure the resulting frontmatter meets
   rules `FM-03` through `FM-09`
4. All other fields — byte-for-byte copy of the original

If the original contains invalid YAML frontmatter:

- Skip frontmatter processing
- Simplify the remaining content only
- Add a warning in the final output

If the original does not contain frontmatter:

- If the output markdown file would be in scope for
  `.claude/rules/frontmatter.md`, create standard frontmatter by applying
  rules `FM-03` through `FM-09`
- Set `lang` to `en`
- Run `date -u +"%Y-%m-%dT%H:%M:%SZ"` to get the current UTC timestamp and set
  `last_modified` to the returned value
- Preserve the simplified body below the generated frontmatter
- Otherwise do not add frontmatter

### 6. Check if already simple

Compare the simplified content (from steps 4–5) with the original file, ignoring
frontmatter and `last_modified` changes.

If the prose content is identical — the file is already at B1-B2 level. Report:

`<path> is already at B1-B2 level. No output file created.`

and stop. Do not create an output file.

### 7. Write the result

Output path — same directory as input, same filename with `.simple-en` suffix
before the extension:

- `docs/setup.md` → `docs/setup.simple-en.md`
- `notes/plan.txt` → `notes/plan.simple-en.txt`
- `LICENSE` → `LICENSE.simple-en`

Create directories if they do not exist.

If the output file already exists:

- When invoked by a human — use the AskUserQuestion tool to ask:
  `File <path> already exists. Overwrite?` with options Yes / No
- When invoked by an agent (another skill, automation) — overwrite without asking

If a human declines overwrite — stop and report:

`Skipped <output-path> (overwrite declined)`

### 8. Offer to overwrite original

After writing the `.simple-en` file, when invoked by a human — use the
AskUserQuestion tool to ask: `Overwrite original <source-path>?` with options
Yes / No.

If the human confirms:

1. Use a shell `cp` command to copy the `.simple-en` file over the original.
   Do not read the `.simple-en` file and rewrite it with the Write tool —
   use `cp <simple-en-path> <original-path>` to guarantee a byte-for-byte copy.
2. Delete the `.simple-en` file
3. Report: `Simplified <source-path> (in place)`

If the human declines:

- Keep both files
- Report: `Simplified <source-path> -> <output-path>`

When invoked by an agent (another skill, automation) — do not overwrite the original.
Report: `Simplified <source-path> -> <output-path>`

### 9. Report the result

If not already reported in step 8, output a single line:

`Simplified <source-path> -> <output-path>`

If there were issues (invalid YAML frontmatter skipped), add a warning.

## Technical terms

Well-known technical terms must be left unchanged — do not simplify or replace them.
Examples: API, SDK, CLI, URL, JSON, YAML, Docker, Kubernetes, Git, GitHub, npm,
Claude Code, pull request, deploy, webhook, frontend, backend, middleware.

This is not exhaustive — identify technical terms from context. When a term is
domain-specific jargon that the target audience (engineers) knows, preserve it.

If a term is inside inline code (`` `backticks` ``), it is already preserved
per the "What NOT to simplify" rules.

## Boundaries

- Simplify only the supported text files defined in step 2.
- Reject all other text formats and all binary files.
- One file per invocation. If asked to simplify multiple — simplify one,
  and inform the user that batch simplification is not supported.
- Do not translate — this skill simplifies English, it does not change the language.
- Do not add readability scores or metrics to the output.
- Do not modify code, commands, or technical terms.
- Do not modify the exact `> i18n:` line in markdown files.
- Do not check or compare the output against readability scoring systems
  (Flesch-Kincaid, etc.) — use the simplification guidelines as the quality bar.
