---
doc_type: policy
audience: bot
lang: en
tags: ['testing', 'unit-tests', 'quality', 'legacy-code']
last_modified: 2026-03-22T19:38:32Z
copyright: '© 2026 gcore.com'
source: 'The Art of Unit Testing, 3rd Edition — Roy Osherove & Vladimir Khorikov (Manning, 2024)'
---

UNIT TEST WRITING RULES
=======================

## TL;DR

Write unit tests for behavior whose dependencies are controlled.
Invoke one unit of work through a stable entry point and verify one concern.
Prefer stubs for incoming dependencies and mocks for outgoing side effects.
Use broader tests only for wiring or real contract confidence that lower levels
cannot provide.
MUST/DO NOT = required, SHOULD/PREFER = recommended, MAY = optional.

GLOSSARY
--------

- `Unit of work`: behavior started from one entry point and observed through one
  exit point; it may span multiple functions, modules, or collaborators.
- `Entry point`: a public or intentionally exposed callable used to activate the
  unit of work.
- `Exit point`: a returned value, an observable state change, or an outgoing side
  effect.
- `Concern`: one exit point being verified by a test.
- `Contract`: externally observable behavior the caller relies on.
- `Stable entry point`: an entry point the test can call without reaching through
  private helpers or temporary test-only exposure.
- `Seam`: a place where a dependency can be replaced without rewriting the test
  body.
- `Component test`: an in-memory test that runs multiple collaborators while
  unstable dependencies stay controlled.
- `Integration test`: a test that relies on one or more real dependency contracts
  or external systems.
- `Characterization test`: a broader safety test that captures current behavior
  before refactoring legacy code.

TEST CLASSIFICATION
-------------------

- MUST call a test unit-level when it invokes a stable entry point and all unstable
  dependencies are controlled by the test.
- MUST call a test component-level when multiple in-memory collaborators run
  together and unstable dependencies are still controlled.
- MUST call a test integration-level when it relies on a real database, network,
  filesystem, clock, process environment, or real dependency contract.
- MUST treat an in-process fake or emulator created and fully controlled by the
  test as controlled, not real.
- DO NOT call a test unit-level if it depends on shared process-global state,
  shared monkey-patching, or cross-test leftovers.
- PREFER the lowest test level that provides sufficient confidence.
- SHOULD add a higher-level test only for primary flow confidence, wiring
  confidence, or real dependency contract confidence.
- DO NOT duplicate the same scenario across multiple levels unless each copy covers
  a distinct risk.

QUALITY BAR
-----------

- MUST keep unit and component tests fast, deterministic, isolated, and fully
  automated.
- DO NOT rely on uncontrolled time, shared process state, or execution-order
  coupling.
- MAY skip unit tests for pure storage or serialization types that have no
  validation, parsing, normalization, equality rules, or invariants.

TEST SHAPE AND NAMING
---------------------

- MUST structure every test as Arrange / Act / Assert.
- MUST keep one scenario and one concern per test.
- MAY use multiple assertions only when they verify the same concern.
- MUST make the unit, scenario, and expected behavior visible in the test name or
  nearby file structure.
- SHOULD treat the test name as CI-facing diagnostic output.
- MUST keep Act and Assert visibly separate, except when the framework's standard
  exception or rejection assertion combines them.
- MAY use parameterized tests only when every row exercises the same entry point,
  the same concern, and the same assertion structure.

ASSERTIONS AND CONTRACTS
------------------------

- MUST assert only externally observable behavior the caller relies on.
- PREFER returned values and observable state over interaction checks when both
  express the same contract.
- MUST use interaction assertions when the contract itself is an outgoing side
  effect.
- DO NOT assert private calls, helper calls, or internal ordering unless that
  detail is part of the external contract.
- PREFER narrow assertions over broad snapshots.
- MAY assert exact strings, ordering, or full payloads only when that exact detail
  is the contract.
- DO NOT recompute production logic inside the test to derive the expected value.
- MUST encode pass/fail explicitly.
- DO NOT write assertion-free tests unless the framework's no-throw or no-reject
  assertion is itself the assertion.
- MUST prove fail-then-pass when repairing a buggy test.
- SHOULD prove fail-then-pass for complex tests or tests whose correctness is not
  obvious.

ERRORS AND REJECTIONS
---------------------

- MUST use the framework's throw or reject assertions instead of manual
  `try/catch` when the framework can express the expectation directly.
