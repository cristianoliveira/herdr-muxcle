# Herdr Term

Built for your tmux muscle memory.

Familiar terminal and multiplexer workflows, native to Herdr. Choose individual capabilities or assemble the optional pack in your dotfiles. Reuse native Herdr commands where possible; keep control of your setup.

## Add it to Herdr

**Point your Herdr agent at the recipe you want.** Each recipe includes behavior, prerequisites, release-file setup, checks, updates, and removal. Use our working implementation as the base; adapt only where needed or requested. Rebuilding from scratch is a fallback, not a prerequisite.

For the complete setup, tell your agent:

> Add the Herdr Term whole pack using https://github.com/cristianoliveira/herdr-term/blob/main/packages/pack/RECIPE.md. Read the recipe and package files, use the compiled implementation from a suitable published release as the base, and fit it to my setup. Preserve unrelated configuration; explain helper execution and file access, and ask before replacing files, bindings, or switching layouts. If no matching release exists, stop and explain what is missing.

For one capability, substitute its recipe URL below. No custom installer or native `herdr-app install` command is required.

## Choose a recipe

| Recipe | What it adds | Setup beyond Herdr |
| --- | --- | --- |
| **[Whole pack](packages/pack/RECIPE.md)** (`muxcle-pack`) | Curated component payloads, combined keys and an optional assembly layout | Python 3, `hc`; feature-specific tools below; select activation and layout deliberately |
| [Tmux keys](packages/tmux-keys/RECIPE.md) (`muxcle-tmux-keys`) | Tab, split, focus, and zoom shortcuts | Review and merge selected bindings; no runtime mod |
| [Rotation](packages/rotation/RECIPE.md) (`muxcle-rotation`) | Rotate terminal panes without changing slot sizes; optional pair-swap opt-out | One mounted host; 3+ panes or explicit pair CAS need Python 3 and `hc` |
| [Sizing](packages/sizing/RECIPE.md) (`muxcle-sizing`) | Equalize nested splits, adjust width/height weights, or create a 4% height strip | One mounted host, Python 3 and `hc` |
| [Navigation repeat](packages/repeat/RECIPE.md) (`muxcle-repeat`) | Open a visible 1.5-second mode for repeated tab and pane navigation | Popup mod; optional shortcut |
| [Project popup](packages/project-popup/RECIPE.md) (`muxcle-project-popup`) | Run a focused local project's executable `.tmp/popup` after explicit confirmation; dismissing leaves its terminal running | POSIX `test`/`/bin/sh`; optional shortcut; no custom layout |
| [Keyboard copy mode](packages/copy-mode/RECIPE.md) (`muxcle-copy-mode`) | Copy/search a bounded snapshot of the actually displayed local or remote terminal in an isolated local viewer | Python 3, `hc`, Neovim/OSC 52; optional shortcut; no custom layout |
| [Broadcast prototype](packages/broadcast-prototype/RECIPE.md) (`muxcle-broadcast-prototype`) | Explicit bounded input relay to 2–8 captured local panes; not transparent tmux synchronization | Python 3, `hc`, local POSIX TTY; explicit reviewed scope/ON state; optional shortcut |
| [Port/process picker](packages/port-process-picker/RECIPE.md) (`muxcle-port-process-picker`) | Review local TCP listener processes before TERM; force KILL is a separate choice | Python 3, POSIX `lsof`/`ps` and signal permissions; no remote fallback |
| [Image Preview](packages/image-preview/RECIPE.md) (`muxcle-image-preview`) | Full-window preview of a copied or dropped image path; no terminal input | Python 3; optional local clipboard access and `hc`/remote Python for remote files |
| [Port Forward](packages/port-forward/RECIPE.md) (`muxcle-port-forward`) | Review remote listeners and explicitly manage owned loopback-only SSH tunnels | Python 3, `hc`, OpenSSH and verified non-interactive SSH; remote `lsof`/`ss` for optional discovery |
| [History](packages/history/RECIPE.md) (`muxcle-history`) | Last-tab/space toggles and optional bounded tab MRU | One mounted observer |
| [Agent attention inbox](packages/agent-intray/RECIPE.md) (`muxcle-agent-intray`) | Bounded inbox of observed agent completions and requests for input | Popup mod; optional mounted observer for capture while closed; optional shortcut |
| [Numbered sidebars](packages/numbered-sidebars/RECIPE.md) (`muxcle-numbered-sidebars`) | Optional status-colored Space/Agent rails; preserve native expanded controls | Add one or both optional layout blocks; no shortcuts or observer |
| [Workspace chrome](packages/workspace-chrome/RECIPE.md) (`muxcle-workspace-chrome`) | Optional pane footer, tabs-only/panels-only bars, native combined tabs composition, and local clock while preserving native status | Merge selected fragments into an existing layout; no keys or observer |
| [Funzzy status](packages/funzzy-status/RECIPE.md) (`muxcle-funzzy-status`) | Observe existing local and opt-in remote Funzzy watchers without controlling jobs | Installed `fzz` with control support; optional `hc` metadata/remote transport; no custom layout |
| [Picker](packages/picker/RECIPE.md) (`muxcle-picker`) | Search existing spaces/tabs; optional recency/context and a separate management opt-in for creation/reviewed close | Popup mod; History observer for recency; remote management needs both `management: true` and `remoteSpaces: true` plus `hc` identity checks |
| [Tab tools](packages/tab-tools/RECIPE.md) (`muxcle-tab-tools`) | Move tabs and name one from the focused terminal folder | One mounted host; optional shortcuts |
| [Sessionizer](packages/sessionizer/RECIPE.md) (`muxcle-sessionizer`) | Open or reuse machine-scoped spaces from configured local or remote project folders | Python 3; `hc` and remote Python 3 only for opt-in remote roots; no custom layout |
| [Space closer](packages/space-closer/RECIPE.md) (`muxcle-space-closer`) | Review exact local or remote space, machine, tab, and pane identities before explicitly closing selected spaces | Native dialog; `hc` identity check only for remote selections; no custom layout or default shortcut |
| [Scaffold](RECIPE.md) (`herdr-muxcle`) | Optional starter layout and static status row | Not an all-in-one bundle; select deliberately |

