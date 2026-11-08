# herdr-muxcle

You left tmux. Your fingers didn't.

Herdr experience without fighting against your tmux muscle memory.

Bring your familiar tmux workflows, shortcuts, and behaviors into Herdr without starting from scratch.

## Goals

So this project is to make the Herdr app as close to a tmux experience as possible, with the traditional features as well as some customizations but nothing opinionated

Reuse native Herdr commands where possible.

## Status

This is an installable development scaffold, not tmux compatibility yet. The Muxcle layout is separate from your existing layout; the included mod only identifies the scaffold. No personal dotfiles are migrated.

## Installation

Download a precompiled native package from a versioned GitHub release and follow [Installation](docs/INSTALLATION.md). No repository clone, Git, Node.js, or TypeScript is needed to install. Keep existing layouts, settings, and key bindings; do not replace your whole Herdr app home.

Developers build packages locally with `make package`; versioned release automation is configured separately. This repository setup does not mean a release has already been published.

## Development

See [Development](DEVELOPMENT.md) for prerequisites, the local quality gate, hooks, and watcher. [Herdr development research](docs/HERDR-RESEARCH.md) records the native API evidence and safety boundaries.
