# Image preview

Open a local or connected-machine PNG/JPEG in a full-window Herdr preview. The preview fits the full image without cropping or changing the source terminal. This standalone mod does not start an agent, send terminal input, or install a layout.

Requires Herdr 0.1.13 and Python 3 locally. Remote files also require connected Herdr machine access through `hc exec` and Python 3 on that machine.

## Install

Use a published package archive and its matching checksum. After extracting it, run the standalone preflight, copy the mod, and validate the installed package:

```sh
set -eu
APP_HOME="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
sh "$BUNDLE/check-install-targets.sh" "$APP_HOME"
mkdir -p "$APP_HOME/mods"
cp -R "$BUNDLE/mods/muxcle-image-preview" "$APP_HOME/mods/"
HERDR_APP_HOME="$APP_HOME" herdr-app check "$APP_HOME/mods/muxcle-image-preview"
```

The preflight refuses a linked app-home, `mods` folder, or existing mod path. It does not change Herdr settings.

## Update

After downloading and verifying a replacement archive, check ownership and compare the installed folder before replacing it:

```sh
APP_HOME="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
sh "$BUNDLE/check-install-targets.sh" --update "$APP_HOME"
diff -ru "$APP_HOME/mods/muxcle-image-preview" "$BUNDLE/mods/muxcle-image-preview"
BACKUP_DIR="$(mktemp -d)"
cp -R "$APP_HOME/mods/muxcle-image-preview" "$BACKUP_DIR/"
mv "$APP_HOME/mods/muxcle-image-preview" "$BACKUP_DIR/muxcle-image-preview.previous"
cp -R "$BUNDLE/mods/muxcle-image-preview" "$APP_HOME/mods/"
HERDR_APP_HOME="$APP_HOME" herdr-app check "$APP_HOME/mods/muxcle-image-preview"
```

Keep the backup until validation passes. If replacement fails, restore it. The app-home `image-previews` cache and optional key map are outside the mod folder and stay untouched.

## Uninstall

Close the popup, review any optional shortcut you merged, then verify ownership before moving only this mod to a backup:

```sh
APP_HOME="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
sh "$BUNDLE/check-install-targets.sh" --remove "$APP_HOME"
BACKUP_DIR="$(mktemp -d)"
mv "$APP_HOME/mods/muxcle-image-preview" "$BACKUP_DIR/muxcle-image-preview"
```

Keep the `image-previews` cache and unrelated app-home files. Remove only shortcut entries that still map to `mod.open:muxcle-image-preview`.

## Use

Copy an image's file path and open `mod.open:muxcle-image-preview`, or run:

```sh
HERDR_APP_HOME="${HERDR_APP_HOME:-$HOME/.config/herdr-app}" herdr-app do mod.open:muxcle-image-preview
```

The path defaults to the focused space's machine and working directory. Select another machine with the controls or Alt-M. Dropped files always open locally. Escape closes the popup; E restores the controls after loading.

PNG and JPEG are supported. Files are limited to 16 MiB and 25 megapixels. Clipboard text is read with `pbpaste`, `wl-paste`, or `xclip`; otherwise paste a path manually. URLs and SVG are rejected. Remote reads use literal `hc exec` arguments and require no remote mod installation.

Optionally merge the entries in `keys.json` into the existing `global` section of `keys.json`; review conflicts and do not replace the user's file.

Previews stay in the existing app-home `image-previews` directory. The helper retains the `herdr-image-preview-v1` ownership marker, keeps that cache private, and only prunes its own content-addressed image assets. Existing unrelated files are left alone.
