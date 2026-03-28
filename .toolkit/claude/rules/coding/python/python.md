---
doc_type: policy
audience: bot
lang: en
tags: ['python', 'testing', 'standards', 'best-practices']
last_modified: 2026-03-10T09:30:56Z
copyright: '© 2026 gcore.com'
paths:
  - '**/*.py'
---

PYTHON CODE AND TESTING RULES
=============================

## TL;DR

Package code properly and use editable installs for local development.
Use sys.path hacks only for special cases like hidden tool directories (example: .claude/).
Design code around dependency injection and zero side effects at import time.
Write deterministic pytest tests using Arrange/Act/Assert, and isolate external IO at the boundary.

Universal rules for Python code and tests in this repository.
These rules are intentionally practical: optimize for readability, testability, and script reliability.

PACKAGE STRUCTURE AND IMPORTS
-----------------------------

Preferred approach: src layout + editable install
-----------------------------------------------

Goal: imports work without PYTHONPATH hacks and tests run the same way as production code.

Recommended project layout:

```text
my-project/
├── pyproject.toml
├── src/
│   └── my_project/
│       ├── __init__.py
│       └── utils.py
└── tests/
    └── test_utils.py
```

Minimal pyproject.toml (setuptools) example:

```toml
[build-system]
requires = ["setuptools>=68", "wheel"]
build-backend = "setuptools.build_meta"

[project]
name = "my-project"
version = "0.1.0"
requires-python = ">=3.12"

[tool.setuptools.package-dir]
"" = "src"

[tool.setuptools.packages.find]
where = ["src"]

[tool.pytest.ini_options]
testpaths = ["tests"]
addopts = ["-ra"]
```

Version guidance:

- Choose the oldest still-supported Python you need.
- Avoid starting new projects on Python 3.10 (end-of-life is scheduled for 2026-10).


Install for local development:

```bash
python -m pip install -e .
```

After that, import by package name (NOT by folder name):

```python
from my_project.utils import parse_config
```

Avoid these anti-patterns:

- Adding project root to PYTHONPATH in CI or shell profiles.
- pytest config options that mutate sys.path (they hide packaging issues).
- Naming your top-level import package "src" or "lib" (those should be folders, not public packages).

Alternative: one-off script local imports
-----------------------------------------

Only for isolated scripts that are intentionally NOT part of the package and live next to their helpers.

```python
#!/usr/bin/env python3
"""One-off script (not packaged)."""

from pathlib import Path
import sys

_script_dir = Path(__file__).resolve().parent
if str(_script_dir) not in sys.path:
    sys.path.insert(0, str(_script_dir))

from local_module import run  # local_module.py in the same folder
```

If the script is part of the package, prefer this instead:

- Put it under src/my_project/scripts/
- Run it as a module: python -m my_project.scripts.my_script
- Use normal absolute imports (no sys.path modifications)

IMPORTING FROM HIDDEN DIRECTORIES
---------------------------------

This section documents the `.claude/skills/*/scripts` pattern and similar hidden tool directories.

Use case
--------

Scripts under `.claude/skills/*/scripts/` often need to import shared utilities from `.claude/scripts/`.

Important constraints:

- Package names cannot start with a dot, so you cannot import ".claude" as a package.
- The code in `.claude/` is tooling, not a distributable Python package.
- A small sys.path bootstrap is acceptable here because the directory is intentionally outside packaging.

Recommended project structure:

```text
project/
├── .claude/
│   ├── scripts/
│   │   ├── __init__.py          ← RECOMMENDED
│   │   ├── db_utils.py
│   │   └── other_utils.py
│   └── skills/
│       └── cp-db-list-applications/
│           └── scripts/
│               └── db_list_applications.py  ← imports scripts.db_utils
```

__init__.py guidance
....................

Python can import implicit namespace packages without __init__.py (PEP 420),
but relying on that implicitly often causes confusion.

Rule:

- Prefer adding __init__.py in directories you import from (example: `.claude/scripts/`).
- Only omit __init__.py when you intentionally design a namespace package and understand the trade-offs.

Create the file:

```bash
touch .claude/scripts/__init__.py
```

sys.path bootstrap pattern
..........................

Rule: configure sys.path BEFORE any local imports that depend on it.

