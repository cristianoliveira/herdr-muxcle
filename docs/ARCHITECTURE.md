# Architecture

Muxcle supplies independent native Herdr capabilities and an optional whole-pack composition. Runtime modules are not a package manager. End users receive compiled files; Node.js and TypeScript belong only to development.

## Runtime

- `mods/`: native views, adapters, controllers, and standalone Python behavior helpers.
- `src/lib/`: Herdr-independent decisions such as conflict-aware key-map planning.
- `layouts/`: optional composition using Herdr's shipped Spaces, Tabs, and pane views.
- `types/`: the supported native runtime boundary; declarations must match the tested Herdr version.
- `fixtures/`: controlled test inputs, never personal runtime state.

Keep native calls at adapters. Pure decisions do not import Herdr or deployment tooling. Required mounted hosts and observers remain explicit; installing a mod is not equivalent to activating it.

## Distribution

`packages/` owns recipes, shortcut snippets, configuration examples, host/observer blocks, and standalone recipes containing both behavior and setup instructions. `scripts/package.mjs` registers package sources and release metadata in one catalog. The optional `muxcle-pack` derives its files, combined keys, and layout from those component inputs; individual packages remain independently selectable.

`make package` compiles to ignored `.build/` and constructs allowlisted archives under ignored `dist/`. Manifests, SHA-256 files, and normalized archive metadata make package membership reviewable and builds reproducible. `package.json` supplies the shared version; this is not an npm runtime publication.

Release planning formats the catalog without needing a build or contacting GitHub. Tag automation checks packages before creating a draft; public publication is a separate maintainer action.

## Installation

Follow Herdr's standard agent-assisted flow: read the package recipe and files, disclose program execution and filesystem/network access, review destination and key conflicts, deploy only selected files, and run native initial-load checks. Layout changes and activation require deliberate agreement. Each package recipe points to compiled release archives and explains how to fit the supplied implementation to the user's setup; users do not need a repository checkout or compiler.

Recipes also cover manual deployment and user-managed dotfiles. A separate INSTALLATION.md is not required. No custom package installer or dependency manager is shipped. Destination preflight scripts are no-write checks for the documented manual path. Runtime mods never import distribution tooling.

## Verification

Node and Python behavior tests live beside their owners. The normal gate is headless. Packaging tests cover membership, reproducibility, generated composition, and refusal paths; key-map planning tests cover conflicts and preservation of unrelated configuration.

Initial native loading and optional GUI checks are separate from this gate. Neither a package build nor successful installation proves keyboard dispatch or complete interactive behavior. E2E work remains paused pending a suitable headless path.
