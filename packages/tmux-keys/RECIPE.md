# Recipe: Tmux keys for Herdr

Use the supplied compiled implementation as your base. Read this recipe and the package files, then fit them to the person's Herdr version, layout, keys, and stated preferences. Preserve unrelated configuration and disclose helper execution, network access, and reads outside the mod folder. Ask before replacing files or bindings or activating a different layout. Rebuild from the design only if the supplied files cannot work or the person requests a different implementation.

## Behavior and design

A set of explicit tmux-inspired shortcuts expressed through native Herdr commands in a `keys.json` snippet. This package contains only the key snippet and docs.

## Bindings

- `ctrl-a c`: create a tab.
- `ctrl-a n` / `ctrl-a p`: previous / next tab.
- `ctrl-a 1` through `ctrl-a 9`: select a tab by position.
- `ctrl-a w` / `_`: split down; `ctrl-a v` / `|`: split right.
- `ctrl-a ctrl-h/j/k/l`: focus left/down/up/right.
- `ctrl-a ctrl-f` / `z`: zoom the focused pane.
- `ctrl-a ,`: ask Herdr to rename the tab.
- `ctrl-a ctrl-a` in terminal context: send U+0001 to the terminal program.

The previous/next order is deliberate: `n` moves backward and `p` forward. These are explicit Herdr key sequences, not tmux's repeat-table or modal prefix state. Existing terminal or layout-specific bindings can take precedence over a global binding. The snippet defines only these bindings, not an entire personal key map. The setup section below covers conflict resolution and merging.

## Add this package to Herdr

For a published package, use its versioned archive and matching checksum; no source rebuild or development tooling is required. A GitHub source folder is an instruction entrypoint, not necessarily a compiled runtime payload. If a suitable release is unavailable, stop and explain what is missing rather than silently inventing a download or compiling on the user's machine.

This optional package adds the explicit tmux-inspired key bindings documented in its recipe. It contains no runtime code, mod, or layout.

### Download

Choose a published tag from the [GitHub Releases page](https://github.com/cristianoliveira/herdr-muxcle/releases) and download its archive and checksum. The example below uses `v0.1.0`; use it only if that release exists, or replace it with your selected tag. If no release is published, stop and ask whether a contributor should prepare a local build. No Git, repository clone, Node.js, or npm is required to install a release.

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

### Fresh install

Back up the current key map, then merge the package's `global` and `terminal` entries into the matching sections of your existing `keys.json` with a JSON editor. Preserve every other section and setting. If a chord already exists with a different action, stop and decide which action you want; do not silently replace it. Existing equal bindings can remain as-is.

If no key map exists yet, review the snippet and use it as the initial map. Otherwise, set `HERDR_APP_HOME` to the app home and back up the current file before editing:

```sh
APP_HOME="${HERDR_APP_HOME:?Set HERDR_APP_HOME to your Herdr app home}"
BACKUP_DIR="$(mktemp -d)"
cp -p "$APP_HOME/keys.json" "$BACKUP_DIR/keys.json"
```

Review the resulting JSON and confirm Herdr accepts it. This package does not write files or invoke Herdr commands for you.

### Update or reinstall

Download and verify the new archive as above. Compare its snippet with the bindings currently installed. Back up `keys.json`, then change only the package's entries after reviewing differences. Reinstalling the same version should leave already-equal mappings unchanged. If a mapping differs, treat it as a conflict to resolve, not an update to apply automatically.

### Uninstall

Back up `keys.json`. Remove only entries whose key and action still exactly match this package's `keys.json`; keep unrelated entries, sections, and later edits. If an entry has changed or is used by another feature, leave it and resolve that conflict yourself.

### Key behavior and limits

Herdr matches explicit key sequences; this is not a tmux prefix mode or repeat-table. `ctrl-a` starts the listed sequences, so a lone Ctrl-a may be delayed or consumed while Herdr waits for the next key. `ctrl-a ctrl-a` sends the U+0001 control character only when terminal context applies.

Herdr's precedence is `terminal` over `layout:<name>`, then `layout:<name>` over `global`. Review all three scopes before merging. Layout-specific behavior is active only while that layout is shown. Command-catalog validation does not prove actual key handling; verify the shortcuts with the intended focus, layout, and higher-priority bindings.
