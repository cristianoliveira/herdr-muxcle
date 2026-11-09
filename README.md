# herdr-muxcle

You left tmux. Your fingers didn't.

Bring familiar tmux workflows to Herdr. Choose individual capabilities, or take the whole pack and manage it in your dotfiles. Reuse native Herdr commands where possible; keep control of your setup.

## Add it to Herdr

**Point your Herdr agent at the recipe you want.** Each recipe includes behavior, prerequisites, release-file setup, checks, updates, and removal. Use our working implementation as the base; adapt only where needed or requested. Rebuilding from scratch is a fallback, not a prerequisite.

For the complete setup, tell your agent:

> Add the Muxcle whole pack using https://github.com/cristianoliveira/herdr-muxcle/blob/main/packages/pack/RECIPE.md. Read the recipe and package files, use the compiled implementation from a suitable published release as the base, and fit it to my setup. Preserve unrelated configuration; explain helper execution and file access, and ask before replacing files, bindings, or switching layouts. If no matching release exists, stop and explain what is missing.

For one capability, substitute its recipe URL below. No custom installer or native `herdr-app install` command is required.

## Choose a recipe

| Recipe | What it adds | Setup beyond Herdr |
| --- | --- | --- |
| **[Whole pack](packages/pack/RECIPE.md)** (`muxcle-pack`) | **All capabilities**, combined keys, and a ready personal layout | Python 3, `hc`, project roots; select the layout deliberately |
| [Tmux keys](packages/tmux-keys/RECIPE.md) (`muxcle-tmux-keys`) | Tab, split, focus, and zoom shortcuts | Review and merge selected bindings; no runtime mod |
| [Rotation](packages/rotation/RECIPE.md) (`muxcle-rotation`) | Rotate terminal panes without changing slot sizes | One mounted host; 3+ panes also need Python 3 and `hc` |
| [Sizing](packages/sizing/RECIPE.md) (`muxcle-sizing`) | Equalize nested splits or adjust width/height weights | One mounted host, Python 3 and `hc` |
| [History](packages/history/RECIPE.md) (`muxcle-history`) | Last-tab per space and last-space toggles | One mounted observer |
| [Picker](packages/picker/RECIPE.md) (`muxcle-picker`) | Search existing spaces and tabs | Popup mod; no custom layout |
| [Sessionizer](packages/sessionizer/RECIPE.md) (`muxcle-sessionizer`) | Open or reuse local spaces from project folders | Python 3, configured project roots; no custom layout |
| [Scaffold](RECIPE.md) (`herdr-muxcle`) | Optional starter layout and static status row | Not an all-in-one bundle; select deliberately |

Start with **Tmux keys** if you only want shortcuts. Individual capabilities do not require the scaffold or other packages. For History, Rotation, and Sizing, copying a mod alone is not enough: its host/observer must remain shown in the active personal layout. The whole-pack layout already composes these blocks.

## Ready-to-use files

Download a package's archive and matching SHA-256 file from a published [GitHub Release](https://github.com/cristianoliveira/herdr-muxcle/releases), or ask your agent to do that. Each archive includes compiled runtime files and a root `RECIPE.md` containing the complete instructions. Repository package folders are instruction entrypoints, not compiled installation payloads.

End users do not need Git, Node.js, npm, TypeScript, or a repository clone. Manual copying and dotfile-manager deployment remain options. Keep runtime state outside the package and review key conflicts; never replace a complete personal key map or app home silently.

The published `v0.1.0` release predates the whole pack. Use a newer release that includes it, or ask a contributor for a local archive; do not assume an absent release URL works.

## Development and releases

- [Development](DEVELOPMENT.md): source setup and checks.
- [Release process](docs/RELEASING.md): prepare, review a draft, and publish explicitly.
- [Architecture](docs/ARCHITECTURE.md): runtime and distribution boundaries.

`packages/` owns recipes/snippets/host blocks; `mods/` owns native runtime views and adapters; `src/` owns pure decisions; `layouts/` owns optional composition; `scripts/` owns build and distribution tools. Packages share one release version but remain independently selectable. This is not an npm package or mandatory replacement configuration.
