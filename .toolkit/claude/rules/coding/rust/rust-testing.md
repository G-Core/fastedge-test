---
doc_type: policy
audience: bot
lang: en
tags: ['rust', 'testing', 'rules', 'commands', 'isolation']
last_modified: 2026-03-16T13:28:01Z
copyright: '© 2026 gcore.com'
paths:
  - '**/*.rs'
---

RUST TESTING RULES
==================

## TL;DR

Use standard `cargo` commands, not project-specific wrappers, unless the repo
explicitly requires one.
`cargo test` is the default verification command.
Tests MUST pass with Cargo's default parallel execution; needing
`--test-threads=1` is a bug to fix, not a workflow to set up.
Keep tests deterministic: unique temp dirs, no shared global state, no real
network, no real credentials.

CORE PRINCIPLES
---------------

- Prefer the smallest test that proves the behavior.
  Use unit tests by default; use integration tests when the behavior crosses
  crate, process, or service boundaries.
- Every new test SHOULD be reproducible with a single `cargo test ...` command.
- Tests MUST be isolated from each other and from the developer machine.
- Tests MUST be deterministic.
  Do not rely on execution order, wall-clock timing, or the machine's current state.
- Keep this rule repo-agnostic.
  Do not hardcode local feature names, Make targets, or CI tier systems into
  generic Rust testing guidance.

STANDARD COMMANDS
-----------------

Default test run:
```bash
cargo test
```

Run a single integration target:
```bash
cargo test --test cli
```

Run a single test by name:
```bash
cargo test parser_rejects_invalid_utf8
```

Show captured output while rerunning one test:
```bash
cargo test parser_rejects_invalid_utf8 -- --nocapture
```

Lint gate:
```bash
cargo clippy --all-targets -- -D warnings
```

Optional local cleanup:
```bash
cargo clippy --fix --all-targets
```

Formatting check if the repo uses `rustfmt` in CI:
```bash
cargo fmt --check
```

Command rules
.............

- Use `cargo test` and `cargo clippy` directly in generic instructions.
  Do not assume `make`, `just`, or custom wrappers exist.
- Use `cargo clippy` for lint verification.
  Do not rely on `cargo build` or `cargo fix` as a lint gate.
- `cargo clippy --fix` MAY be used for low-risk cleanup on your branch, but it
  is not a replacement for reviewing the diff and rerunning tests.
- If the crate has optional features, run the smallest relevant feature set
  locally and let the repo's documented workflow or CI cover the broader matrix.

PARALLEL SAFETY
---------------

- Tests MUST pass under Cargo's default parallel execution.
- Do not add `-- --test-threads=1` to normal commands, docs, or CI as a way to
  "stabilize" tests.
- If a test only passes serially, fix the shared resource or move the behavior
  into a separate process.
- Do not use fixed ports, fixed temp paths, shared log directories, or global
  mutable singletons across tests.
- Prefer binding local servers to port `0` and reading back the assigned port.
- If code under test mutates process-global environment, isolate that behavior
  in a child process or redesign the API to take explicit config.

Examples
........

```rust
// Good: unique temp directory per test
let temp = tempfile::tempdir().unwrap();
let output = temp.path().join("output.json");

// Bad: shared path across parallel tests
let output = std::path::PathBuf::from("/tmp/my-app-test/output.json");
```

```rust
// Good: ask the OS for a free local port
let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();

// Bad: fixed port collisions under parallel runs
let listener = std::net::TcpListener::bind("127.0.0.1:8080").unwrap();
```

TEST ISOLATION
--------------

- Use a unique temp directory per test case.
- Use fixtures under the repo or generated data, not files from the developer's
  real home directory.
- Mock outbound HTTP or use a local test server.
  Never hit real third-party services from routine tests.
- Never require real API keys, cloud accounts, or developer-specific machine
  state.
- Prefer dependency injection, trait-based seams, or child processes over
  mutating global state.
- When time matters, inject a clock or drive the code with explicit events.
  Avoid `sleep` as the main way to synchronize.

WHAT TO TEST
------------

- For bug fixes, add a regression test that fails before the fix and passes
  after it.
- Assert behavior visible from outside: returned values, public errors,
  emitted files, serialized output, or side effects in test-owned state.
- Do not tie assertions to unintended formatting or private implementation
  details unless that format is the contract.
- Prefer small, focused integration tests over one large end-to-end test that
  covers unrelated behavior.
- Name tests by behavior and expected outcome, not by implementation detail
  alone.

ADDING A NEW TEST
-----------------

- Start with the smallest scope that still proves the bug or feature.
- Make the setup self-contained inside the test or shared test helpers.
- Ensure the test can be rerun with a single `cargo test ...` command.
- Ensure it passes in parallel with the rest of the suite.
- Ensure it does not require real credentials, real home directories, or real
  network access.
- If the test depends on optional features, document that in the repo's normal
  test workflow, not in a hardcoded registry inside this rule.

DEBUGGING FAILURES
------------------

Enable backtraces:
```bash
RUST_BACKTRACE=1 cargo test
```

Rerun one integration target with captured output:
```bash
RUST_BACKTRACE=1 cargo test --test cli login_flow -- --nocapture
```

Guidance
........

- Use `-- --nocapture` when stdout/stderr is part of the failure signal.
- Prefer rerunning the smallest failing target or test name.
- If a failure disappears under serial execution, treat that as a sign of a
  race condition or leaked global state and fix the isolation bug.
- If the test depends on current working directory, env vars, or temp paths,
  make that setup explicit in the test instead of relying on the shell that
  launched Cargo.

WHAT TESTS MUST NOT TOUCH
-------------------------

- The developer's real home directory.
- Real credentials, tokens, or cloud accounts.
- Unmocked network calls to external providers.
- Shared fixed filesystem paths outside a test-owned temp directory.
- Global process state that is not restored or isolated.
