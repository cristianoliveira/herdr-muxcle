# Install the Tmux keys package

This optional package adds the explicit tmux-inspired key bindings documented in its recipe. It contains no runtime code, mod, or layout.

## Download

**The v0.1.0 release is not published yet.** Until a matching GitHub Release exists, these asset URLs return 404. When it is published, download the archive and checksum from the [GitHub Releases page](https://github.com/cristianoliveira/herdr-muxcle/releases). No Git, repository clone, Node.js, or npm is required.

```sh
set -eu
VERSION=v0.1.0
RELEASE_URL="https://github.com/cristianoliveira/herdr-muxcle/releases/download/$VERSION"
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT
ARCHIVE="muxcle-tmux-keys-${VERSION}.tar.gz"
curl -fL "$RELEASE_URL/$ARCHIVE" -o "$WORK_DIR/$ARCHIVE"
curl -fL "$RELEASE_URL/$ARCHIVE.sha256" -o "$WORK_DIR/$ARCHIVE.sha256"
(cd "$WORK_DIR" && shasum -a 256 -c "$ARCHIVE.sha256")
tar -xzf "$WORK_DIR/$ARCHIVE" -C "$WORK_DIR"
BUNDLE="$WORK_DIR/muxcle-tmux-keys-$VERSION"
```

Keep this shell open while inspecting and merging; `WORK_DIR` is removed when the shell exits. `keys.json` in the bundle is a snippet, not a replacement for your complete key map.

## Fresh install

Back up the current key map, then merge the package's `global` and `terminal` entries into the matching sections of your existing `keys.json` with a JSON editor. Preserve every other section and setting. If a chord already exists with a different action, stop and decide which action you want; do not silently replace it. Existing equal bindings can remain as-is.

If no key map exists yet, review the snippet and use it as the initial map. Otherwise, set `HERDR_APP_HOME` to the app home and back up the current file before editing:

```sh
APP_HOME="${HERDR_APP_HOME:?Set HERDR_APP_HOME to your Herdr app home}"
BACKUP_DIR="$(mktemp -d)"
cp -p "$APP_HOME/keys.json" "$BACKUP_DIR/keys.json"
```

Review the resulting JSON and confirm Herdr accepts it. This package does not write files or invoke Herdr commands for you.

## Update or reinstall

Download and verify the new archive as above. Compare its snippet with the bindings currently installed. Back up `keys.json`, then change only the package's entries after reviewing differences. Reinstalling the same version should leave already-equal mappings unchanged. If a mapping differs, treat it as a conflict to resolve, not an update to apply automatically.

## Uninstall

Back up `keys.json`. Remove only entries whose key and action still exactly match this package's `keys.json`; keep unrelated entries, sections, and later edits. If an entry has changed or is used by another feature, leave it and resolve that conflict yourself.

## Key behavior and limits

Herdr matches explicit key sequences; this is not a tmux prefix mode or repeat-table. `ctrl-a` starts the listed sequences, so a lone Ctrl-a may be delayed or consumed while Herdr waits for the next key. `ctrl-a ctrl-a` sends the U+0001 control character only when terminal context applies.

Herdr's precedence is `terminal` over `layout:<name>`, then `layout:<name>` over `global`. Review all three scopes before merging. Layout-specific behavior is active only while that layout is shown. No native key-event check or interactive key test was run for this package; command names and arguments were checked against Herdr's command catalog, but actual key delivery can depend on focus and higher-priority bindings.
