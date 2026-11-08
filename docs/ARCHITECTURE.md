# Architecture

This repository ships two independent Herdr packages. `herdr-muxcle` is an optional layout scaffold: `mods/muxcle-compat/main.ts` compiles to the Herdr entry point `main.js` and renders a static status message, while `layouts/muxcle.json` references that mod and Herdr's shipped `spaces`, `tabs`, and `pane` mods. `muxcle-tmux-keys` is a separate, static `keys.json` snippet with selected tmux-inspired bindings; it installs no mod or layout. `src/lib/keymap-merge.ts` plans conflict-aware key-map merges without writing files.

## Boundaries

- `src/domain/`: Herdr-independent behavior and rules.
- `src/lib/`: reusable pure helpers; keep business logic independent of Herdr and third-party APIs.
- `src/cli/`: command-line entry points and argument handling.
- `fixtures/`: small test or tool inputs, never personal runtime state.
- `layouts/`: the complete optional Muxcle window layout; it references, but does not copy, Herdr's shipped mods.
- `mods/muxcle-compat/`: TypeScript source for the layout package's static Herdr status block.
- `packages/tmux-keys/`: standalone key snippet and its package-specific recipe and manual install guide.
- `types/herdr-app-0.1.13.d.ts`: the narrow `View.render` declaration subset used by the example mod, sourced from installed Herdr 0.1.13; expand only from matching installed declarations when needed.
- `infra/`: future adapters to Herdr APIs or external services. Keep those dependencies at the edge.
- Tests live beside the code they exercise (`*.test.mjs`).

`make package` stages separate explicit allowlists under ignored `dist/`: the layout archive contains compiled app-home paths and its no-write install preflight; the key archive contains only its snippet and package docs. Both have a manifest and checksum, and normalized archive metadata makes repeated builds byte-identical when staged mtimes differ. The key-map helper reports conflicts and precedence shadowing; installation remains a user-reviewed manual merge, with no automatic key migration or runtime dependency. `package.json` is the canonical version source for both archives.

No architecture checker is warranted for these small package boundaries. Keep behavior in small modules and review dependency direction as more code arrives.