```python
#!/usr/bin/env python3
"""Skill script that needs `.claude/scripts` imports."""

from pathlib import Path
import sys


def _add_claude_dir_to_syspath() -> Path:
    """Find the nearest project/.claude directory and add it to sys.path."""
    start = Path(__file__).resolve().parent
    for parent in [start] + list(start.parents):
        candidate = parent / ".claude"
        if candidate.is_dir():
            if str(candidate) not in sys.path:
                sys.path.insert(0, str(candidate))
            return candidate
    raise RuntimeError("Could not find '.claude' directory above this script")


_claude_dir = _add_claude_dir_to_syspath()

from scripts.db_utils import get_connection  # local import now works


def list_applications(db_connector=None):
    if db_connector is None:
        db_path = Path("~/.career-pipeline/app.db").expanduser()
        db_connector = lambda: get_connection(db_path)
    return db_connector()
```

Why this must be top-level:

- Tests often pass injected dependencies, so the "real import path" may never be executed.
- If sys.path is configured inside a function branch, you can ship a script that only works in tests.

Quick verification (multi-line command lives in a text block, not a bash block):

```text
python3 -c "
import sys
from pathlib import Path
sys.path.insert(0, str(Path.cwd() / '.claude'))
from scripts import db_utils
print('SUCCESS:', db_utils)
"
```

PATCHING AND MOCKING IMPORT PATHS
---------------------------------

Rule: patch where the code under test LOOKS UP the name, not where the name originally comes from.

Example:

```python
# my_project/utils/helpers.py
import subprocess

def run_git_status() -> str:
    result = subprocess.run(["git", "status", "--porcelain"], text=True, capture_output=True, check=True)
    return result.stdout
```

Test:

```python
from unittest.mock import patch, Mock

from my_project.utils.helpers import run_git_status

def test_run_git_status_calls_subprocess():
    # Arrange
    mock_result = Mock(stdout="M file.txt\n")
    with patch("my_project.utils.helpers.subprocess.run", return_value=mock_result) as mock_run:
        # Act
        out = run_git_status()

    # Assert
    assert out == "M file.txt\n"
    mock_run.assert_called_once()
```

Anti-pattern:

- Patching "subprocess.run" directly while the module under test imported it elsewhere.

PROJECT ROOT AND RELATIVE PATHS
-------------------------------

Rule: scripts must work regardless of the current working directory.

Preferred approach: build absolute paths from the project root (no chdir in library code).
Acceptable for CLI entrypoints: chdir once at startup if needed.

project_root.py:

```python
from pathlib import Path
import os

def find_project_root(markers: tuple[str, ...] = (".git", "pyproject.toml")) -> Path:
    """Find project root by marker file/dir. Does NOT change directory."""
    start = Path(__file__).resolve().parent
    for parent in (start,) + tuple(start.parents):
        if any((parent / m).exists() for m in markers):
            return parent
    raise FileNotFoundError(f"Project root not found (markers: {markers})")

def change_to_project_root(markers: tuple[str, ...] = (".git", "pyproject.toml")) -> Path:
    """Find project root AND change working directory to it. Use ONLY in CLI entrypoints."""
    root = find_project_root(markers)
    os.chdir(root)
    return root
```

Usage in a CLI script:

```python
#!/usr/bin/env python3
from my_project.project_root import find_project_root

PROJECT_ROOT = find_project_root()

def main() -> int:
    config_path = PROJECT_ROOT / "config" / "settings.json"
    ...
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
```

GENERAL PYTHON SCRIPT RULES
---------------------------

Dependency injection
--------------------

Rule: anything that talks to the outside world must be injectable.

External dependencies include:

- File IO (reading/writing)
- Network (HTTP)
- subprocess / external commands
- system clock / randomness
- environment variables
- databases

Use explicit None defaults (do NOT use `dep = dep or Default()`):

```python
def process_data(input_file: Path, parser=None, validator=None):
    if parser is None:
        parser = DefaultParser()
    if validator is None:
        validator = DefaultValidator()
    return parser.parse(input_file)
```

Side effects
------------

Rule: importing a module must not trigger IO.

Forbidden at import time:

- network calls
- reading/writing files
- printing
- loading dotenv
- changing working directory

Put side effects in main() or behind an explicit function call.

Output and exit codes
---------------------

Rule: stdout is for results, stderr is for diagnostics.

- On success: minimal output, preferably machine-readable.
- On failure: include enough context to debug (exception message, key parameters, stack trace if helpful).
- Exit code 0 on success, non-zero on failure.

CLI interface for skill scripts
------------------------------------------

CRITICAL: all scripts in `.claude/skills/*/scripts/` must be runnable from the command line.

Recommended pattern:

