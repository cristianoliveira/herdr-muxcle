# Install the optional Muxcle scaffold

For scripted deployment, use the [shared installer](https://github.com/cristianoliveira/herdr-muxcle/blob/main/docs/INSTALLER.md), which also supports this individual package. New archives include root `install.py`; preview first, then use `--apply` explicitly.

**This is not the general installation guide or an all-in-one bundle.** To choose a capability, start with the [installation overview](https://github.com/cristianoliveira/herdr-muxcle/blob/main/INSTALLATION.md).

This package is a starter layout and one static status mod. It does not implement tmux shortcuts or migrate a personal Herdr configuration. It installs no key bindings.

## End-user download and install

Choose a published tag from the [GitHub Releases page](https://github.com/cristianoliveira/herdr-muxcle/releases). If none exists, contributors can build local archives using the development guide linked from the installation overview. The example below uses `v0.1.0`; replace it with the published tag you selected. This is a manual app-home install; it does not require Git, Node.js, npm, or a repository clone.

After a release exists, set `VERSION` to its tag and run this from a shell. The install checker refuses existing package paths and symlinked app-home containers rather than overwriting or following them.

```sh
set -eu
VERSION=v0.1.0
RELEASE_URL="https://github.com/cristianoliveira/herdr-muxcle/releases/download/$VERSION"
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT
ARCHIVE="herdr-muxcle-${VERSION}.tar.gz"
curl -fL "$RELEASE_URL/$ARCHIVE" -o "$WORK_DIR/$ARCHIVE"
curl -fL "$RELEASE_URL/$ARCHIVE.sha256" -o "$WORK_DIR/$ARCHIVE.sha256"
(cd "$WORK_DIR" && shasum -a 256 -c "$ARCHIVE.sha256")
tar -xzf "$WORK_DIR/$ARCHIVE" -C "$WORK_DIR"
BUNDLE="$WORK_DIR/herdr-muxcle-$VERSION"
```

Keep this shell open for the install steps; `WORK_DIR` is removed when the shell exits.

```sh
set -eu
APP_HOME="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
sh "$BUNDLE/check-install-targets.sh" "$APP_HOME"
mkdir -p "$APP_HOME/layouts" "$APP_HOME/mods"
cp "$BUNDLE/layouts/muxcle.json" "$APP_HOME/layouts/"
cp -R "$BUNDLE/mods/muxcle-compat" "$APP_HOME/mods/"
HERDR_APP_HOME="$APP_HOME" herdr-app check "$APP_HOME/mods/muxcle-compat"
```

Herdr's check renders the mod once; it does not test layout activation or interactive behavior. The layout is a complete window layout, not a patch. Select it only when ready, using Herdr's layout picker. To return to `main`, select it in the picker or run `herdr-app do layout.switch '{"name":"main"}'` while Herdr is running. That command changes the selected layout in the connected core; do not run app commands against a live core unless you intend those effects.

The package references Herdr 0.1.13's shipped `spaces`, `tabs`, and `pane` mods. Its manifest records that tested version; it does not promise compatibility with every Herdr release.

## Update or reinstall

You can use the shared installer's reviewed replacement mode, or follow the manual steps here. For a manual update, repeat the download and extraction block above, then set `APP_HOME` to your Herdr app home. Use update-mode preflight to reject symlinked containers while allowing the existing package-owned paths:

```sh
sh "$BUNDLE/check-install-targets.sh" --update "$APP_HOME"
diff -u "$APP_HOME/layouts/muxcle.json" "$BUNDLE/layouts/muxcle.json" || true
diff -ru "$APP_HOME/mods/muxcle-compat" "$BUNDLE/mods/muxcle-compat" || true
```

Review both diffs before replacing anything. `herdr-app check` may generate `gpui-kit.d.ts` and `jsconfig.json` inside an installed mod folder; these local helper files are not in the archive. After backing up the two package-owned paths and accepting the selected files, update only those paths:

```sh
BACKUP_DIR="$(mktemp -d)"
cp -p "$APP_HOME/layouts/muxcle.json" "$BACKUP_DIR/"
cp -R "$APP_HOME/mods/muxcle-compat" "$BACKUP_DIR/"
cp -p "$BUNDLE/layouts/muxcle.json" "$APP_HOME/layouts/muxcle.json"
mv "$APP_HOME/mods/muxcle-compat" "$BACKUP_DIR/muxcle-compat.old"
cp -R "$BUNDLE/mods/muxcle-compat" "$APP_HOME/mods/"
HERDR_APP_HOME="$APP_HOME" herdr-app check "$APP_HOME/mods/muxcle-compat"
```

Keep the backup until the check passes. Reinstalling the same version follows the same review; there is no silent overwrite path.

## Uninstall

If this layout is selected, switch back to another layout first. Confirm the app home, `layouts`, and `mods` containers are not symlinks. Compare the two package-owned paths to your backup or release; preserve any edits before removal. Then remove only these paths:

```sh
APP_HOME="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
test ! -L "$APP_HOME" && test ! -L "$APP_HOME/layouts" && test ! -L "$APP_HOME/mods" || { echo 'Refusing linked app-home path.' >&2; exit 1; }
rm "$APP_HOME/layouts/muxcle.json"
rm -R "$APP_HOME/mods/muxcle-compat"
```

Do not remove `keys.json`, settings, `.state`, `shared.json`, `view.json`, `data/`, `installed.json`, or other Herdr files. This scaffold creates no key bindings or persistent mod data. Keep a backup if either installed path contains your edits.

## Build from source (developers)

With Node.js 22.23.4, npm 10.9.9, Herdr 0.1.13, and `tar` available:

```sh
npm ci --ignore-scripts
make release-check
make package
```

`package.json` is the sole package-version source. The archive includes the compiled app-home paths, this installation guide, the no-overwrite checker, `RECIPE.md`, and a manifest/checksum. It excludes TypeScript source and development dependencies. `make release-check` also checks a temporary app home and does not launch the desktop app or touch the real Herdr core.

## Releasing this package

Maintainer instructions live in the [release process](https://github.com/cristianoliveira/herdr-muxcle/blob/main/docs/RELEASING.md), alongside the other independently installable packages. Tag automation prepares a draft; publication is a separate maintainer decision.

GitHub release publication does not submit a package to Herdr's public gallery. Gallery publication requires its own review and a genuine `preview.png`; no gallery submission is automated here.
