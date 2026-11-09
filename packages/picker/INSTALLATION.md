# Install the spaces and tabs picker

**Installation:** deploy, configure, update, or remove the released package. For the behavior and design brief used to recreate it, see [Recipe](RECIPE.md). Installing a release does not require rebuilding the recipe.

Choosing a capability? Start with the [installation overview](https://github.com/cristianoliveira/herdr-muxcle/blob/main/INSTALLATION.md). This guide also ships inside this package's archive.

This package requires Herdr 0.1.13. No clone, Git, Node.js, Python, custom layout, or other Muxcle package is needed.

## Get the package

Download `muxcle-picker-v<version>.tar.gz` and its `.sha256` from the [GitHub Releases page](https://github.com/cristianoliveira/herdr-muxcle/releases). Choose a published tag; if none exists, use the installation overview's local-build path.

Verify the checksum before extraction. For a local package, run from the directory containing both files:

```sh
shasum -a 256 -c muxcle-picker-v0.1.0.tar.gz.sha256
tar -xzf muxcle-picker-v0.1.0.tar.gz
```

## Install through Herdr

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

## Update or remove

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

Remove an optional shortcut only if its key and action still match this package. Settings, runtime state, other packages, and later key edits stay untouched.

## Behavior limits

Results use native order, not focus history. Search covers space/tab names, not agent metadata or project directories. A target removed or moved after rendering is not selected. Native initial-render checks do not prove deferred list rendering or keyboard delivery; verify these in the intended Herdr setup.
