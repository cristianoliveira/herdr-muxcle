# herdr-muxcle

You left tmux. Your fingers didn't.

Herdr experience without fighting against your tmux muscle memory.

Bring your familiar tmux workflows, shortcuts, and behaviors into Herdr without starting from scratch.

## Goals

So this project is to make the Herdr app as close to a tmux experience as possible, with the traditional features as well as some customizations but nothing opinionated

Reuse native Herdr commands where possible.

## Packages

Install capabilities independently; none requires the whole Muxcle setup.

- **[Tmux keys](packages/tmux-keys/INSTALLATION.md)**: optional prefix, tab, split, pane-navigation, and zoom shortcuts using native Herdr commands. No custom layout or runtime mod required.
- **[Pane rotation](packages/rotation/INSTALLATION.md)**: rotate ordinary terminal panes in splits or nested grids. Requires a mounted command-host block; three or more panes also need Python 3 and `hc`.
- **[Pane equalization](packages/sizing/INSTALLATION.md)**: balance flexible sibling shares in nested terminal splits without moving panes or focus. Requires one command host, Python 3 and `hc`.
- **[Navigation history](packages/history/INSTALLATION.md)**: last-tab per space and last-space toggles. Requires one observer block mounted in a personal layout.
- **[Spaces and tabs picker](packages/picker/INSTALLATION.md)**: fuzzy search existing spaces and tabs without hiding quiet work. No Python or custom layout required.
- **[Sessionizer](packages/sessionizer/INSTALLATION.md)**: search configured project roots and open or reuse local spaces. Requires Python 3, but no custom layout or Tmux keys package.
- **[Muxcle layout scaffold](docs/INSTALLATION.md)**: optional starter layout with a static status mod, not a tmux compatibility implementation.

Each package is optional; installing one does not require the others.

## Installation

Download only the package you want from a versioned GitHub release and follow its installation guide above. No repository clone, Git, Node.js, or TypeScript is needed to install. Keep existing layouts and settings; review shortcut conflicts before merging selected bindings. Never replace your whole Herdr app home or key map.

Developers build packages locally with `make package`; versioned release automation is configured separately. This repository setup does not mean a release has already been published.

## Development

See [Development](DEVELOPMENT.md) for prerequisites, the local quality gate, hooks, and watcher.