- PREFER asserting error type, code, or stable payload before full message text.
- MAY assert the exact message only when exact text is part of the contract.
- MUST keep "does not throw" or "does not reject" expectations explicit when that
  behavior matters.

DEPENDENCY CONTROL
------------------

- MUST control unstable dependencies explicitly.
- MUST inject time, randomness, I/O, external services, and environment-sensitive
  behavior through parameters, adapters, factories, or collaborators.
- PREFER seams and wrappers over global replacement.
- DO NOT patch internals when an explicit seam or adapter can be added instead.
- MAY mix real and fake dependencies only when the chosen boundary is explicit and
  matches the test level.
- DO NOT hide test-critical defaults inside builders, factories, or shared
  fixtures.

STUBS, MOCKS, AND SPIES
-----------------------

- MUST use stubs for incoming dependencies that supply data or behavior to the
  unit under test.
- MUST use mocks for outgoing side effects that the unit sends to the outside
  world.
- SHOULD keep mocks to one per test unless multiple outgoing effects form one
  inseparable protocol concern.
- MUST treat call-count and call-argument verification as mock assertions, not
  stub assertions.
- DO NOT mock internal helper calls just because the framework allows it.
- MAY use a spy when you need observation around a real implementation and a
  cleaner seam is not practical.
- DO NOT use a spy as a default substitute for a seam.

ASYNC, TIME, EVENTS, AND CONCURRENCY
------------------------------------

- DO NOT wait on real time in unit or component tests.
- MUST use fake timers or injected clocks instead of sleeps and wall-clock
  timeouts.
- SHOULD separate pure logic from async coordination where possible and unit-test
  the extracted logic directly.
- MAY unit-test async coordination directly when coordination itself is the
  behavior under test.
- MUST make silent callback non-execution fail instead of pass implicitly.
- MUST assert a meaningful externally observable outcome for events.
- MAY assert event emission itself only when emission is the contract.
- MAY test concurrency or scheduling directly when that is the behavior under
  test, but keep scheduling inputs controlled and assertions external.

RELIABILITY AND READABILITY
---------------------------

- MUST make every test runnable in isolation and in any order.
- MUST reset or remove shared state between tests.
- MUST fix, quarantine, transform, or delete flaky tests instead of normalizing
  them as noise.
- DO NOT use `if`, loops, dynamic branching, or manual `try/catch` in tests when
  simpler assertions express the same intent.
- DO NOT hide scenario-specific setup, mocks, or stubs in distant shared hooks.
- SHOULD keep only irrelevant default scaffolding in shared hooks, and only when
  the helper or hook name reveals the omitted detail.
- SHOULD inline scenario-specific setup unless three or more tests share the same
  nonessential scaffolding.
- SHOULD use explicit helpers or factories only when their names reveal all
  relevant assumptions.
- MUST use named values or clearly named placeholders instead of magic values.
- DO NOT test private or protected methods directly.
- SHOULD extract a new unit with an intentionally exposed contract when the
  underlying logic deserves direct tests.
- PREFER DRY only after readability and local clarity are preserved.

LEGACY CODE
-----------

- MUST add characterization or integration safety tests before risky refactors in
  legacy code that lacks safe seams.
- MUST run those safety tests after each small refactor step or behavior-changing
  edit.
- SHOULD choose the next unit-test target by logic complexity, dependency count,
  and practical importance to the current work.
- SHOULD add narrower unit tests after better seams exist.
- MAY retire a broader safety test only when its covered risk is clearly
  superseded by narrower tests and other retained coverage.

HOUSE RULES AND FALLBACKS
-------------------------

This section is intentionally stricter than the book on monkey-patching because
the goal here is literal bot behavior, not a catalog of all possible techniques.

- PREFER seams, adapters, and local wrappers over monkey-patching.
- MAY use scoped monkey-patching only as a legacy fallback when you cannot yet
  create a safer seam.
- MUST patch only within the test scope and MUST restore the original state in
  teardown.
- DO NOT rely on shared module-cache rewiring or shared global patching across
  tests.
- MUST classify tests that depend on shared global patching or module-cache
  rewiring as legacy safety or integration tests, not pure unit tests.
- DO NOT introduce manual module-mock systems that spread one test's meaning
  across multiple files unless the repository already standardizes them and local
  readability is still preserved.
