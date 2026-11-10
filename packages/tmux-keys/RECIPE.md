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
- `ctrl-a ?`: open native help; `ctrl-a :`: open the native command palette.
- `ctrl-a ctrl-a` in terminal context: send U+0001 to the terminal program.

The previous/next order is deliberate: `n` moves backward and `p` forward. These are explicit Herdr key sequences, not tmux's repeat-table or modal prefix state. Existing terminal or layout-specific bindings can take precedence over a global binding. The snippet defines only these bindings, not an entire personal key map. The setup section below covers conflict resolution and merging.

## Other native shortcuts

Herdr 0.1.13 defaults supply `Ctrl-Tab` / `Ctrl-Shift-Tab` for next/previous tabs and `F2` / `Shift-F2` for tab/space rename. Numbered spaces use `Alt-1` through `Alt-9` on Linux and `Ctrl-1` through `Ctrl-9` on macOS. Preserve the person's existing/default map; this snippet does not include those bindings.

The source dotfiles' Alt-number space bindings are not automatically imported on macOS: Option/Alt combinations can produce characters, while Ctrl-number bindings can conflict with OS desktop shortcuts. Verify the keyboard layout and terminal/layout/global precedence. If deliberately choosing the source's Alt-number option, merge only these reviewed entries into the existing global section, not the whole file:

```json
{
  "global": {
    "alt-1": "space.select:1",
    "alt-2": "space.select:2",
    "alt-3": "space.select:3",
    "alt-4": "space.select:4",
    "alt-5": "space.select:5",
    "alt-6": "space.select:6",
    "alt-7": "space.select:7",
    "alt-8": "space.select:8",
    "alt-9": "space.select:9"
  }
}
```

Choose different unused chords if these conflict; the native actions remain the same.

Native space creation, settings, sidebar, font and OS/window/terminal-editing shortcuts remain the person's choice. No personal Cmd bindings, editing sequences or reserved recovery/reset shortcuts are imported. Other Muxcle packages supply their own optional feature keys; those are not prerequisites for this key-only package.

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

If no key map exists yet, obtain the defaults for the person's supported Herdr version first, then merge the snippet; using it alone would omit other native shortcuts. Set `HERDR_APP_HOME` to the app home and back up the current file before editing:

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

Herdr matches explicit key sequences; this package is not a tmux prefix mode or repeat-table. The separate optional Navigation repeat package provides a visible, bounded navigation mode; it is not included here. `ctrl-a` starts the listed sequences, so a lone Ctrl-a may be delayed or consumed while Herdr waits for the next key. `ctrl-a ctrl-a` sends the U+0001 control character only when terminal context applies.

Herdr's precedence is `terminal` over `layout:<name>`, then `layout:<name>` over `global`. Focused `mod:<name>` bindings can also override global entries. Review all applicable scopes before merging. Layout-specific behavior is active only while that layout is shown. Command-catalog validation does not prove actual key handling; verify the shortcuts with the intended focus, layout, and higher-priority bindings.
