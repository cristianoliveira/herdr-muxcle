# Architecture

This repository is currently a scaffold, not a shipped Herdr mod. `src/lib/example.ts` and its co-located test demonstrate a small, deterministic helper; they are not product functionality. The TypeScript build emits the native loader fixture from `fixtures/herdr-mod/main.ts` as `main.js` for the optional Herdr check.

## Boundaries

- `src/domain/`: Herdr-independent behavior and rules.
- `src/lib/`: reusable pure helpers; keep business logic independent of Herdr and third-party APIs.
- `src/cli/`: command-line entry points and argument handling.
- `fixtures/`: small test or tool inputs, never personal runtime state.
- `infra/`: future adapters to Herdr APIs or external services. Keep those dependencies at the edge.
- Tests live beside the code they exercise (`*.test.mjs`).

These are conventions for future code, not a reason to create empty directories or layers now. Add a boundary or abstraction when real code needs it. No runtime dependency or config format is established yet; when introduced, document one canonical format and precedence (defaults, file, environment).

No architecture checker is warranted for this empty scaffold. Keep behavior in small modules and review dependency direction as code arrives.
