---
doc_type: policy
audience: bot
lang: en
tags: ['scripts', 'bash', 'python', 'automation']
last_modified: 2026-03-15T18:23:07Z
copyright: '© 2026 gcore.com'
paths:
  - 'scripts/**/*'
---

SCRIPT WRITING RULES
====================

## TL;DR

Use Bash for small, linear orchestration of existing CLI tools.
Use Python for anything that parses data, needs structure, or should be tested.
When in doubt, choose Python.
MUST/DO NOT = required, SHOULD/PREFER = recommended, MAY = optional.

DECISION MATRIX
---------------

Trait                     | Prefer Bash                                      | Prefer Python
------------------------- | ------------------------------------------------ | ----------------------------------------------------
Primary job               | Glue existing CLIs                               | Implement logic, transform data
Control flow              | Mostly linear, few branches                      | Complex branching, state, retries
Data handling             | No structured parsing; at most one trivial `jq`  | JSON/YAML/CSV/log parsing or generation
Error handling            | Fail fast, simple cleanup                        | Timeouts, backoff, partial failures
Portability               | Bash runtime is guaranteed                       | Cross-platform (especially Windows)
Interface                 | Small number of flags, single operation          | Many flags/subcommands, reusable CLI
Tests                     | Unit tests would add little value                | Unit tests are expected/required
Output contract           | Human-readable or simple line output             | Stable machine-readable output or richer UX

USE BASH WHEN
-------------

- The script is a thin wrapper around an existing CLI (kubectl, docker, terraform, git).
- The work is mostly: run command A, then B, then C, with simple conditionals.
- You can keep it small (roughly <60 lines) and still readable.
- The script does not make decisions based on structured data, beyond one
  trivial extraction from a CLI that already gives machine-readable output.
- Bash is guaranteed in the runtime environment.
- The script does not need to run on Windows.
- The Bash version requirements are explicit. If multiple environments are in
  scope, stay within the guaranteed feature set or choose Python.

USE PYTHON WHEN
---------------

- You want or need unit tests (non-trivial logic, safety checks, parsing).
- You are parsing or generating JSON/YAML/CSV/logs.
- You need robust error handling (retries with backoff, timeouts, cleanup, state).
- The script has many flags/subcommands or will be reused as a library later.
- The script must run on Windows or mixed environments.
- The script is consumed by other tools and benefits from a stable machine-readable output mode such as `--json`.

GENERAL GUIDELINE
-----------------

Choose Bash only when it stays clearly simpler after you account for quoting,
cleanup, error handling, and filename safety.
If correctness matters enough that you would write a unit test, write the script in Python.

BASH MINIMUM STANDARDS
----------------------

- Use `#!/usr/bin/env bash` and target Bash explicitly. Do not rely on POSIX `sh` behavior.
- Keep Bash version assumptions explicit. If the runtime does not guarantee a
  recent Bash, avoid newer features or choose Python.
- Use `set -Eeuo pipefail`. Do not assume `set -e` replaces explicit error handling in `if`, `&&`/`||`, or pipelines.
- Do not rely on aliases, interactive shell options, or user-specific dotfiles.
- Quote all variable expansions unless you explicitly want word-splitting or globbing.
- Use arrays for command arguments. Do not build shell commands as strings.
- Prefer local `IFS` for `read`/splitting sites, and use `read -r`.
- Prefer `[[ ... ]]` for Bash conditionals and `printf` when exact output matters.
- Prefer machine-readable upstream output over scraping human-oriented text
  (for example, `kubectl -o json`, not `kubectl get ... | awk ...`).
- Do not parse JSON or YAML with `grep`, `sed`, or `awk`.
- For JSON in Bash, only one trivial `jq -r` extraction is allowed (single
  field/path, no loops, `reduce`, or multi-step transforms). If the extraction
  is no longer obvious, switch to Python.
- For YAML, prefer Python. Only use a YAML CLI if the exact tool and version
  are already standard in the runtime environment.
- Avoid `eval`.
- Avoid plain whitespace-delimited `xargs` for arbitrary filenames. Prefer
  `find -exec ... +`, or NUL-delimited pipelines with `-print0` and `xargs -0`.
- Use `--` before user-supplied positional paths when the called CLI supports it.
- Validate required tools up front (for example: `command -v kubectl >/dev/null 2>&1`).
- Use `mktemp` for temp files or directories and clean them up with `trap`.
- Bash scripts SHOULD pass ShellCheck. Do not disable warnings unless you can justify them in a comment.

Good / bad examples:

```bash
# Good: use arrays and quoting
files=(src/main.py "docs/Release Notes.md")
grep -n -- "TODO" "${files[@]}"

# Bad: word-splitting and globbing bugs
files="src/main.py docs/Release Notes.md"
grep -n "TODO" $files
```

```bash
# Good: local IFS, read -r
while IFS= read -r line; do
  printf '%s\n' "$line"
done < input.txt

# Bad: backslashes are mangled, global splitting rules apply
while read line; do
  echo "$line"
done < input.txt
```

```bash
# Good: trivial JSON extraction is acceptable
image="$(docker image inspect app:latest | jq -r '.[0].Id')"

# Bad: scraping structured output
image="$(docker image inspect app:latest | grep Id | awk '{print $2}')"
```

```bash
# Good: safe filename handling
find scripts -type f -name '*.sh' -print0 | xargs -0 shellcheck --

# Better when possible: avoid xargs entirely
find scripts -type f -name '*.sh' -exec shellcheck -- {} +

# Bad: breaks on spaces/newlines in filenames
find scripts -type f -name '*.sh' | xargs shellcheck
```

ShellCheck examples:

