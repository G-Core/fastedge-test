#!/usr/bin/env bash
# Build a Rust workspace and copy artifacts to the output directory.
# The WASM target is read from .cargo/config.toml in the workspace; defaults to wasm32-wasip1.
#
# Usage: build-rust-wasm.sh <workspace-dir> <output-dir> [options]
#
# Options:
#   --strip-prefix <prefix>  Strip prefix from crate names (e.g. "cdn-" turns "cdn-http-call" into "http-call")
#   --flat                   Output as <output-dir>/<name>.wasm instead of <output-dir>/<name>/<name>.wasm
#
# Crate names have underscores converted to hyphens in the output.

set -euo pipefail

if [ $# -lt 2 ]; then
  echo "Usage: $0 <workspace-dir> <output-dir> [--strip-prefix <prefix>] [--flat]" >&2
  exit 1
fi

WORKSPACE_DIR="$(cd "$1" && pwd)"
OUTPUT_DIR="$(mkdir -p "$2" && cd "$2" && pwd)"
STRIP_PREFIX=""
FLAT=false

shift 2
while [ $# -gt 0 ]; do
  case "$1" in
    --strip-prefix)
      STRIP_PREFIX="$2"
      shift 2
      ;;
    --flat)
      FLAT=true
      shift
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

# Resolve the WASM target from the workspace's .cargo/config.toml (if present).
CARGO_TARGET=$(grep -m1 '^target\s*=' "$WORKSPACE_DIR/.cargo/config.toml" 2>/dev/null \
  | sed 's/.*=\s*"\(.*\)"/\1/')
CARGO_TARGET="${CARGO_TARGET:-wasm32-wasip1}"

# Build
cd "$WORKSPACE_DIR"
cargo build --release

# Copy artifacts
RELEASE_DIR="target/$CARGO_TARGET/release"
for wasm_file in "$RELEASE_DIR"/*.wasm; do
  [ -f "$wasm_file" ] || continue

  # Get filename without extension, convert underscores to hyphens
  basename="$(basename "$wasm_file" .wasm)"
  name="${basename//_/-}"

  # Strip prefix if specified
  if [ -n "$STRIP_PREFIX" ]; then
    name="${name#"$STRIP_PREFIX"}"
  fi

  if [ "$FLAT" = true ]; then
    cp "$wasm_file" "$OUTPUT_DIR/$name.wasm"
  else
    mkdir -p "$OUTPUT_DIR/$name"
    cp "$wasm_file" "$OUTPUT_DIR/$name/$name.wasm"
  fi
done
