#!/usr/bin/env bash
set -euo pipefail

# Generate llms.txt from docs/ contents and package.json
#
# Produces an llms.txt file at the repo root that indexes all documentation
# files in docs/. This follows the llms.txt proposal (llmstxt.org) to help
# LLM agents discover and navigate package documentation.
#
# Usage:
#   ./fastedge-plugin-source/generate-llms-txt.sh   # standalone
#   ./fastedge-plugin-source/generate-docs.sh        # calls this automatically after a full run
#
# Requirements: jq, bash 4+
# No customization needed — package name and docs are discovered at runtime.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DOCS_DIR="$REPO_ROOT/docs"
OUTPUT="$REPO_ROOT/llms.txt"

# --- Validate prerequisites ---

if [ ! -f "$REPO_ROOT/package.json" ]; then
  echo "Error: package.json not found in $REPO_ROOT"
  exit 1
fi

if [ ! -d "$DOCS_DIR" ]; then
  echo "Error: docs/ directory not found"
  exit 1
fi

if [ ! -f "$DOCS_DIR/INDEX.md" ]; then
  echo "Error: docs/INDEX.md not found — required for llms.txt summary"
  exit 1
fi

if ! command -v jq &>/dev/null; then
  echo "Error: jq is required but not installed"
  exit 1
fi

# --- Extract metadata ---

PACKAGE_NAME=$(jq -r '.name' "$REPO_ROOT/package.json")

# Extract summary from INDEX.md line 3 (expected format: blockquote or plain text after H1 + blank line)
# Strips leading "> " if present
SUMMARY=$(sed -n '3p' "$DOCS_DIR/INDEX.md" | sed 's/^> //')

if [ -z "$SUMMARY" ]; then
  echo "Warning: could not extract summary from docs/INDEX.md line 3, using package name"
  SUMMARY="Documentation for $PACKAGE_NAME"
fi

# --- Build llms.txt ---

{
  echo "# $PACKAGE_NAME"
  echo ""
  echo "> $SUMMARY"
  echo ""
  echo "## Documentation"
  echo ""

  # Curated order: INDEX first (entry point), then quickstart, then rest alphabetically.
  # This keeps the most useful docs near the top rather than relying on glob order
  # (which puts lowercase filenames like quickstart.md last).
  PRIORITY_FILES=("INDEX.md" "quickstart.md")

  for pfile in "${PRIORITY_FILES[@]}"; do
    if [ -f "$DOCS_DIR/$pfile" ]; then
      heading=$(head -1 "$DOCS_DIR/$pfile" | sed 's/^#\+ //')
      [ -z "$heading" ] && heading="${pfile%.md}"
      echo "- [$heading](docs/$pfile)"
    fi
  done

  # Remaining docs alphabetically, skip priority files
  for doc in "$DOCS_DIR"/*.md; do
    filename=$(basename "$doc")
    skip=false
    for pfile in "${PRIORITY_FILES[@]}"; do
      [ "$filename" = "$pfile" ] && skip=true && break
    done
    [ "$skip" = true ] && continue

    heading=$(head -1 "$doc" | sed 's/^#\+ //')
    if [ -z "$heading" ]; then
      heading="${filename%.md}"
    fi

    echo "- [$heading](docs/$filename)"
  done
} > "$OUTPUT"

echo "  Done: llms.txt ($(wc -l < "$OUTPUT") lines)"
