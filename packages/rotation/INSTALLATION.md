# Install two-pane rotation

Requires Herdr 0.1.13 and exactly one shown command-host block in a personal layout. No other Muxcle package, Node.js, Python, Git, or repository checkout is required.

## Get the package

Download `muxcle-rotation-v<version>.tar.gz` and its `.sha256` from the [GitHub Releases page](https://github.com/cristianoliveira/herdr-muxcle/releases). No release is published yet. For a local archive, verify and extract in the directory containing both files:

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

Focus an ordinary terminal in a two-pane split, then invoke the shortcut. The terminals exchange positions and focus stays at its original screen position, now on the incoming terminal. A single pane changes nothing.

Tabs with more than two panes, zoomed/replaced terminals, mod panes, missing focus, and inconsistent pane snapshots are refused without dispatching rotation commands. This package does not implement arbitrary-grid rotation or a core-document fallback. Native swaps determine sizing behavior; no equalization or resizing is performed.

Commands run synchronously without an asynchronous discovery step. They are not an atomic transaction: if a native command fails, some steps may already have applied. Check the layout before trying again; there is no automatic retry or rollback.

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