Legacy compatibility: the scaffold archive/package ID (`herdr-muxcle`) and feature/mod IDs (`muxcle-*`) remain unchanged; the repository and product are named Herdr Term.

The pack deliberately excludes Broadcast prototype, Port/process picker, Image Preview and Port Forward; install them separately after reviewing their safety limits. Pack inclusion does not activate optional observers, remote discovery or Picker management.

Runtime packages target Herdr 0.1.13. Agent attention, Funzzy feedback and optional presentation are independently selectable inspired tools, not compatibility prerequisites. Sessionizer is optional project discovery, not a prerequisite for tmux workflows.

Start with **Tmux keys** if you only want shortcuts. Individual capabilities do not require the scaffold or unrelated packages; optional feature dependencies are explicit. For History, copying a mod alone is not enough: its observer must remain shown in the active personal layout. Rotation, Sizing, and Tab tools each need one shown host. Navigation repeat, Picker, and Agent attention inbox open as native popups. Picker checks the active layout snapshot for a visible History block before using recency; this proves configuration, not observer health. The whole-pack layout composes the required blocks. Project popup is layout-free and runs only after an explicit **Run** action. Keyboard copy mode is also layout-free; it opens a separate snapshot viewer and never sends input to the source terminal. Agent attention inbox works without a custom layout; mount its optional observer only if it must capture transitions while the popup is closed.

## Ready-to-use files

Download a package's archive and matching SHA-256 file from a published [GitHub Release](https://github.com/cristianoliveira/herdr-term/releases), or ask your agent to do that. Each archive includes compiled runtime files and a root `RECIPE.md` containing the complete instructions. Repository package folders are instruction entrypoints, not compiled installation payloads.

End users do not need Git, Node.js, npm, TypeScript, or a repository clone. Manual copying and dotfile-manager deployment remain options. Keep runtime state outside the package and review key conflicts; never replace a complete personal key map or app home silently.

[Published `v0.2.0`](https://github.com/cristianoliveira/herdr-term/releases/tag/v0.2.0) includes the whole pack and independent packages. The older `v0.1.0` predates the pack. Use each published archive's matching checksum; a local build is not a published release.

## Delivery boundaries

The [source-adoption ledger](docs/DOTFILES_PARITY.md) maps reusable behaviors, native reuse, safety adaptations and exclusions. Native 3+ swap optimization and mixed-mod rotation/strip remain blocked; ordinary-terminal one-CAS rotation works. Contributor helper/asset reload verification is still incomplete. Neither initial-load checks nor mocked views prove live keyboard, scrolling, drag, remote or destructive behavior; interactive E2E remains paused.

## Development and releases

- [Development](DEVELOPMENT.md): source setup and checks.
- [Release process](docs/RELEASING.md): prepare, review a draft, and publish explicitly.
- [Architecture](docs/ARCHITECTURE.md): runtime and distribution boundaries.

`packages/` owns recipes/snippets/host blocks; `mods/` owns native runtime views and adapters; `src/` owns pure decisions; `layouts/` owns optional composition; `scripts/` owns build and distribution tools. Packages share one release version but remain independently selectable. This is not an npm package or mandatory replacement configuration.
