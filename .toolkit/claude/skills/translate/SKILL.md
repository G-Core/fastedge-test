---
name: translate
description: >-
  Translate supported text files to a target language while preserving
  structure, code blocks, inline code, URLs, paths, and technical terms.
  Use this skill for documentation translation requests: /translate
  <file> <lang> [replace], "translate README.md to Russian", "переведи
  docs/guide.md на немецкий", and any mention of translating
  documentation, README, changelog, or supported plain-text document
  content to another language — even if the user does not use the word
  "translate". Supported file classes are defined below.
last_modified: 2026-03-15T11:02:20Z
copyright: '© 2026 gcore.com'
---

# translate

## TL;DR

Reads a supported text file and translates prose content to the target language.
Preserves code blocks, inline code, URLs, paths, and technical terms in both plain-text
and markdown files; for markdown, also updates frontmatter.
By default writes the result next to the original with a language suffix (e.g., `file.en.md`).
With `replace` mode, overwrites the original file.

## Process

Follow the steps strictly in order, skipping none.

### 1. Determine input parameters

Extract parameters from the user's command:

- **File** — path to the supported text file to translate
- **Target language** — BCP 47 tag (`ru`, `de`, `en`) or language name
  ("Russian", "German", "немецкий")
- **Mode** (optional) — `replace` to overwrite the original file. If omitted, the
  translation is written next to the original with a language suffix.

If the invocation is structured (`/translate <file> <lang> [replace]`), the parameters
are explicit.
If free text ("translate README.md to Russian"), extract file and language from the text.

If the file is not specified — ask the user.
If the language is not specified — ask the user.

Normalize language names to BCP 47 tags: "Russian" → `ru`, "German" → `de`,
"немецкий" → `de`, "French" → `fr`, etc.

### 2. Read the source file

Read the file at the specified path.

If the file is not found — report: "File <path> not found" and stop.
If the file content is binary (non-text) — report: "File <path> is binary, not a text file" and stop.
Supported source files:

- Markdown: `.md`
- Flat plain text with extension: `.txt`
- Flat plain text without extension: `LICENSE`, `NOTICE`, `COPYING`, `AUTHORS`

Unsupported source files:

- Structured text: `.json`, `.yaml`, `.yml`, `.toml`, `.mdx`, `.rst`
- Config/build files: `Dockerfile`, `.gitignore`, `.env`, `Makefile`
- Source files and any text files with syntax that must not be rewritten as prose

If the file is outside the supported set — report:
"File <path> is a structured or unsupported text format; translation is supported only for
.md, .txt, LICENSE, NOTICE, COPYING, AUTHORS" and stop.
Do not create an output file.

### 3. Determine the source language

Detection order:

1. For `.md` files: if valid YAML frontmatter with a `lang` field exists — use it
2. For all supported files: if language was not determined from frontmatter — detect from content
3. If detection is impossible — ask the user

If the source language equals the target language — report:
"Source and target language are the same (<lang>)" and stop.

### 4. Translate the content

This is the key step. Translate prose content to the target language following the rules below.

For **supported flat plain-text** files from step 2:
- Translate prose only
- Preserve line breaks, paragraph boundaries, URLs, file paths, technical terms, code
  fragments, command snippets, flags, config keys, and indented example blocks
  byte-identical
- Commands such as `make install` and flags such as `--config=...` must remain unchanged
- No structure-aware parsing — treat the file as flat text
- Step 5 does not apply (frontmatter is markdown-only)

For **markdown** files (`.md`), apply the full set of rules below.

#### What to translate

- Headings (all levels)
- Paragraphs
- List items (bulleted and numbered)
- Table cell contents (text portion)
- Blockquotes
- Image alt text (`![alt-text](url)` — translate alt-text, leave URL unchanged)
- Link text (`[text](url)` — translate text, leave URL unchanged)

#### What NOT to translate

- **Fenced code blocks** (` ```...``` `) — content must be byte-identical to the original
- **Inline code** (`` `...` ``) — content must be byte-identical to the original
- **URLs and file paths** — do not modify
- **YAML frontmatter values** — do not translate (except `lang`, which is updated in step 5)
- **Technical terms** outside inline code — leave in the original language
  (see the "Technical terms" section for details)

