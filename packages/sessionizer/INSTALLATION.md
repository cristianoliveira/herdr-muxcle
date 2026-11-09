# Install the Herdr Sessionizer

For scripted deployment of this selected package, use the [shared installer](https://github.com/cristianoliveira/herdr-muxcle/blob/main/docs/INSTALLER.md). New archives include root `install.py`; it previews by default and writes only with `--apply`. Manual and agent-assisted steps remain available below.

Choosing a capability? Start with the [installation overview](https://github.com/cristianoliveira/herdr-muxcle/blob/main/INSTALLATION.md). This guide also ships inside this package's archive.

Sessionizer is a standalone native Herdr mod. It works in an existing layout and does not install a layout, key bindings, Git, Node.js, npm, or a repository checkout. It requires Herdr 0.1.13 and `python3` on `PATH`.

## Download and install

Choose a published tag from the [GitHub Releases page](https://github.com/cristianoliveira/herdr-muxcle/releases), set `VERSION` to that tag, then download and verify its archive. If none is published, use the installation overview's local-build path. The example uses `v0.1.0`; change it to the tag you selected:

```sh
set -eu
VERSION=v0.1.0
RELEASE_URL="https://github.com/cristianoliveira/herdr-muxcle/releases/download/$VERSION"
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT
ARCHIVE="muxcle-sessionizer-${VERSION}.tar.gz"
curl -fL "$RELEASE_URL/$ARCHIVE" -o "$WORK_DIR/$ARCHIVE"
curl -fL "$RELEASE_URL/$ARCHIVE.sha256" -o "$WORK_DIR/$ARCHIVE.sha256"
(cd "$WORK_DIR" && shasum -a 256 -c "$ARCHIVE.sha256")
tar -xzf "$WORK_DIR/$ARCHIVE" -C "$WORK_DIR"
BUNDLE="$WORK_DIR/muxcle-sessionizer-$VERSION"
```

Keep this shell open for the install steps; `WORK_DIR` is removed when the shell exits.

```sh
set -eu
APP_HOME="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
sh "$BUNDLE/check-install-targets.sh" "$APP_HOME"
mkdir -p "$APP_HOME/mods"
cp -R "$BUNDLE/mods/muxcle-sessionizer" "$APP_HOME/mods/"
HERDR_APP_HOME="$APP_HOME" herdr-app check "$APP_HOME/mods/muxcle-sessionizer"
```

The install checker refuses an existing Sessionizer path and linked app-home, `mods`, or package folders. It checks only this package's mod path; it does not choose a layout or change Herdr settings.

## Configure roots

The bundled `config.example.json` contains an empty root list. Copy it only if a config does not already exist. Replace the empty list with absolute directories whose immediate child folders are projects:

```sh
set -eu
APP_HOME="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
CONFIG_DIR="$APP_HOME/data/muxcle-sessionizer"
CONFIG_PATH="$CONFIG_DIR/config.json"
if [ -L "$APP_HOME/data" ] || [ -L "$CONFIG_DIR" ] || [ -e "$CONFIG_PATH" ] || [ -L "$CONFIG_PATH" ]; then
  echo "Refusing to follow a linked config folder or overwrite existing config: $CONFIG_PATH" >&2
  exit 1
fi
mkdir -p "$CONFIG_DIR"
cp -p "$BUNDLE/config.example.json" "$CONFIG_PATH"
```

Edit `config.json` in a text editor. Example:

```json
{
  "roots": [
    "/absolute/path/to/projects",
    "/another/absolute/project-root"
  ]
}
```

The config accepts up to 12 absolute roots. Sessionizer scans only immediate, non-hidden child directories, follows directory symlinks, resolves canonical paths, and deduplicates aliases. Missing or unreadable roots appear as warnings. It shows at most 500 folders and 20,000 directory entries per opening; reduce or split roots if the list is truncated. Reopen the popup after editing the config.

## Open the popup

Open it from a shell while Herdr is running:

```sh
HERDR_APP_HOME="${HERDR_APP_HOME:-$HOME/.config/herdr-app}" herdr-app do mod.open:muxcle-sessionizer
```

Move with ↑/↓ or Ctrl-J/Ctrl-K. Press Enter or click a folder to reuse a matching local space or create one local space. Press Esc to close without selecting anything.

### Optional shortcut

`keys.json` contains one optional binding. Merge this entry into the `global` section of the existing `keys.json`; do not replace that file:

```json
"ctrl-a ctrl-p": "mod.open:muxcle-sessionizer"
```

Review any existing binding with the same chord before merging. Herdr reloads key changes live; check `herdr-app status` if the binding does not take effect.

## Update

Download and verify the replacement archive as above, then compare the installed mod with the package. A difference is expected when versions change; review it before continuing:

```sh
APP_HOME="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
sh "$BUNDLE/check-install-targets.sh" --update "$APP_HOME"
diff -ru "$APP_HOME/mods/muxcle-sessionizer" "$BUNDLE/mods/muxcle-sessionizer"
```

The update check requires the package ownership marker and refuses linked paths. Back up and move only the exact Sessionizer folder; the config and other Herdr files remain untouched:

```sh
BACKUP_DIR="$(mktemp -d)"
cp -R "$APP_HOME/mods/muxcle-sessionizer" "$BACKUP_DIR/"
mv "$APP_HOME/mods/muxcle-sessionizer" "$BACKUP_DIR/muxcle-sessionizer.previous"
cp -R "$BUNDLE/mods/muxcle-sessionizer" "$APP_HOME/mods/"
HERDR_APP_HOME="$APP_HOME" herdr-app check "$APP_HOME/mods/muxcle-sessionizer"
```

Keep the backup until the check passes. If copying the replacement fails, restore the previous folder from the backup. Do not replace `data/muxcle-sessionizer/config.json` during an update.

## Uninstall

Close the popup, confirm the app home, `mods`, and Sessionizer folders are not symlinks, then check the exact package marker. Move the installed folder to a backup first; remove that backup only after reviewing any local edits:

```sh
APP_HOME="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
sh "$BUNDLE/check-install-targets.sh" --remove "$APP_HOME"
BACKUP_DIR="$(mktemp -d)"
mv "$APP_HOME/mods/muxcle-sessionizer" "$BACKUP_DIR/muxcle-sessionizer"
```

This leaves `data/muxcle-sessionizer/config.json`, any optional key binding, Herdr settings, and runtime state untouched. If you merged the shortcut, remove only that exact binding when its value is still `mod.open:muxcle-sessionizer`.
