# Install pane sizing

**Installation:** deploy, configure, update, or remove the released package. For the behavior and design brief used to recreate it, see [Recipe](RECIPE.md). Installing a release does not require rebuilding the recipe.

Choosing a capability? Start with the [installation overview](https://github.com/cristianoliveira/herdr-muxcle/blob/main/INSTALLATION.md). This guide also ships inside this package's archive.

Requires Herdr 0.1.13, Python 3 and `hc` on Herdr's `PATH`, with versioned `doc.get` / `doc.set` support. The CLI must reach the same core/session as the app: keep `HC_SESSION` consistent for isolated or custom sessions. No rotation package, other Muxcle capability, Node.js, Git, or repository checkout is required.

## Get the package

Download `muxcle-sizing-v<version>.tar.gz` and its `.sha256` from the [GitHub Releases page](https://github.com/cristianoliveira/herdr-muxcle/releases). Choose a published tag; if none exists, use the installation overview's local-build path. For a local archive, verify and extract in the directory containing both files:

```sh
shasum -a 256 -c muxcle-sizing-v0.1.0.tar.gz.sha256
tar -xzf muxcle-sizing-v0.1.0.tar.gz
```

## Install through Herdr

Ask your Herdr agent to read the recipe and package files, install only this mod, mount exactly one `host.json` block in the intended personal layout, and optionally merge the shortcut. Ask before cloning or switching a shipped layout, changing existing blocks, or replacing bindings. Never replace an entire layout or key map.

Manual file deployment:

```sh
set -eu
BUNDLE="/path/to/muxcle-sizing-v0.1.0"
APP_HOME="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
sh "$BUNDLE/check-install-targets.sh" "$APP_HOME"
mkdir -p "$APP_HOME/mods"
cp -R "$BUNDLE/mods/muxcle-sizing" "$APP_HOME/mods/"
HERDR_APP_HOME="$APP_HOME" herdr-app check "$APP_HOME/mods/muxcle-sizing"
```

Add the `host.json` node as a child of a row or column in a personal layout. Resolve node-ID conflicts; do not mount duplicate copies. The one-pixel block is not focusable but must remain shown for command delivery. Do not edit a shipped layout: Herdr replaces those files on startup.

Optionally merge `ctrl-a =` → `muxcle-sizing.equalize` from `keys.json` into the global section. Review exact and higher-priority terminal/layout bindings first. Herdr reloads key changes live.

## Commands

Focus an ordinary, unzoomed terminal pane and mount the command host. Choose one command below; wait for its result before invoking another:

```sh
herdr-app do muxcle-sizing.help
herdr-app do muxcle-sizing.equalize
herdr-app do muxcle-sizing.grow-width
herdr-app do muxcle-sizing.shrink-width
herdr-app do muxcle-sizing.grow-height
herdr-app do muxcle-sizing.shrink-height
```

`help` opens a readable native dialog without changing layout or reading core state. Use Close or Escape to dismiss it and return to the existing pane. The CLI confirms delivery, not asynchronous write completion; check Herdr's result before issuing another sizing command. `equalize` gives each nested row/column equal flexible sibling shares. This balances groups, not terminal pixel areas across an uneven tree.

Grow/shrink finds the nearest ancestor split on the requested axis: a row for width, a column for height. Only the weight of its child branch containing the focused pane changes. Grow multiplies that weight by `1.1`; Shrink divides it by `1.1`, subject to native numeric rounding. Other sibling weights stay unchanged. This is a reciprocal proportional step, not a 10-percentage-point allocation change or cell/pixel-based tmux resize.

In a nested grid, resizing may change the width or height of other panes in the same branch. For two equal siblings, one grow step changes weights from `[1, 1]` to `[1.1, 1]`, not allocations from 50/50 to 60/40. Pane IDs, order, terminal content, focus, container metadata, other tabs, and unrelated document fields are preserved. No new resize shortcuts are installed; review conflicts before binding these command names yourself.

## Limits

A single pane, a missing split axis, and a resize beyond native numeric/progress limits change nothing. Equalize also leaves already-equal groups intact, including their existing constraints. If balancing an unequal group would change fixed-pixel sizes, min/max constraints or a non-resizable node, the whole operation is refused rather than discarding constraints.

Grow/shrink requires the entire selected sibling group to be flexible and unconstrained. A constrained nearest split is refused; the command does not jump to a more distant ancestor. Ambiguous sizing in affected groups, hidden or unsupported trees, mod panes, zoomed/replaced terminals, and inconsistent snapshots are also refused. Trees are bounded to 64 panes, 32 nested levels and 512 nodes; the core document must fit its 1 MiB limit.

The helper validates the original tab's pane order and terminal identities, then makes at most one version-checked write. Conflicts are not retried. Repeated sizing commands are ignored while an update is pending. A timeout or lost acknowledgement can leave the write outcome uncertain: inspect pane shares before repeating.

Navigation away or closing/unmounting the host does not cancel an already-started helper; the originally selected tab may still change. No focus command is issued, so completion does not pull focus back.

## Update or remove

Back up local mod, layout and key edits first. Inspect a replacement package and run its preflight before replacing only the marked folder:

```sh
sh "$BUNDLE/check-install-targets.sh" --update "$APP_HOME"
BACKUP_DIR="$(mktemp -d)"
mv "$APP_HOME/mods/muxcle-sizing" "$BACKUP_DIR/muxcle-sizing"
cp -R "$BUNDLE/mods/muxcle-sizing" "$APP_HOME/mods/"
HERDR_APP_HOME="$APP_HOME" herdr-app check "$APP_HOME/mods/muxcle-sizing"
```

Restore the backup if copying or checking fails. Keep the existing host block; do not add another during an update.

To uninstall, remove this host block and only shortcut entries still matching this package. Run `sh "$BUNDLE/check-install-targets.sh" --remove "$APP_HOME"`, then move only `$APP_HOME/mods/muxcle-sizing` to a backup. Keep unrelated mods, settings, layout nodes, bindings, and runtime state. The mod stores no persistent feature state.

Native initial-render checks do not execute sizing commands. Verify interactive behavior with harmless terminals in the intended Herdr setup.
