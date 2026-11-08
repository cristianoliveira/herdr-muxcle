# Architecture

This repository provides a small installable scaffold, not tmux behavior. `mods/muxcle-compat/main.ts` compiles to the Herdr entry point `main.js` and renders a static status message. `layouts/muxcle.json` references that mod and Herdr's shipped `spaces`, `tabs`, and `pane` mods. `src/lib/example.ts` and its test remain an isolated example of deterministic helper logic.

## Boundaries

- `src/domain/`: Herdr-independent behavior and rules.
- `src/lib/`: reusable pure helpers; keep business logic independent of Herdr and third-party APIs.
- `src/cli/`: command-line entry points and argument handling.
- `fixtures/`: small test or tool inputs, never personal runtime state.
- `layouts/`: the complete user-owned Muxcle window layout; it references, but does not copy, Herdr's shipped mods.
- `mods/muxcle-compat/`: TypeScript source for the package's static Herdr status block.
- `types/herdr-app-0.1.13.d.ts`: the narrow `View.render` declaration subset used by the example mod, sourced from installed Herdr 0.1.13; expand only from matching installed declarations when needed.
- `infra/`: future adapters to Herdr APIs or external services. Keep those dependencies at the edge.
- Tests live beside the code they exercise (`*.test.mjs`).

`make package` stages only the app-home paths, compiled JavaScript, recipe, and version manifest into a versioned archive under ignored `dist/`. Installation is manual and refuses existing paths; no installer, key migration, or runtime dependency is added. Add a boundary or abstraction when real code needs it. The package version in `package.json` is canonical.

No architecture checker is warranted for this empty scaffold. Keep behavior in small modules and review dependency direction as code arrives.