#### Markdown structure

The translation structure must be identical to the original:

- Heading count and levels match
- List nesting matches
- Table structure matches (number of rows and columns)
- Code blocks in the same positions
- Blank lines between elements are preserved

#### Mixed content

- Line with prose + inline code: translate only the prose, leave inline code unchanged
- Table with description + code: translate the description, leave code unchanged
- File with mixed languages: translate all prose to the target language.
  Fragments already in the target language — leave as-is.

#### Ambiguous fragments

Idioms, cultural references, puns — translate on a best-effort basis.
Do not leave TODO markers, do not write comments about translation difficulty.
Simply translate as close to the original meaning as possible.

### 5. Handle frontmatter

Skip this step for non-markdown files.

If the original contains YAML frontmatter:

1. Copy all frontmatter to the translation
2. Update `lang` to the target BCP 47 tag (e.g., `ru`, `de`, `en`)
3. Set `last_modified` to the current UTC date and time in `YYYY-MM-DDTHH:mm:ssZ` format
4. Preserve `tags` in their source-language form; do not translate them
5. All other fields — byte-for-byte copy of the original
6. If the output markdown file would be in scope for
   `.claude/rules/frontmatter.md`, ensure the resulting frontmatter meets
   rules `FM-03` through `FM-09`

If the original **does not** contain frontmatter:

- If the output markdown file would be in scope for
  `.claude/rules/frontmatter.md`, create standard frontmatter by applying
  rules `FM-03` through `FM-09`
- Set `lang` to the target BCP 47 tag
- Set `last_modified` to the current UTC date and time in `YYYY-MM-DDTHH:mm:ssZ` format
- Get `tags` from the source file's headings and path in source-language form; do not
  translate them
- Preserve the translated body below the generated frontmatter
- Otherwise do not add frontmatter

If the frontmatter contains invalid YAML:

- Ignore it for source-language detection
- Translate the remaining content
- If the output markdown file would be in scope for
  `.claude/rules/frontmatter.md`, create standard frontmatter by applying
  rules `FM-03` through `FM-09`
- Set `lang` to the target BCP 47 tag
- Set `last_modified` to the current UTC date and time in `YYYY-MM-DDTHH:mm:ssZ` format
- Get `tags` from the source file's headings and path in source-language form; do not
  translate them
- Report the invalid frontmatter issue in the final output

### 6. Write the result

Two output modes:

**Sibling mode (default):** write the translation next to the original with a language
suffix inserted before the extension. For files without an extension, append the suffix.

Examples:
- `docs/philosophy.md` → `docs/philosophy.en.md`
- `README.md` → `README.ru.md`
- `guides/setup.md` → `guides/setup.de.md`
- `notes/plan.txt` → `notes/plan.ru.txt`
- `LICENSE` → `LICENSE.ru`

**Replace mode:** overwrite the original file. Activated when the user passes `replace`
as the third parameter.

**If the output file already exists:**
- When invoked by a human — ask: "File <path> already exists. Overwrite?"
- When invoked by an agent (another skill, automation) — overwrite without asking

### 7. Report the result

Output a single line:

```text
Translated <source-path> → <output-path> (<src-lang> → <target-lang>)
```

If there were issues (invalid YAML frontmatter), add a warning.

## Technical terms

Well-known technical terms should be left in the original language.
Examples: API, SDK, CLI, URL, JSON, YAML, Docker, Kubernetes, Git, GitHub, npm,
Claude Code, pull request, deploy, webhook.

This list is not complete — decide based on context and follow existing translations in the
project for consistency.

When in doubt, prefer leaving compound technical terms in the original language
(e.g., "Coverage matrix", "Orphan detection", "Severity assignment").

If a term is inside inline code (`` `backticks` ``), it is already not translated
per the rules in the "What NOT to translate" section.

## Boundaries

- Translate only the supported text files defined in step 2.
- Reject all other text formats and all binary files.
- One file per invocation. If asked to translate multiple — translate one,
  and inform the user that batch translation is not supported.
- Do not check or fix the quality of existing translations.
- Do not synchronize translations with original file updates.
- Do not add a glossary or translation memory.
- Do not translate `tags`.
