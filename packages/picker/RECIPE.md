# Spaces and tabs picker

Use the supplied compiled implementation as your base. Read this recipe and the package files, then fit them to the person's Herdr version, layout, keys, and stated preferences. Preserve unrelated configuration and disclose helper execution, network access, and reads outside the mod folder. Ask before replacing files or bindings or activating a different layout. Rebuild from the design only if the supplied files cannot work or the person requests a different implementation.

## Behavior and design

An optional Herdr popup that searches existing spaces and tabs by their current labels, machine names, and associated agent names. Compact fuzzy queries match ordered characters across those terms, ignoring case and whitespace. The stable `local` alias searches this computer's work. Quiet spaces remain visible; empty spaces are selectable.

Use arrows or Ctrl-J/K to move, Enter or a click to select, and Escape to cancel. Native ordering is the default; an explicit per-user config can opt into most-recent-first ordering. The current tab is selected initially when visible. Both local and connected remote spaces use their existing native IDs.

The picker does not create or close tabs, spaces, or terminals. On open it reads only its optional config file under the Herdr app home. In recency mode it checks the current layout snapshot for a visible History block before reading the History MRU shared-state key; a missing/hidden block or missing/invalid data leaves results in native order. This is configuration evidence, not proof that the observer is healthy: a visible but non-running observer can leave valid persisted visits stale. The picker does not scan files, run programs, or access the network. It requires Herdr 0.1.13; default native-order use needs no Python, Node.js, custom layout, or other Muxcle package. New recency data requires the optional History observer. The optional shortcut is Ctrl-a Ctrl-b.

## Add this package to Herdr

For a published package, use its versioned archive and matching checksum; no source rebuild or development tooling is required. A GitHub source folder is an instruction entrypoint, not necessarily a compiled runtime payload. If a suitable release is unavailable, stop and explain what is missing rather than silently inventing a download or compiling on the user's machine.

This package requires Herdr 0.1.13. Native-order use needs no clone, Git, Node.js, Python, custom layout, or other Muxcle package. Recency ordering is optional and uses the independently installable History observer when installed and mounted.

### Get the package

Download `muxcle-picker-v<version>.tar.gz` and its `.sha256` from the [GitHub Releases page](https://github.com/cristianoliveira/herdr-muxcle/releases). Choose a published tag; if none exists, stop and ask whether a contributor should prepare a local build.

Verify the checksum before extraction. For a local package, run from the directory containing both files:

```sh
shasum -a 256 -c muxcle-picker-v0.1.0.tar.gz.sha256
tar -xzf muxcle-picker-v0.1.0.tar.gz
```

### Install through Herdr

Ask your Herdr agent to install only this package from the extracted folder. It should read the recipe and every file first, preserve existing files, and ask before replacing shortcuts. The package contains no program execution or filesystem discovery logic.

For a manual installation, set `BUNDLE` to the extracted folder and run:

```sh
set -eu
BUNDLE="/path/to/muxcle-picker-v0.1.0"
APP_HOME="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
sh "$BUNDLE/check-install-targets.sh" "$APP_HOME"
mkdir -p "$APP_HOME/mods"
cp -R "$BUNDLE/mods/muxcle-picker" "$APP_HOME/mods/"
HERDR_APP_HOME="$APP_HOME" herdr-app check "$APP_HOME/mods/muxcle-picker"
```

Open the popup while Herdr is running:

```sh
HERDR_APP_HOME="${HERDR_APP_HOME:-$HOME/.config/herdr-app}" herdr-app do mod.open:muxcle-picker
```

Optionally merge the bundled `keys.json` entry into the existing global section: `ctrl-a ctrl-b` opens `mod.open:muxcle-picker`. Never replace the entire key map. Review exact bindings and higher-priority terminal/layout sections first. Herdr reloads key changes live.

### Opt in to recent ordering

The picker stays in native order unless you explicitly add its config. The bundle's `config.example.json` selects recent order; copy it only if you want that behavior and do not overwrite an existing config:

```sh
CONFIG_DIR="$APP_HOME/data/muxcle-picker"
CONFIG_PATH="$CONFIG_DIR/config.json"
if test -e "$CONFIG_PATH"; then
  echo "Config already exists; inspect it before editing: $CONFIG_PATH" >&2
  exit 1
fi
mkdir -p "$CONFIG_DIR"
cp "$BUNDLE/config.example.json" "$CONFIG_PATH"
```

Recent order consumes only `muxcle-history.recent-tabs.v1` and only when the current layout snapshot contains a visible History block. Install and mount the separate History observer in the active personal layout to collect new visits. Picker remains usable in native order when that block or valid MRU data is absent. The layout check proves configured visibility only, not observer health; cached visits may be stale if the shown observer is not running. No History package is required for ordinary native-order use.

### Update or remove

Close the popup first. For an update, verify and extract the new package, inspect the differences, then run its preflight in update mode. Preserve local edits in a backup before replacing only the picker folder:

```sh
sh "$BUNDLE/check-install-targets.sh" --update "$APP_HOME"
BACKUP_DIR="$(mktemp -d)"
mv "$APP_HOME/mods/muxcle-picker" "$BACKUP_DIR/muxcle-picker"
cp -R "$BUNDLE/mods/muxcle-picker" "$APP_HOME/mods/"
HERDR_APP_HOME="$APP_HOME" herdr-app check "$APP_HOME/mods/muxcle-picker"
```

Restore the backup if replacement fails. To uninstall, run the preflight in removal mode and move only its marked folder to a backup:

```sh
sh "$BUNDLE/check-install-targets.sh" --remove "$APP_HOME"
BACKUP_DIR="$(mktemp -d)"
mv "$APP_HOME/mods/muxcle-picker" "$BACKUP_DIR/muxcle-picker"
```

Remove an optional shortcut only if its key and action still match this package. The optional `data/muxcle-picker/config.json`, settings, runtime state, other packages, and later key edits stay untouched. Remove only this config file if you deliberately want to disable recency.

### Behavior limits

Native order is the default. In explicit recent mode, visited tabs sort newest-first within their spaces; spaces with visited tabs sort by their newest tab. Unvisited tabs and spaces keep native order, including empty spaces. The MRU stores space/tab IDs only, is bounded to 256 visits, and is pruned against live targets by the mounted History observer. A missing/hidden/inactive History block or corrupt, old, or absent data falls back to native order. The layout snapshot is configuration evidence, not an observer-health signal; a visible block may leave cached visits stale if its code is not running. Search checks the machine name first (`local` for this computer), then space/tab labels, then associated agent `program.name` and reported `app` names, using exact native space and tab IDs for association. It does not search terminal titles. Missing agent metadata removes those search terms only; it does not change target identity or fall back to a similarly named local target. Project directories are not scanned. A target removed or moved after rendering invalidates the selection; it cannot fall through to a similarly named local target. Native initial-render checks do not prove deferred list rendering or keyboard delivery; verify these in the intended Herdr setup.
