# herdr-muxcle

You left tmux. Your fingers didn't.

Bring familiar tmux workflows to Herdr. Choose individual capabilities, or take the whole pack and manage it in your dotfiles. Reuse native Herdr commands where possible; keep control of your setup.

## Start here

- **Use Muxcle:** [Choose a package](INSTALLATION.md), then [preview and install it with the shared script](docs/INSTALLER.md).
- **Ship a release:** [Maintainer release process](docs/RELEASING.md).
- **Change the code:** [Development setup and checks](DEVELOPMENT.md).

Install from a published [GitHub Release](https://github.com/cristianoliveira/herdr-muxcle/releases), not by copying this repository over your Herdr home. If no release is listed, contributors can build local archives; a local build is not a published release. The `v0.1.0` assets predate the whole pack and installer—use a release that explicitly includes them, or the current checkout.

## Capabilities

| Package | What it adds |
| --- | --- |
| **`muxcle-pack`** | **All capabilities**, combined keys, and a ready personal layout for your dotfiles |
| `muxcle-tmux-keys` | Selected tmux-inspired tab, split, focus, and zoom shortcuts |
| `muxcle-rotation` | Rotate terminal panes without changing slot sizes |
| `muxcle-sizing` | Equalize nested splits or adjust width/height weights |
| `muxcle-history` | Toggle last tab per space and last space |
| `muxcle-picker` | Search existing spaces and tabs |
| `muxcle-sessionizer` | Find configured project folders and open or reuse local spaces |
| `herdr-muxcle` | Optional starter layout and static status row—not an all-in-one bundle |

Choose the **[whole pack](packages/pack/INSTALLATION.md)** if you want one versioned tree to vendor, customize, and replace yourself. You can deploy it through the shared installer or your own dotfile manager; activation remains your choice. Start with **Tmux keys** if you only want shortcuts. Individual capabilities do not require the scaffold or other packages. History, Rotation, and Sizing need a block mounted in a personal layout; copying their mod folders alone does not activate them. The [installation guide](INSTALLATION.md) explains each setup before you download.

New archives include the shared `install.py`, compiled runtime files, a recipe, installation instructions, and a SHA-256 checksum. The script previews changes by default and requires `--apply` to write. End users do not need Git, Node.js, npm, TypeScript, or a repository clone. Review keys and layout changes; never replace a complete personal key map or app home.

## Repository map

- `packages/`: capability recipes, installation instructions, shortcut snippets, and layout blocks.
- `mods/`: native runtime views, adapters, and behavior helpers.
- `src/`: Herdr-independent decisions and shared logic.
- `layouts/`: optional window composition.
- `scripts/`: development checks, archive construction, and release preparation.
- `docs/`: architecture, scaffold details, and maintainer release instructions.

Packages share one release version, but users select and install them independently. This is a native Herdr package project, not an npm package or mandatory replacement configuration.
