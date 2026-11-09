# Install pane rotation

For scripted deployment of this selected package, use the [shared installer](https://github.com/cristianoliveira/herdr-muxcle/blob/main/docs/INSTALLER.md). New archives include root `install.py`; it previews by default and writes only with `--apply`. Manual and agent-assisted steps remain available below.

Choosing a capability? Start with the [installation overview](https://github.com/cristianoliveira/herdr-muxcle/blob/main/INSTALLATION.md). This guide also ships inside this package's archive.

Requires Herdr 0.1.13 and exactly one shown command-host block in a personal layout. No other Muxcle package, Node.js, Git, or repository checkout is required. Three or more panes also require Python 3 and `hc` on Herdr's `PATH`, with core support for versioned `doc.get` / `doc.set`. Two-pane native rotation needs neither helper.

The `hc` CLI must reach the same core/session as Herdr. Keep `HC_SESSION` consistent for isolated or custom sessions; do not direct the helper at a different core.

## Get the package

Download `muxcle-rotation-v<version>.tar.gz` and its `.sha256` from the [GitHub Releases page](https://github.com/cristianoliveira/herdr-muxcle/releases). Choose a published tag; if none exists, use the installation overview's local-build path. For a local archive, verify and extract in the directory containing both files:

```sh
shasum -a 256 -c muxcle-rotation-v0.1.0.tar.gz.sha256
tar -xzf muxcle-rotation-v0.1.0.tar.gz
```

## Install through Herdr

Ask your Herdr agent to read the package recipe and files, install only this mod, mount one `host.json` block in the intended personal layout, and optionally merge the shortcut. Ask before cloning or switching a shipped layout, changing existing blocks, or replacing bindings. Do not replace the entire layout or key map.

Manual file deployment:

```sh
set -eu
BUNDLE="/path/to/muxcle-rotation-v0.1.0"
APP_HOME="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
sh "$BUNDLE/check-install-targets.sh" "$APP_HOME"
mkdir -p "$APP_HOME/mods"
cp -R "$BUNDLE/mods/muxcle-rotation" "$APP_HOME/mods/"
HERDR_APP_HOME="$APP_HOME" herdr-app check "$APP_HOME/mods/muxcle-rotation"
```

Add the `host.json` node as a child of a row or column in the personal layout. Resolve existing node-ID conflicts; do not mount duplicate copies. The one-pixel block is not focusable but must remain shown for command delivery. Do not edit a shipped layout: Herdr replaces those files on startup.

Optionally merge `ctrl-a ctrl-o` → `muxcle-rotation.rotate` from the package's `keys.json` into the global section. Review exact and higher-priority terminal/layout bindings first. Herdr reloads key changes live.

## Use and limits

Focus an ordinary terminal, then invoke the shortcut. Rotation advances pane contents one position: `[A, B, C]` becomes `[C, A, B]`. Focus returns to the incoming terminal at its original screen position if the original focus context is still current. A single pane changes nothing.

Supports up to 64 ordinary terminal panes, including nested row/column grids. Two panes use native swaps; larger tabs use one version-checked core document update. The document adapter preserves slot sizes and min/max/resizable constraints, container metadata, other tabs, and unrelated document fields. It verifies pane order and terminal identities before writing. Hidden or unsupported tree shapes, zoomed/replaced terminals, mod panes, missing focus, oversized documents, and inconsistent snapshots are refused. Trees are bounded to 32 nested levels and 512 nodes; the core document must fit its 1 MiB limit.

The native two-pane command sequence is not an atomic transaction; a failure may leave partial changes. Larger rotations write once using the exact version read from core: a conflict is not retried. Each core request has a five-second timeout; a lost write acknowledgement leaves the outcome uncertain. Inspect pane positions before repeating an uncertain command.

Repeated shortcuts are ignored while a document update is pending. Navigating away does not pull focus back; the originally selected tab may still rotate. Closing or unmounting the command host suppresses focus restoration but does not cancel the helper; the original tab may still rotate. No path retries a failed native sequence through the document adapter.

## Update or remove

Close any popup and back up local mod, layout, and key edits first. For an update, inspect the replacement package and run its preflight before replacing only the marked folder:

```sh
sh "$BUNDLE/check-install-targets.sh" --update "$APP_HOME"
BACKUP_DIR="$(mktemp -d)"
mv "$APP_HOME/mods/muxcle-rotation" "$BACKUP_DIR/muxcle-rotation"
cp -R "$BUNDLE/mods/muxcle-rotation" "$APP_HOME/mods/"
HERDR_APP_HOME="$APP_HOME" herdr-app check "$APP_HOME/mods/muxcle-rotation"
```

Restore the backup if copying or checking fails. Keep the existing host block; do not add another during an update.

To uninstall, first remove this host block and only shortcut entries still matching this package. Run `sh "$BUNDLE/check-install-targets.sh" --remove "$APP_HOME"`, then move only `$APP_HOME/mods/muxcle-rotation` to a backup. Keep unrelated mods, settings, layout nodes, bindings, and runtime state. This mod stores no persistent state.

Native initial-render checks do not execute pane swaps or verify focus restoration. Verify interactive behavior with harmless terminals in the intended Herdr setup.