```bash
shellcheck scripts/path/to/script.sh
shellcheck -s bash scripts/path/to/script-without-shebang
```

Recommended header for new scripts:

```bash
#!/usr/bin/env bash
set -Eeuo pipefail
```

PYTHON MINIMUM STANDARDS
------------------------

- Target Python 3 only. Do not write new scripts that require Python 2.
- If the script is executed directly on Unix-like systems, use `#!/usr/bin/env python3`.
- Put all logic behind a `main()` function and use an explicit process exit code.
- Use `argparse` for CLI flags and a helpful `--help` message. Use subparsers if the CLI has multiple operations.
- Use `pathlib.Path` for filesystem paths.
- Use `subprocess.run([...], check=True, text=True)` for calling CLIs.
- Capture output only when you need it and the output is expected to be modest; otherwise stream or redirect it.
- Pass `cwd=Path(...)` directly. Add `timeout=` when a subprocess may hang.
- Avoid `shell=True` unless you must, and never pass untrusted input into a shell command.
- Catch `subprocess.CalledProcessError` when you can show useful stderr and
  exit codes. Handle `FileNotFoundError` and `subprocess.TimeoutExpired` when
  that improves diagnostics.
- Add type hints for non-trivial functions and keep side effects at the edges.
- Prefer the standard library.
- If you add third-party dependencies, declare them in `pyproject.toml`
  (for example `[project.dependencies]`; use `[dependency-groups]` for dev-only
  dependencies) or in the repo's existing dependency mechanism. Do not install
  dependencies inside the script.
- Separate pure logic from side effects so tests can run without touching the network or filesystem.

Good / bad examples:

```python
# Good: no shell, explicit argv list
subprocess.run(["git", "status", "--porcelain=v1"], check=True, text=True)

# Bad: shell parsing is unnecessary
subprocess.run("git status --porcelain=v1", shell=True, check=True, text=True)
```

```python
# Good: Path objects and explicit timeout
repo = Path.cwd()
result = subprocess.run(
    ["git", "status", "--porcelain=v1"],
    cwd=repo,
    check=True,
    text=True,
    capture_output=True,
    timeout=30,
)

# Bad: string building, no timeout, no clear separation of args
repo = str(Path.cwd())
result = subprocess.run(
    f"git -C {repo} status --porcelain=v1",
    shell=True,
    check=True,
    text=True,
)
```

Dependency declaration example for new work:

```toml
[project]
dependencies = ["requests>=2.32"]

[dependency-groups]
test = ["pytest>=8"]
```

Recommended skeleton for new scripts:

```python
#!/usr/bin/env python3
import argparse
import logging
import subprocess
import sys
from collections.abc import Sequence
from pathlib import Path

log = logging.getLogger(__name__)


def run(
    cmd: Sequence[str],
    *,
    cwd: Path | None = None,
    timeout: float | None = None,
) -> str:
    result = subprocess.run(
        list(cmd),
        check=True,
        text=True,
        capture_output=True,
        cwd=cwd,
        timeout=timeout,
    )
    if result.stderr:
        log.debug("stderr: %s", result.stderr.rstrip())
    return result.stdout


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Show git status for a repository")
    parser.add_argument("--repo", type=Path, default=Path.cwd(), help="Repository path")
    parser.add_argument("-v", "--verbose", action="count", default=0)
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(levelname)s: %(message)s",
    )

    if args.repo and not args.repo.is_dir():
        print(f"directory not found: {args.repo}", file=sys.stderr)
        return 1

    try:
        output = run(["git", "status", "--porcelain=v1"], cwd=args.repo, timeout=30)
    except FileNotFoundError as e:
        print(f"missing executable: {e.filename}", file=sys.stderr)
        return 127
    except subprocess.TimeoutExpired:
        print("git status timed out after 30s", file=sys.stderr)
        return 124
    except subprocess.CalledProcessError as e:
        print(e.stderr or str(e), file=sys.stderr, end="")
        return e.returncode

    print(output, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

OUTPUT AND UX
-------------

- Be non-interactive by default.
- Accept inputs via flags, files, environment variables, or stdin. Do not require prompts in the normal path.
- Print the intended result to stdout.
- Send diagnostics, logs, progress, and warnings to stderr.
- Keep output stable. Do not add spinners, pagers, prompts, or noisy progress in CI.
- If another tool or agent consumes the result, provide a stable machine-readable mode such as `--json`.
- For mutating operations, support `--dry-run` when practical.
- For destructive operations, require an explicit action flag when practical
  (for example `--apply`, `--delete`, or `--yes`).
- Make repeated runs safe when practical: prefer idempotent behavior, or clearly document non-idempotent side effects.

Good / bad examples:

```text
# Good
stdout: /tmp/report.json
stderr: INFO: wrote report for 42 services

# Bad
stdout: INFO: starting...
stdout: wrote report for 42 services to /tmp/report.json
stdout: done!!!
```

```bash
# Good
./rotate-keys --dry-run
./rotate-keys --apply

# Bad
./rotate-keys
# immediately mutates production state with no preview or confirmation flag
```

CHECKLIST
---------

- The chosen language matches the job, runtime, and complexity.
- Bash scripts declare their interpreter and version assumptions, use strict
  mode, quote expansions, use arrays, handle filenames safely, and pass
  ShellCheck.
- Python scripts use `main()`, `argparse`, `pathlib`, safe `subprocess.run`, and declared dependencies.
- Mutating scripts are non-interactive, keep stdout/stderr separate, and
  support `--dry-run` or an explicit apply flag when practical.
- Non-trivial Python scripts have tests with side effects mocked or injected.
- Output is stable, readable, and pipe-friendly; provide a machine-readable mode when another tool consumes it.
