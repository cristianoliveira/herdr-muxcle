# Recipe: Project popup for Herdr

This optional mod opens the focused local project's executable `.tmp/popup` in a native terminal overlay. It runs only after the user opens the launcher and chooses **Run**. It requires Herdr 0.1.13's shipped built-in `peek` mod for the native header; do not copy or install `peek` separately. It needs no custom layout, mounted host, sessionizer, or assembly package.

## Behavior and limits

- `ctrl-a space` opens the launcher; it does not execute the project script.
- The launcher requires a normal local terminal in the active local space, a matching active tab and pane, and a known absolute POSIX working directory. It refuses `..` parent-traversal and leading `//` paths rather than rewriting potentially symlink-sensitive locations.
- **Run** executes a fixed `/bin/sh -c 'exec "$1"'` wrapper with the absolute project script path as a positional argument and that project directory as `cwd`. This forces Herdr's `hc run` CLI to send separate argv values, avoids template-name lookup, and never interpolates the project path into shell source.
- The project script is arbitrary code. Review it first. It runs with the permissions and environment available to Herdr and may access files or the network.
- The popup uses a separately owned Herdr terminal with Herdr's native `peek` header. The header provides keep-as-tab, go-to, and close controls. Close dismisses only the dialog; it does not stop the program. A short-lived script may exit before the terminal is shown.
- Dismissing the overlay leaves the terminal running. Herdr 0.1.13 has no atomic compare-and-stop API, so a check followed by `hc kill` cannot guarantee that a terminal was not kept or reassigned between calls. The mod does not send an automatic stop command; inspect the exact terminal and stop it manually if desired.
- A token-bound receipt remains after the dialog closes. The next explicit Run checks that terminal before launching again: a live or kept terminal blocks duplicates, while a gone or finished terminal clears the receipt and proceeds with the new, explicitly requested run. For uncertainty, the UI gives an exact recovery command such as `hc get <address>` or `hc ls --all`; inspect the state before trying again.

This is a focused-project tool, not a tmux sessionizer. It does not find projects, read the script, install a script, change a layout, or start on focus alone. It requires Herdr 0.1.13 APIs, local POSIX `test` and `/bin/sh`, and an executable `.tmp/popup` with a valid interpreter line.

## Add this package to Herdr

Use a published versioned archive and its matching checksum. No Git, repository clone, Node.js, npm, or local source build is required to install a release. A source folder is not a compiled runtime package. If no suitable release exists, stop rather than inventing a download or compiling on the user's machine.

```sh
set -eu
VERSION="${MUXCLE_VERSION:?Set MUXCLE_VERSION to a published tag including leading v and containing this package}"
RELEASE_URL="https://github.com/cristianoliveira/herdr-muxcle/releases/download/$VERSION"
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT
ARCHIVE="muxcle-project-popup-${VERSION}.tar.gz"
curl -fL "$RELEASE_URL/$ARCHIVE" -o "$WORK_DIR/$ARCHIVE"
curl -fL "$RELEASE_URL/$ARCHIVE.sha256" -o "$WORK_DIR/$ARCHIVE.sha256"
(cd "$WORK_DIR" && shasum -a 256 -c "$ARCHIVE.sha256")
tar -xzf "$WORK_DIR/$ARCHIVE" -C "$WORK_DIR"
BUNDLE="$WORK_DIR/muxcle-project-popup-$VERSION"
```

Keep this shell open while inspecting and installing; `WORK_DIR` is removed when it exits.

## Fresh install

Set `HERDR_APP_HOME` to the app home you intend to use. The check refuses to overwrite an existing or linked mod folder.

```sh
APP_HOME="${HERDR_APP_HOME:?Set HERDR_APP_HOME to your Herdr app home}"
sh "$BUNDLE/check-install-targets.sh" "$APP_HOME"
```

Copy the bundle's `mods/muxcle-project-popup` folder into `$APP_HOME/mods/`. Merge only the package's `global` binding from `keys.json` into your existing key map. Preserve all other keys and settings. If `ctrl-a space` already has a different action, stop and choose a different unused chord; do not replace it silently. Do not use the snippet as a replacement for your full key map.

The package does not create `.tmp/popup`. In the project where you want to use it, create and review that executable yourself, for example:

```sh
mkdir -p .tmp
printf '#!/bin/sh\n' > .tmp/popup
chmod +x .tmp/popup
```

Add the desired project behavior to the file before running it. Once Herdr loads the added mod, open the launcher with `ctrl-a space`, review the path, and choose **Run** only when ready.

## Update or reinstall

Verify the new archive and checksum. Back up the installed mod folder and key map. Run the new bundle's ownership check before replacing package files:

```sh
sh "$BUNDLE/check-install-targets.sh" --update "$APP_HOME"
```

Replace only the marked `mods/muxcle-project-popup` folder with the new bundle folder. Merge the optional shortcut only if it is still the package's exact action. Do not overwrite user changes or unrelated settings.

## Uninstall

Back up the key map and run the ownership check:

```sh
sh "$BUNDLE/check-install-targets.sh" --remove "$APP_HOME"
```

If the check confirms the exact package ownership marker, remove only `$APP_HOME/mods/muxcle-project-popup`. Remove `ctrl-a space` only if it still maps exactly to `mod.open:muxcle-project-popup`. Keep later edits and unrelated settings. The checker does not delete files or edit your key map.