```python
#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path

def database_operation(param1: str, param2: int, db_connector=None):
    if db_connector is None:
        from scripts.db_utils import get_connection
        db_connector = lambda: get_connection(Path("~/.db").expanduser())
    ...
    return {"ok": True}

def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Database operation")
    parser.add_argument("--param1", required=True)
    parser.add_argument("--param2", type=int, required=True)
    args = parser.parse_args(argv)

    result = database_operation(args.param1, args.param2)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
```

CLI verification script (multi-line, use text block):

```text
for script in .claude/skills/*/scripts/*.py; do
  [[ "$script" =~ test_ ]] && continue
  [[ "$script" =~ __init__ ]] && continue
  grep -q "if __name__" "$script" || echo "NO CLI: $script"
done
```

Constants and configuration
---------------------------

Rule:

- Constants are ALL_CAPS at the top of the module or in constants.py.
- Keep configuration parsing separate from business logic.

TEST WRITING RULES
------------------

Use pytest
----------

All tests must run under pytest.

Test structure (AAA)
--------------------

Each test must have three sections with comments: Arrange, Act, Assert.

```python
from unittest.mock import Mock

def test_function_success():
    # Arrange
    dep = Mock()
    dep.method.return_value = "expected"

    # Act
    result = function_under_test(dep)

    # Assert
    assert result == "expected"
    dep.method.assert_called_once()
```

Test naming
-----------

Format: test_<unit>_when_<condition>_<expected>

Examples:

- test_process_file_when_file_exists_returns_data
- test_save_data_when_disk_full_raises_exception

Test organization
-----------------

Preferred: plain functions.

If you use classes, rules:

- One class per module or feature group.
- No shared mutable state.
- No __init__.

Avoid loops and conditionals in test bodies
-------------------------------------------

Goal: failures must point to a single case.

Rules:

- Prefer pytest.mark.parametrize instead of for-loops.
- Prefer separate tests instead of if/else branches.
- Small comprehensions in Arrange are OK if they improve clarity.

File system tests
-----------------

Rule:

- Do not touch the real filesystem outside the test sandbox.
- Prefer tmp_path for real file IO inside tests.
- Mock filesystem calls only when you need to simulate OS errors or edge cases.

Example:

```python
import json
from pathlib import Path

def test_save_json_writes_file(tmp_path: Path):
    # Arrange
    out = tmp_path / "config.json"

    # Act
    save_json(out, {"a": 1})

    # Assert
    assert json.loads(out.read_text(encoding="utf-8")) == {"a": 1}
```

Mocking external boundaries
---------------------------

Always isolate:

- network calls
- database connections
- subprocess calls
- system time and randomness

Exception testing
-----------------

Use pytest.raises.

```python
import pytest

def test_parse_raises_on_invalid_input():
    # Arrange
    bad = "not-json"

    # Act & Assert
    with pytest.raises(ValueError) as exc:
        parse_json(bad)

    assert "invalid" in str(exc.value).lower()
```

Fixtures
--------

Use fixtures for shared setup, but keep them small and explicit.
Prefer passing fixtures as parameters over global state.

Forbidden in unit tests
-----------------------

- Real network calls (use mocks or a local stub server in explicit integration tests)
- Sleeping (time.sleep) without mocking or a fake clock
- Writing outside tmp_path / temporary directories
- Relying on developer machine state (HOME, installed tools, real credentials)

Coverage expectations
---------------------

Each public function should have at least:

- success case
- error case
- edge case

ENVIRONMENT VARIABLES
---------------------

Rule: .env files must not override already-set variables
--------------------------------------------------------

If a variable is already defined in the shell, keep it.

```python
if env_getter(key) is None:
    env_setter(key, value)
```

Loading .env via python-dotenv
------------------------------

Use python-dotenv ONLY in CLI entrypoints (main()).

```bash
python -m pip install python-dotenv
```

```python
from dotenv import load_dotenv

load_dotenv(override=False)
```

Lazy values for config dictionaries
-----------------------------------

Use callables for values that depend on environment variables at runtime.

```python
from collections.abc import Callable
import os

ConfigValue = str | Callable[[], str | None]

PROVIDER_A: dict[str, ConfigValue] = {
    "base_url": "https://api.example.com",
    "auth_token": lambda: os.getenv("MASTER_KEY"),
}

def resolve_config(cfg: dict[str, ConfigValue]) -> dict[str, str]:
    resolved: dict[str, str] = {}
    for key, value in cfg.items():
        v = value() if callable(value) else value
        if v is not None:
            resolved[key] = v
    return resolved
```

