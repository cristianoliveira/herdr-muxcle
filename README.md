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
- **[Sessionizer](packages/sessionizer/INSTALLATION.md)**: search configured project roots and open or reuse local spaces. Requires Python 3, but no custom layout or Tmux keys package.
- **[Muxcle layout scaffold](docs/INSTALLATION.md)**: optional starter layout with a static status mod, not a tmux compatibility implementation.

Each package is optional; installing one does not require the others.

## Installation

Download only the package you want from a versioned GitHub release and follow its installation guide above. No repository clone, Git, Node.js, or TypeScript is needed to install. Keep existing layouts and settings; review shortcut conflicts before merging selected bindings. Never replace your whole Herdr app home or key map.

Developers build packages locally with `make package`; versioned release automation is configured separately. This repository setup does not mean a release has already been published.

## Development

See [Development](DEVELOPMENT.md) for prerequisites, the local quality gate, hooks, and watcher.
