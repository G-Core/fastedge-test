# AI Agent Instructions for fastedge-test

fastedge-test is a local debugger and test runner for FastEdge wasm apps: CDN (proxy-wasm) apps and HTTP apps. It ships as `@gcoredev/fastedge-test` (debugger server, test framework, runner API) and is embedded in the FastEdge VS Code extension.

## Governance (REQUIRED)

Read `AGENTS.md` for company-wide agent rules. They are mandatory and override any conflicting behaviour.

## 🚨 RULE ZERO: Production Parity

fastedge-test exists so developers and agents can build against a **local replica of the FastEdge
edge**. An app that works here must work on the edge, and an app that fails on the edge must fail
here **the same way**: same status codes, same errors, same values, same limits. A debugger that
is more lenient than production is a bug, even when it makes an app "work".

Before changing how a host function, property, header, store or response behaves:

1. **Establish what production does**, not what this repo's docs or tests assume. Use the
   production source if your environment gives you access to it (it is not public and is not
   referenced from this repo), `FastEdge-lib` for HTTP apps (`fastedge-run`, public), and the
   public FastEdge documentation.
2. **If that does not settle it, probe the live edge** (deploy a probe app) and record the
   result where the behaviour is implemented.
3. **When an app fails locally, first ask whether it fails on the edge too.** Check the app's build
   (stale binaries are common) before touching the debugger.
4. **Describe the production behaviour** in a comment where you implement it, and list any known
   divergence in `context/BEHAVIOUR.md`. Never hide one.

This repo is **public**: never link or path-reference anything a public user cannot open:
private repositories, their files, or folders that only exist on your machine. That covers code,
comments, docs, tests and commit messages. Describe the production behaviour instead ("on the
edge, a write in `onRequestHeaders` never fails"). Naming edge components (nginx, core-proxy)
is fine.

## Read the index first

`context/CONTEXT_INDEX.md` routes you to the one section you need. Read just-in-time; grep the docs before reading them whole.

| Doc | Read when |
|---|---|
| `context/ARCHITECTURE.md` | Changing structure, a subsystem, data flow, or finding where code lives |
| `context/BEHAVIOUR.md` | Changing what an app observes (properties, headers, origins, dotenv, stores), or checking a difference from the edge |
| `context/DEVELOPMENT.md` | Building, testing, adding a test app, cross-platform rules, coding conventions |
| `docs/` | The public API, config schema, test framework and runner (user docs, generated from source) |

History is `git log` (`--grep=<term>`, `-S<code>`, `-- <file>`); commits are conventional and release notes are generated from them.

## Keeping docs current

`context/` describes how the code works **now**, for contributors. After a change, update the doc that describes it, in the same commit:

- a mechanism or module → `ARCHITECTURE.md`
- app-visible behaviour, or a new or closed difference from the edge → `BEHAVIOUR.md`
- a command, test convention or rule → `DEVELOPMENT.md`
- a public API or config change → the matching `docs/` file

Write a conventional commit (`feat:` / `fix:` / `docs:` …) whose body says what changed and why: that is the history.

Keep `context/` to current state: history goes in commit messages, and plans, backlogs and known-bug lists are tracked outside this repo.
