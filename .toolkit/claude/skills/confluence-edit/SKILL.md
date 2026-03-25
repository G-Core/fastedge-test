---
name: confluence-edit
description: >-
  Edit Confluence pages — especially large ones where the MCP update tool hits
  size limits. Use this skill whenever the user asks to modify, update, or edit
  a Confluence page: add/remove/rename table columns, change cell values,
  update formatting, reorder sections, or any other structural change. Also use
  when the user shares a Confluence URL and asks to change something on that
  page, even if they don't say "Confluence" explicitly — wiki.gcore.lu URLs are
  Confluence.
allowed-tools: Read,Write,Edit,Bash,Grep,Glob,mcp__atlassian__confluence_get_page
---

EDIT CONFLUENCE PAGES
=====================

## TL;DR

Edit Confluence pages by fetching raw HTML via MCP, modifying it with Python,
and pushing the result through the Confluence REST API. This skill bypasses
the MCP update tool size limit (~50K characters) by calling the API directly.

You edit Confluence pages by fetching raw HTML (storage format), modifying it
with Python, and pushing the result via REST API.

The MCP `confluence_update_page` tool cannot handle pages larger than ~50K
characters. This skill bypasses that limit by calling the Confluence REST API
directly through a bundled push script.

## When to use

- User asks to change something on a Confluence page
- User shares a `wiki.gcore.lu` URL and describes an edit
- User says "add a column", "rename header", "update the table", etc.
  in the context of Confluence

## Workflow

### 1. Identify the page

Extract `page_id` from the user's input. Common patterns:

- Direct ID: `198590210`
- URL: `https://wiki.gcore.lu/spaces/EDN/pages/198590210/...` → `198590210`
- URL: `https://wiki.gcore.lu/pages/viewpage.action?pageId=198590210` → `198590210`

If the user gives a title + space key instead, use the MCP tool to look it up:
```text
mcp__atlassian__confluence_get_page(title=..., space_key=...)
```

### 2. Fetch the page in raw HTML

```text
mcp__atlassian__confluence_get_page(
    page_id="...",
    include_metadata=false,
    convert_to_markdown=false
)
```

This returns Confluence storage format (HTML). The result may be saved to a
temp file if it's too large for the tool response.

### 3. Extract the HTML content

The MCP tool returns JSON. Parse it to get the raw HTML:

```python
import json

with open(TOOL_RESULT_FILE) as f:
    data = json.loads(f.read())
result = json.loads(data["result"])
html = result["content"]["value"]
```

### 4. Modify the HTML

Write a Python script to make the requested changes. Common patterns:

**Table operations** (add/remove/rename columns, edit cells):
- Use `re` module to find `<tr>`, `<th>`, `<td>` tags
- Column index is 0-based; find the target column by matching header text
- When adding a column: insert `<th>` in header row, `<td>` in every data row
- When removing: delete the corresponding cell from every row

**Text/formatting changes**:
- Simple find-and-replace for text content
- Modify `style` attributes for formatting
- Add/remove HTML tags for structure

Always verify the modification before pushing:
- Count rows/cells before and after
- Print a few sample rows to confirm the change looks right
- Check that total HTML length is reasonable (not truncated, not doubled)

### 5. Save modified HTML to a temp file

```python
with open("/tmp/confluence_update.html", "w") as f:
    f.write(modified_html)
```

### 6. Push via the bundled script

The push script handles auth, version increment, and error reporting:

```bash
python skills/confluence-edit/scripts/confluence_push.py \
    PAGE_ID \
    /tmp/confluence_update.html \
    --comment "description of the change"
```

The script reads credentials from `~/.secrets.env` automatically.

### 7. Confirm to the user

Report the new version number and link to the page.

## Important notes

- Always fetch the page fresh before editing — never reuse stale HTML from
  a previous operation. The page may have been edited by someone else.
- The version number must increment by exactly 1. The push script handles
  this automatically.
- Confluence storage format is HTML, not markdown. Don't try to convert
  between formats — work with the HTML directly.
- For table operations, verify cell counts per row after modification.
  Mismatched cell counts will break the table rendering.
- Ask the user for confirmation before pushing if the change is large or
  ambiguous. Small, clearly-defined edits (like adding an empty column)
  can go straight through.

## Credentials

The push script reads from `~/.secrets.env`:

```text
CONFLUENCE_URL=https://wiki.gcore.lu
CONFLUENCE_PERSONAL_TOKEN=...
```

No additional setup needed.
