# Navigation history

Use the supplied compiled implementation as your base. Read this recipe and the package files, then fit them to the person's Herdr version, layout, keys, and stated preferences. Preserve unrelated configuration and disclose helper execution, network access, and reads outside the mod folder. Ask before replacing files or bindings or activating a different layout. Rebuild from the design only if the supplied files cannot work or the person requests a different implementation.

## Behavior and design

An optional non-focusable Herdr observer that remembers the last two visited spaces and the last two visited tabs independently in each space. Repeating a last-tab or last-space command toggles between the two observed targets.

The design requires exactly one observer block in the active personal layout. History tracks focus changes while mounted, including changes made through native shortcuts, the sidebar, or other pickers. Inactive spaces do not record unseen tab selections. Missing spaces/tabs are pruned from history.

Optional shortcuts: Ctrl-a Shift-L for the last space; Ctrl-a Ctrl-R or Ctrl-a Tab for the last tab. With no previous target, no navigation occurs and a notice is posted.

The mod persists only space/tab IDs under its own shared-state key, `muxcle-history.v1`. It does not create, close, or reorder anything; run programs; scan files; or access the network. Requires Herdr 0.1.13, but no other Muxcle package, Python, or Node.js.

## Add this package to Herdr

For a published package, use its versioned archive and matching checksum; no source rebuild or development tooling is required. A GitHub source folder is an instruction entrypoint, not necessarily a compiled runtime payload. If a suitable release is unavailable, stop and explain what is missing rather than silently inventing a download or compiling on the user's machine.

This optional package requires Herdr 0.1.13 and **one mounted observer block in a personal layout**. It does not require a particular layout or another Muxcle package, Python, Node.js, Git, or a repository checkout.

### Get and inspect the package

Download `muxcle-history-v<version>.tar.gz` and its `.sha256` from the [GitHub Releases page](https://github.com/cristianoliveira/herdr-muxcle/releases). Choose a published tag; if none exists, stop and ask whether a contributor should prepare a local build. For local archives, verify and extract from the directory containing both files:

```sh
shasum -a 256 -c muxcle-history-v0.1.0.tar.gz.sha256
tar -xzf muxcle-history-v0.1.0.tar.gz
```

Read the recipe and mod files before installing. The mod observes native focus state and writes only its own shared-state key. It does not run programs or make network requests.

### Install through Herdr

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

### Update or remove

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

### Limits

History records only focus changes observed while mounted. Switching to a layout without the observer pauses tracking. Commands use native IDs, including qualified remote IDs, and missing targets are pruned. History is not a complete visit log or a most-recent-first picker ordering. Native initial-render checks do not prove interactive command delivery or persistence across a desktop restart; verify these in the intended setup.
