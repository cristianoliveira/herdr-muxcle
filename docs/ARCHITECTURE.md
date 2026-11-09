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

`packages/` owns recipes, shortcut snippets, configuration examples, host/observer blocks, and standalone installation instructions. `scripts/package.mjs` registers package sources and release metadata in one catalog. The optional `muxcle-pack` derives its files, combined keys, and layout from those component inputs; individual packages remain independently selectable.

`make package` compiles to ignored `.build/` and constructs allowlisted archives under ignored `dist/`. Manifests, SHA-256 files, and normalized archive metadata make package membership reviewable and builds reproducible. `package.json` supplies the shared version; this is not an npm runtime publication.

Release planning formats the catalog without needing a build or contacting GitHub. Tag automation checks packages before creating a draft; public publication is a separate maintainer action.

## Installation

The standalone Python installer is shared across all package archives. It accepts one selected Muxcle package and one explicit target, including a dotfiles staging directory. Source validation and a deterministic plan precede any target writes. Downloading does not execute package code.

Preview is the default. Applying files and merging keys requires `--apply`; conflict replacement is explicit and backed up. Planning preserves unrelated configuration. The installer does not invoke Herdr/core commands, configure project roots, mount blocks in arbitrary personal layouts, or activate a layout.

Destination preflight scripts remain no-write checks for manual deployment. They are not the shared installer. Runtime mods never import either tool.

## Verification

Node and Python behavior tests live beside their owners. The normal gate is headless. Packaging tests cover membership, reproducibility, generated composition, and refusal paths; installer tests cover source validation, conflict handling, and target isolation.

Initial native loading and optional GUI checks are separate from this gate. Neither a package build nor successful installation proves keyboard dispatch or complete interactive behavior. E2E work remains paused pending a suitable headless path.
