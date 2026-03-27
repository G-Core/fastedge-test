PROJECT DOCUMENTATION
=====================

CLAUDE.md references this file via `see DOCS.md` in the PROJECT CONTEXT
section. The agent reads it on demand when it needs project-specific context.
Keep it short, practical, and biased toward facts that are hard to infer from code.

This file is not loaded automatically. It costs zero tokens until the agent
decides to read it.


QUICK LINKS
-----------

- If this file is opened as root `DOCS.md`: [docs/INDEX.md](docs/INDEX.md)
- If this file is opened from `.toolkit/examples/`: [../../docs/INDEX.md](../../docs/INDEX.md)
- Installed doctor docs from root `DOCS.md`: [.toolkit/workflows/docs/README.md](.toolkit/workflows/docs/README.md)
- Installed doctor docs from `.toolkit/examples/`: [../workflows/docs/README.md](../workflows/docs/README.md)


FILL THIS IN
------------

1. Project summary
   - what the project does
   - who the users are
   - what matters most operationally

2. Architecture overview
   - main services or modules
   - important runtime boundaries
   - important data flows

3. Key entrypoints
   - where the application starts
   - where API handlers live
   - where background jobs or schedulers live

4. Non-obvious conventions
   - naming rules
   - ownership boundaries
   - patterns that look strange but are intentional

5. Operations
   - important commands
   - local run/test/build commands
   - deployment or rollout caveats

6. References
   - point to deeper docs in `docs/`
   - point to toolkit examples/docs under `.toolkit/` when relevant


DO NOT PUT HERE
---------------

- Rules and behavioral constraints — those belong in `CLAUDE.md` or `AGENTS.md`
- Coding standards — those belong in toolkit rules such as `.toolkit/claude/rules/`
- Secrets, credentials, or private tokens
- Large copies of information that the agent can read directly from code
