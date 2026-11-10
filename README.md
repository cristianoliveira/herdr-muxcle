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
| **[Whole pack](packages/pack/RECIPE.md)** (`muxcle-pack`) | **All capabilities**, combined keys, and a ready personal layout | Python 3, `hc`, project roots; optional `.tmp/popup`; select the layout deliberately |
| [Tmux keys](packages/tmux-keys/RECIPE.md) (`muxcle-tmux-keys`) | Tab, split, focus, and zoom shortcuts | Review and merge selected bindings; no runtime mod |
| [Rotation](packages/rotation/RECIPE.md) (`muxcle-rotation`) | Rotate terminal panes without changing slot sizes | One mounted host; 3+ panes also need Python 3 and `hc` |
| [Sizing](packages/sizing/RECIPE.md) (`muxcle-sizing`) | Equalize nested splits, adjust width/height weights, or create a 4% height strip | One mounted host, Python 3 and `hc` |
| [Navigation repeat](packages/repeat/RECIPE.md) (`muxcle-repeat`) | Open a visible 1.5-second mode for repeated tab and pane navigation | Popup mod; optional shortcut |
| [Project popup](packages/project-popup/RECIPE.md) (`muxcle-project-popup`) | Run a focused local project's executable `.tmp/popup` after explicit confirmation; dismissing leaves its terminal running | POSIX `test`/`/bin/sh`; optional shortcut; no custom layout |
| [History](packages/history/RECIPE.md) (`muxcle-history`) | Last-tab/space toggles and optional bounded tab MRU | One mounted observer |
| [Agent attention inbox](packages/agent-intray/RECIPE.md) (`muxcle-agent-intray`) | Bounded inbox of observed agent completions and requests for input | Popup mod; optional mounted observer for capture while closed; optional shortcut |
| [Funzzy status](packages/funzzy-status/RECIPE.md) (`muxcle-funzzy-status`) | Observe existing local and opt-in remote Funzzy watchers without controlling jobs | Herdr 0.1.13; optional `hc get` metadata for local pane hints; no custom layout |
| [Picker](packages/picker/RECIPE.md) (`muxcle-picker`) | Search existing spaces and tabs by label, machine, and associated agent; optional recency order | Popup mod; History observer only for recency |
| [Tab tools](packages/tab-tools/RECIPE.md) (`muxcle-tab-tools`) | Move tabs and name one from the focused terminal folder | One mounted host; optional shortcuts |
| [Sessionizer](packages/sessionizer/RECIPE.md) (`muxcle-sessionizer`) | Open or reuse machine-scoped spaces from configured local or remote project folders | Python 3; `hc` and remote Python 3 only for opt-in remote roots; no custom layout |
| [Space closer](packages/space-closer/RECIPE.md) (`muxcle-space-closer`) | Review exact local or remote space, machine, tab, and pane identities before explicitly closing selected spaces | Native dialog; `hc` identity check only for remote selections; no custom layout or default shortcut |
| [Scaffold](RECIPE.md) (`herdr-muxcle`) | Optional starter layout and static status row | Not an all-in-one bundle; select deliberately |

Start with **Tmux keys** if you only want shortcuts. Individual capabilities do not require the scaffold or other packages. For History, copying a mod alone is not enough: its observer must remain shown in the active personal layout. Rotation, Sizing, and Tab tools each need one shown host. Navigation repeat, Picker, and Agent attention inbox open as native popups. Picker checks the active layout snapshot for a visible History block before using recency; this proves configuration, not observer health. The whole-pack layout composes the required blocks. Project popup is layout-free and runs only after an explicit **Run** action. Agent attention inbox works without a custom layout; mount its optional observer only if it must capture transitions while the popup is closed.

## Ready-to-use files

Download a package's archive and matching SHA-256 file from a published [GitHub Release](https://github.com/cristianoliveira/herdr-muxcle/releases), or ask your agent to do that. Each archive includes compiled runtime files and a root `RECIPE.md` containing the complete instructions. Repository package folders are instruction entrypoints, not compiled installation payloads.

End users do not need Git, Node.js, npm, TypeScript, or a repository clone. Manual copying and dotfile-manager deployment remain options. Keep runtime state outside the package and review key conflicts; never replace a complete personal key map or app home silently.

The published `v0.1.0` release predates the whole pack. Use a newer release that includes it, or ask a contributor for a local archive; do not assume an absent release URL works.

## Development and releases

- [Development](DEVELOPMENT.md): source setup and checks.
- [Release process](docs/RELEASING.md): prepare, review a draft, and publish explicitly.
- [Architecture](docs/ARCHITECTURE.md): runtime and distribution boundaries.

`packages/` owns recipes/snippets/host blocks; `mods/` owns native runtime views and adapters; `src/` owns pure decisions; `layouts/` owns optional composition; `scripts/` owns build and distribution tools. Packages share one release version but remain independently selectable. This is not an npm package or mandatory replacement configuration.
