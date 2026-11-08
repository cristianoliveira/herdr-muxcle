# Install the Herdr Muxcle scaffold

This release is a starter layout and one static status mod. It does not implement tmux shortcuts or migrate a personal Herdr configuration. It installs no key bindings.

## Build and verify a release artifact

From a clean checkout with the prerequisites in [Development](../DEVELOPMENT.md):

```sh
npm ci --ignore-scripts
make release-check
make package
```

`make package` creates `dist/herdr-muxcle-v<version>.tar.gz`, its `.sha256` file, and a browsable versioned directory. Package version comes only from `package.json`. The archive contains only `layouts/muxcle.json`, `mods/muxcle-compat/{main.js,mod.json}`, `manifest.json`, and `RECIPE.md`; it contains no TypeScript source or development dependencies. Generated output is ignored by Git.

This archive and tag workflow do not submit the project to Herdr's public gallery. Gallery listings require a real `preview.png`; none is included because no isolated UI screenshot was captured. Do not imply gallery listing, release publication, or an actual tmux feature implementation.

Verify a downloaded checksum before extraction:

```sh
(cd dist && shasum -a 256 -c herdr-muxcle-v0.1.0.tar.gz.sha256)
```

## Fresh install

Set `APP_HOME` to the intended Herdr app home. `HERDR_APP_HOME` changes the app home path, but **does not isolate the Herdr core or its spaces, tabs, and terminals**.

```sh
APP_HOME="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
ARCHIVE="dist/herdr-muxcle-v0.1.0.tar.gz"
TEMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TEMP_DIR"' EXIT
(cd "$(dirname "$ARCHIVE")" && shasum -a 256 -c "$(basename "$ARCHIVE").sha256")
tar -xzf "$ARCHIVE" -C "$TEMP_DIR"
BUNDLE="$TEMP_DIR/herdr-muxcle-v0.1.0"

# Refuse collisions rather than overwriting existing files.
test ! -e "$APP_HOME/layouts/muxcle.json" || { echo 'Layout exists; use the update steps below.' >&2; exit 1; }
test ! -e "$APP_HOME/mods/muxcle-compat" || { echo 'Mod exists; use the update steps below.' >&2; exit 1; }
mkdir -p "$APP_HOME/layouts" "$APP_HOME/mods"
cp "$BUNDLE/layouts/muxcle.json" "$APP_HOME/layouts/"
cp -R "$BUNDLE/mods/muxcle-compat" "$APP_HOME/mods/"
HERDR_APP_HOME="$APP_HOME" herdr-app check "$APP_HOME/mods/muxcle-compat"
```

Herdr's check renders the mod once; it is not an interactive layout test. When ready, select the new layout from Herdr's layout picker. It replaces the whole window layout while selected. To switch back, select `main` or run `herdr-app do layout.switch '{"name":"main"}'` while Herdr is running. Do not run app commands against a live core unless you intend their effects on that core.

The layout references Herdr 0.1.13's shipped `spaces`, `tabs`, and `pane` mods. The package manifest records that tested version; it does not claim compatibility with every Herdr release.

## Update or reinstall

There is no installer that merges or replaces user files automatically. Prepare the new release in a temporary directory, using its version in the archive name:

```sh
APP_HOME="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
ARCHIVE="dist/herdr-muxcle-v0.1.0.tar.gz"
TEMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TEMP_DIR"' EXIT
(cd "$(dirname "$ARCHIVE")" && shasum -a 256 -c "$(basename "$ARCHIVE").sha256")
tar -xzf "$ARCHIVE" -C "$TEMP_DIR"
BUNDLE="$TEMP_DIR/herdr-muxcle-v0.1.0"
diff -u "$APP_HOME/layouts/muxcle.json" "$BUNDLE/layouts/muxcle.json" || true
diff -ru "$APP_HOME/mods/muxcle-compat" "$BUNDLE/mods/muxcle-compat" || true
```

Review both diffs before continuing. Back up the two package-owned paths first:

`herdr-app check` may generate `gpui-kit.d.ts` and `jsconfig.json` inside an installed mod folder; those are local generated helper files and are not in the release archive. Review differences rather than overwriting custom edits. After backing up the two owned paths and confirming you accept the selected files, replace only the layout and mod:

```sh
BACKUP_DIR="$(mktemp -d)"
cp -p "$APP_HOME/layouts/muxcle.json" "$BACKUP_DIR/"
cp -R "$APP_HOME/mods/muxcle-compat" "$BACKUP_DIR/"
cp -p "$BUNDLE/layouts/muxcle.json" "$APP_HOME/layouts/muxcle.json"
mv "$APP_HOME/mods/muxcle-compat" "$BACKUP_DIR/muxcle-compat.old"
cp -R "$BUNDLE/mods/muxcle-compat" "$APP_HOME/mods/"
HERDR_APP_HOME="$APP_HOME" herdr-app check "$APP_HOME/mods/muxcle-compat"
```

Keep the backup until the new mod check passes. Reinstalling the same version follows the same review; there is no silent overwrite path.

## Uninstall

If this layout is selected, switch back to another layout first. Compare both paths to your backup or release and preserve any edits before removal. Then remove only the two Muxcle-owned paths:

```sh
APP_HOME="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
# Review or back up both paths before removal.
rm "$APP_HOME/layouts/muxcle.json"
rm -R "$APP_HOME/mods/muxcle-compat"
```

Do not remove `keys.json`, settings, `.state`, `shared.json`, `view.json`, `data/`, `installed.json`, or other Herdr files as part of uninstall. This scaffold creates no bindings or persistent mod data. Keep a backup if either installed path contains your own edits.

## Versioned release

The release workflow runs only when a `v<package-version>` tag is pushed. It checks the tag against `package.json`, runs `make release-ci` (gate, lockfile audit, package verification), then attaches the archive and checksum to a GitHub Release. Hosted runners do not have Herdr installed; run `make release-check` locally first for the isolated native mod check. To prepare a release, update the single `package.json` version and lockfile, run local release checks, review the package, then verify and push the matching tag. For example:

```sh
make release-check
make release-tag TAG=v0.1.0
git tag v0.1.0
git push origin v0.1.0
```

This repository setup does not create tags or publish a release by itself.
