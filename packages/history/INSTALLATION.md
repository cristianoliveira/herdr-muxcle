# Install navigation history

Choosing a capability? Start with the [installation overview](https://github.com/cristianoliveira/herdr-muxcle/blob/main/INSTALLATION.md). This guide also ships inside this package's archive.

This optional package requires Herdr 0.1.13 and **one mounted observer block in a personal layout**. It does not require a particular layout or another Muxcle package, Python, Node.js, Git, or a repository checkout.

## Get and inspect the package

Download `muxcle-history-v<version>.tar.gz` and its `.sha256` from the [GitHub Releases page](https://github.com/cristianoliveira/herdr-muxcle/releases). Choose a published tag; if none exists, use the installation overview's local-build path. For local archives, verify and extract from the directory containing both files:

```sh
shasum -a 256 -c muxcle-history-v0.1.0.tar.gz.sha256
tar -xzf muxcle-history-v0.1.0.tar.gz
```

Read the recipe and mod files before installing. The mod observes native focus state and writes only its own shared-state key. It does not run programs or make network requests.

## Install through Herdr

Ask your Herdr agent to install this package, mount exactly one `observer.json` block in your chosen personal layout, and optionally merge its shortcut snippet. Ask before cloning or switching a shipped layout, replacing an existing shortcut, or changing an existing layout block. Do not replace the whole layout or key map.

Manual file deployment, with `BUNDLE` pointing at the extracted folder:

```sh
set -eu
BUNDLE="/path/to/muxcle-history-v0.1.0"
APP_HOME="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
sh "$BUNDLE/check-install-targets.sh" "$APP_HOME"
mkdir -p "$APP_HOME/mods"
cp -R "$BUNDLE/mods/muxcle-history" "$APP_HOME/mods/"
HERDR_APP_HOME="$APP_HOME" herdr-app check "$APP_HOME/mods/muxcle-history"
```

Then add the bundled `observer.json` node as a child of a row or column in the personal layout. Resolve any existing node ID collision; do not duplicate the observer. It occupies one pixel, is not focusable, and must remain shown for native command delivery. Herdr replaces shipped layouts on startup, so do not edit a shipped layout directly.

Merge only the desired entries from `keys.json` after reviewing exact and higher-priority terminal/layout bindings. Herdr reloads key changes live:

- `ctrl-a shift-l`: last space.
- `ctrl-a ctrl-r` or `ctrl-a tab`: last tab within the current space.

History begins when the observer is mounted. Visit two tabs or spaces before trying the corresponding toggle. Opening the mod as a temporary popup is not a substitute for mounting it.

## Update or remove

Back up the personal layout, keys, and installed mod before editing them. For an update, inspect the replacement package and run its preflight in update mode. Replace only the marked mod folder, then run the native check:

```sh
sh "$BUNDLE/check-install-targets.sh" --update "$APP_HOME"
BACKUP_DIR="$(mktemp -d)"
mv "$APP_HOME/mods/muxcle-history" "$BACKUP_DIR/muxcle-history"
cp -R "$BUNDLE/mods/muxcle-history" "$APP_HOME/mods/"
HERDR_APP_HOME="$APP_HOME" herdr-app check "$APP_HOME/mods/muxcle-history"
```

Restore the backup if copying or checking fails. Keep the existing observer and reviewed keys; do not mount another copy during an update.

To uninstall, remove only this observer block from the personal layout and package shortcuts that still match the bundled actions. Then run `sh "$BUNDLE/check-install-targets.sh" --remove "$APP_HOME"` and move only `$APP_HOME/mods/muxcle-history` to a backup. Keep unrelated layout blocks, keys, mods, and settings.

Persisted IDs under `muxcle-history.v1` remain after removal. Do not delete or replace `shared.json`; it contains other mods' state.

## Limits

History records only focus changes observed while mounted. Switching to a layout without the observer pauses tracking. Commands use native IDs, including qualified remote IDs, and missing targets are pruned. History is not a complete visit log or a most-recent-first picker ordering. Native initial-render checks do not prove interactive command delivery or persistence across a desktop restart; verify these in the intended setup.
