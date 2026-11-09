# herdr-muxcle

You left tmux. Your fingers didn't.

Bring familiar tmux workflows to Herdr as optional, independently installable capabilities. Reuse native Herdr commands where possible; keep your existing setup.

## Start here

- **Use Muxcle:** [Choose a package and install it](INSTALLATION.md).
- **Ship a release:** [Maintainer release process](docs/RELEASING.md).
- **Change the code:** [Development setup and checks](DEVELOPMENT.md).

Install from a published [GitHub Release](https://github.com/cristianoliveira/herdr-muxcle/releases), not by copying this repository over your Herdr home. If no release is listed, contributors can build local archives; a local build is not a published release.

## Capabilities

| Package | What it adds |
| --- | --- |
| `muxcle-tmux-keys` | Selected tmux-inspired tab, split, focus, and zoom shortcuts |
| `muxcle-rotation` | Rotate terminal panes without changing slot sizes |
| `muxcle-sizing` | Equalize nested splits or adjust width/height weights |
| `muxcle-history` | Toggle last tab per space and last space |
| `muxcle-picker` | Search existing spaces and tabs |
| `muxcle-sessionizer` | Find configured project folders and open or reuse local spaces |
| `herdr-muxcle` | Optional starter layout and static status row—not an all-in-one bundle |

Start with **Tmux keys** if you only want shortcuts. No capability requires the scaffold or the other packages. History, Rotation, and Sizing need a block mounted in a personal layout; copying their mod folders alone does not activate them. The [installation guide](INSTALLATION.md) explains each setup before you download.

Released archives include compiled runtime files, a recipe, installation instructions, and a SHA-256 checksum. End users do not need Git, Node.js, npm, TypeScript, or a repository clone. Review keys and layout changes; never replace a complete personal key map or app home.

## Repository map

- `packages/`: capability recipes, installation instructions, shortcut snippets, and layout blocks.
- `mods/`: native runtime views, adapters, and behavior helpers.
- `src/`: Herdr-independent decisions and shared logic.
- `layouts/`: optional window composition.
- `scripts/`: development checks, archive construction, and release preparation.
- `docs/`: architecture, scaffold details, and maintainer release instructions.

Packages share one release version, but users select and install them independently. This is a native Herdr package project, not an npm package or mandatory replacement configuration.
