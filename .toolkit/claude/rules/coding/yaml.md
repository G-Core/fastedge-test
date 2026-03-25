---
doc_type: policy
audience: bot
lang: en
tags: ['yaml', 'formatting', 'yamllint']
last_modified: 2026-03-15T18:35:13Z
copyright: '© 2026 gcore.com'
paths:
  - '**/*.yml'
  - '**/*.yaml'
---

YAML FORMATTING RULES
=====================

## TL;DR

Use 2-space indentation, spaces only (no tabs). Run `make lint` before committing.
Quote ambiguous scalars that must stay strings (`"false"`, `"on"`, `"0123"`).
Choose block scalar style and chomping deliberately (`|` / `|-` vs `>` / `>-`).
Do not use duplicate keys.
Do not reformat vendored/upstream YAML just to match style; keep diffs minimal.

INDENTATION AND WHITESPACE
--------------------------

2-space indentation
-------------------

- Use 2 spaces per indentation level in project-owned YAML.
- Do not use tabs for indentation.
- Do not use indentless sequences in project-owned YAML. They are valid YAML,
  but disallowed by this project style.
- If `.yamllint.yml` enables `document-start`, begin each YAML document with `---`.

CORRECT (project style):
```yaml
containers:
  - name: api
    ports:
      - name: http
        containerPort: 8080
```

DISALLOWED BY PROJECT STYLE (valid YAML, but not our indentation style):
```yaml
containers:
- name: api
  ports:
    - name: http
```

Upstream/vendored YAML
----------------------

- Do not reindent or rewrap upstream files (Helm charts, vendor dirs) just to match style.
- Only change formatting when making a functional change in the same hunk.
- If an upstream directory fails `yamllint`, add an ignore pattern in `.yamllint.yml`
  rather than mass-reformatting.

Trailing whitespace and final newline
-------------------------------------

- Remove trailing spaces and tabs.
- Ensure files end with a single LF newline.

Quick check before commit:
```bash
git diff --check
```

Recommended `.editorconfig`:
```ini
[*.{yml,yaml}]
indent_style = space
indent_size = 2
trim_trailing_whitespace = true
insert_final_newline = true
```

IMPLICIT TYPING
---------------

YAML plain scalars are resolved by schema. Different parsers may resolve the
same value differently, so ambiguous values cause portability problems.

- Quote values that must remain strings but look like booleans, nulls, or numbers.
- Treat `yes`, `no`, `on`, `off`, `true`, `false`, `null`, `~`,
  numeric-looking values, and leading-zero IDs as ambiguous unless the consumer
  explicitly wants typed values.
- Prefer `null` for null and `""` for empty string. Avoid bare empty values
  (`key:`) unless the consumer and lint config allow them.

CORRECT:
```yaml
env:
  FEATURE_FLAG: "false"
  RELEASE_CHANNEL: "on"
  BUILD_ID: "0123"
  OPTIONAL_NOTE: null
  EMPTY_NOTE: ""
search:
  QUERY: "status:open #123"
```

AMBIGUOUS (valid YAML, but discouraged — values may resolve unexpectedly):
```yaml
env:
  FEATURE_FLAG: false
  RELEASE_CHANNEL: on
  BUILD_ID: 0123
  OPTIONAL_NOTE:
search:
  QUERY: status:open #123
```

MULTI-LINE STRINGS
------------------

- Use literal style (`|`) when line breaks must be preserved.
- Use folded style (`>`) when line breaks should become spaces.
- Choose chomping deliberately:
  - `|` / `>` keep one final newline (default).
  - `|-` / `>-` strip the final newline.
  - `|+` / `>+` keep the final newline and trailing blank lines.
- Do not use folded style for scripts, config fragments, certificates, or other
  byte-sensitive content.

CORRECT (preserve line breaks):
```yaml
startupScript: |
  #!/bin/sh
  set -eu
  exec /app/server
```

CORRECT (fold into spaces):
```yaml
summary: >-
  Roll out the migration in one region first,
  verify error rates, then continue globally.
```

WRONG (folding changes the script):
```yaml
startupScript: >-
  #!/bin/sh
  set -eu
  exec /app/server
```

LONG LINES AND UNBREAKABLE STRINGS
-----------------------------------

- Do not wrap unbreakable scalars (digests, base64 blobs, URLs, tokens).
- If a line-length rule complains, use a targeted `yamllint` exception.
- For long human-readable text, use folded block scalars (`>` / `>-`).
- Do not split a digest or token across multiple lines unless the consumer
  explicitly expects embedded newlines.

CORRECT:
```yaml
imageDigest: sha256:3f1d2c0b9d7ea8c16b8d7a3d9f2e61f77a8f85b9d6d9b6e7c1c5a0c2d3e4f567  # yamllint disable-line rule:line-length
```

WRONG:
```yaml
token: >-
  eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9
  eyJzdWIiOiIxMjM0NTY3ODkwIn0
```

DUPLICATE KEYS
--------------

YAML mappings must not contain duplicate keys. Some parsers silently keep the
last value, which hides mistakes in reviews.

Treat duplicate keys as errors. Enable `yamllint`'s `key-duplicates` rule.

WRONG:
```yaml
resources:
  requests:
    cpu: "100m"
    cpu: "250m"
```

YAMLLINT
--------

`.yamllint.yml` is the source of truth. Do not guess rules from memory.

Run before committing YAML changes:
```bash
make lint
```

If `make lint` is unavailable:
```bash
yamllint -c .yamllint.yml .
```

Treat these `yamllint` rules as correctness issues, not style noise:
`key-duplicates`, `truthy`, `empty-values`, `octal-values`.

`line-length` is a practical lint rule — fix violations when straightforward,
but use targeted exceptions for unbreakable strings rather than forcing wraps.

Use the narrowest possible suppression:

- `# yamllint disable-line rule:line-length` for one line
- `# yamllint disable rule:<name>` / `# yamllint enable rule:<name>` for a small block
- `# yamllint disable-file` only for files that are not valid YAML before rendering

For templated files that are not valid YAML until rendered, lint the rendered
output when possible instead of suppressing the whole source template.

CHECKLIST
---------

- 2-space indentation (spaces only, no tabs for indentation)
- No indentless sequences in project-owned YAML
- No trailing whitespace; file ends with a single LF newline
- Ambiguous string values are quoted
- Null is written as `null` and empty string as `""` when the distinction matters
- Multi-line scalars use the correct style and chomping (`|` vs `>`, strip vs keep)
- No duplicate keys
- `yamllint` passes via `make lint`