Clearing related variables (switching configs)
----------------------------------------------

Prefer returning a new env dict instead of mutating os.environ in library code.

```python
import os

def build_env_for_provider(provider: dict[str, ConfigValue]) -> dict[str, str]:
    env = dict(os.environ)

    keys_to_clear = ["API_KEY", "API_TOKEN", "BASE_URL", "MODEL", "DEFAULT_MODEL"]
    for k in keys_to_clear:
        env.pop(k, None)

    for k, v in resolve_config(provider).items():
        env[k] = v

    return env
```

STANDARD DEPENDENCY INJECTION PATTERNS
--------------------------------------

ENV_LOADER
----------

Recommended for functions that read environment variables:

```python
from collections.abc import Callable, Mapping
import os

EnvLoader = Callable[[], Mapping[str, str]]

def my_function(api_key: str | None = None, env_loader: EnvLoader | None = None) -> None:
    if env_loader is None:
        env_loader = lambda: os.environ

    if api_key is None:
        api_key = env_loader().get("API_KEY")

    ...
```

Testing:

```python
def test_my_function_reads_env():
    # Arrange
    env_loader = lambda: {"API_KEY": "test"}

    # Act
    my_function(env_loader=env_loader)

    # Assert
    ...
```

HTTP_CLIENT
-----------

Recommended: inject a client object with a .get() method (works for requests and httpx).

```python
from collections.abc import Mapping
from typing import Any

def api_call(url: str, params: Mapping[str, str], http_client: Any = None) -> dict:
    if http_client is None:
        import requests
        http_client = requests

    resp = http_client.get(url, params=params, timeout=30)
    resp.raise_for_status()
    return resp.json()
```

FILE_WRITER
-----------

Text write:

```python
from collections.abc import Callable
from pathlib import Path

FileWriterText = Callable[[Path, str], None]

def save_json(output_file: Path, data: dict, file_writer: FileWriterText | None = None) -> None:
    import json

    if file_writer is None:
        def _default_writer(path: Path, content: str) -> None:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding="utf-8")
        file_writer = _default_writer

    file_writer(output_file, json.dumps(data, indent=2, ensure_ascii=False))
```

Binary write:

```python
from collections.abc import Callable
from pathlib import Path

FileWriterBinary = Callable[[Path, bytes], None]

def save_binary(output_file: Path, data: bytes, file_writer: FileWriterBinary | None = None) -> None:
    if file_writer is None:
        def _default_writer(path: Path, content: bytes) -> None:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(content)
        file_writer = _default_writer

    file_writer(output_file, data)
```

SUBPROCESS_RUNNER
-----------------

Inject a callable instead of calling subprocess.run directly.

```python
from collections.abc import Callable
import subprocess

SubprocessRunner = Callable[..., subprocess.CompletedProcess[str]]

def run_cmd(cmd: list[str], runner: SubprocessRunner | None = None) -> str:
    if runner is None:
        runner = subprocess.run

    result = runner(cmd, text=True, capture_output=True, check=True)
    return result.stdout
```

RUNNING TESTS
-------------

All tests:

```bash
python -m pytest -v
```

With coverage (replace my_project with your package name):

```bash
python -m pytest --cov=my_project --cov-report=term-missing
```

RECOMMENDED PROJECT STRUCTURE
-----------------------------

```text
my-project/
├── pyproject.toml
├── src/
│   └── my_project/
│       ├── __init__.py
│       ├── project_root.py
│       ├── env_loader.py
│       └── utils/
│           ├── __init__.py
│           └── helpers.py
├── tests/
│   ├── conftest.py
│   ├── test_utils.py
│   └── test_helpers.py
├── scripts/                    # optional, prefer python -m for packaged scripts
│   └── run_task.py
├── .env                        # not in git
├── .gitignore
└── README.md
```

NEW PROJECT CHECKLIST
---------------------

01. Create pyproject.toml (PEP 621) and choose a real package name (my_project)
02. Use src layout: src/my_project/...
03. Add __init__.py where you expect a real package (avoid accidental namespace packages)
04. Install editable: python -m pip install -e .
05. Configure pytest testpaths and addopts in pyproject.toml
06. Add .env, __pycache__/, *.egg-info/ to .gitignore
07. Add basic CI target: python -m pytest -v (and optional coverage)
08. For scripts: implement main(argv) -> int and raise SystemExit(main())
09. For external IO: add DI parameters at the boundary (env, files, http, subprocess)
