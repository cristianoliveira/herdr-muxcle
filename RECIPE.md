# Herdr Muxcle scaffold

Use the supplied compiled implementation as your base. Read this recipe and the package files, then fit them to the person's Herdr version, layout, keys, and stated preferences. Preserve unrelated configuration and disclose helper execution, network access, and reads outside the mod folder. Ask before replacing files or bindings or activating a different layout. Rebuild from the design only if the supplied files cannot work or the person requests a different implementation.

## Behavior and design

A small personal layout with the shipped Spaces and Tabs modules and a custom status row. The row says “Muxcle scaffold — no tmux bindings installed.” This package is an installation baseline, not a tmux compatibility implementation.

## What you see

A 240 px Spaces block on the left. The right side has the shipped Tabs strip, active tab with Herdr's shipped pane header, and a 28 px Muxcle status row at the bottom.

## How it behaves

The layout uses normal Herdr spaces, tabs, terminals, and panes. The status row is static. No shortcuts, commands, filesystem access, network access, or background work are added.

## Built from

- `layouts/muxcle.json` references shipped `spaces`, `tabs`, and `pane` mods plus this package's `muxcle-compat` mod.
- `mods/muxcle-compat/main.js` is compiled from `main.ts`; it extends Herdr's `View` and returns one string.
- `mod.json` places the mod in the layout rather than docking a copy as a panel.

## Watch out

The layout is a complete window layout, not a patch to the current one. It does not rebind keys or migrate settings. Tested with Herdr 0.1.13. Herdr's core remains shared; `HERDR_APP_HOME` is not a core sandbox.

## Done when

- The native initial-render check accepts the supplied or adapted `muxcle-compat` mod.
- The Muxcle status row is visible when the `muxcle` layout is selected.
- Existing keys, settings, runtime state, and terminals remain untouched.

## Add this package to Herdr

For a published package, use its versioned archive and matching checksum; no source rebuild or development tooling is required. A GitHub source folder is an instruction entrypoint, not necessarily a compiled runtime payload. If a suitable release is unavailable, stop and explain what is missing rather than silently inventing a download or compiling on the user's machine.

This package is a starter layout and one static status mod. It does not implement tmux shortcuts or migrate a personal Herdr configuration. It installs no key bindings.

### End-user download and install

Choose a published tag from the [GitHub Releases page](https://github.com/cristianoliveira/herdr-muxcle/releases). If none exists, ask a contributor to prepare a local archive; do not require end-user development tooling. Set `MUXCLE_VERSION` to the exact tag, including its leading `v`, that is actually published and includes this package. The local candidate's `v0.2.0` filename does not imply that a release exists. This is a manual app-home install; it does not require Git, Node.js, npm, or a repository clone.

After a release exists, set `MUXCLE_VERSION` to its exact tag including the leading `v` and run this from a shell. The install checker refuses existing package paths and symlinked app-home containers rather than overwriting or following them.

```sh
set -eu
VERSION="${MUXCLE_VERSION:?Set MUXCLE_VERSION to a published tag including leading v and containing this package}"
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

### Update or reinstall

There is no automatic installer. In a shell, repeat the download and extraction block above, then set `APP_HOME` to your Herdr app home. Use update-mode preflight to reject symlinked containers while allowing the existing package-owned paths:

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

### Uninstall

If this layout is selected, switch back to another layout first. Confirm the app home, `layouts`, and `mods` containers are not symlinks. Compare the two package-owned paths to your backup or release; preserve any edits before removal. Then remove only these paths:

```sh
APP_HOME="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
test ! -L "$APP_HOME" && test ! -L "$APP_HOME/layouts" && test ! -L "$APP_HOME/mods" || { echo 'Refusing linked app-home path.' >&2; exit 1; }
rm "$APP_HOME/layouts/muxcle.json"
rm -R "$APP_HOME/mods/muxcle-compat"
```

Do not remove `keys.json`, settings, `.state`, `shared.json`, `view.json`, `data/`, `installed.json`, or other Herdr files. This scaffold creates no key bindings or persistent mod data. Keep a backup if either installed path contains your edits.

### Build from source (developers)

With Node.js 22.23.4, npm 10.9.9, Herdr 0.1.13, and `tar` available:

```sh
npm ci --ignore-scripts
make release-check
make package
```

`package.json` is the sole package-version source. The archive includes the compiled app-home paths, this recipe with setup instructions, the no-overwrite checker, and a manifest/checksum. It excludes TypeScript source and development dependencies. `make release-check` also checks a temporary app home and does not launch the desktop app or touch the real Herdr core.

### Releasing this package

Maintainer instructions live in the [release process](https://github.com/cristianoliveira/herdr-muxcle/blob/main/docs/RELEASING.md), alongside the other independently installable packages. Tag automation prepares a draft; publication is a separate maintainer decision.

GitHub release publication does not submit a package to Herdr's public gallery. Gallery publication requires its own review and a genuine `preview.png`; no gallery submission is automated here.
