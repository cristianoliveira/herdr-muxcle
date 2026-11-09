# Navigation repeat

Use the supplied compiled implementation as your base. Read this recipe and the package files, then fit them to the person's Herdr version, keys, and stated preferences. Preserve unrelated configuration and disclose helper execution, network access, and reads outside the mod folder. Ask before replacing files or bindings. Rebuild from the design only if the supplied files cannot work or the person requests a different implementation.

## Behavior and design

An optional, short-lived navigation mode for repeated tab and pane movement. Open it with Herdr's native `mod.open:muxcle-repeat` action or the optional `Ctrl-a Shift-r` shortcut. Herdr toggles this mod's single popup when the native open action runs again; the shortcut maps to that action. The visible popup captures keyboard input for up to 1.5 seconds of inactivity.

Inside the popup, `n` moves to the previous tab, `p` to the next tab, and `h/j/k/l` move focus left/down/up/right. `Ctrl-h/j/k/l` are aliases for those pane directions only; `Ctrl-n/p` are not accepted. Each supported key runs one native navigation command and renews the timeout.

Escape, clicking Exit, timeout, or any unsupported key closes the mode. Unsupported keys do not run navigation actions; the popup consumes them, so terminal passthrough is not promised. Press a key again after the popup closes to type normally. Existing app-level shortcuts may still apply. This standalone popup needs no mounted host or layout change.

The package requires Herdr 0.1.13. It does not require another Muxcle package, an observer, Python, external processes, filesystem access, network access, or persistent feature state. It does not repeat split, resize, create, close, or other commands.

## Add this package to Herdr

For a published package, use its versioned archive and matching checksum; no source rebuild or development tooling is required. A GitHub source folder is an instruction entrypoint, not necessarily a compiled runtime payload. If a suitable release is unavailable, stop and explain what is missing rather than silently inventing a download or compiling on the user's machine.

### Get and inspect the package

Download `muxcle-repeat-v<version>.tar.gz` and its `.sha256` file from the [GitHub Releases page](https://github.com/cristianoliveira/herdr-muxcle/releases). Choose a published tag; if none exists, stop and ask whether a contributor should prepare a local build. For local archives, verify and extract both files:

```sh
shasum -a 256 -c muxcle-repeat-v0.1.0.tar.gz.sha256
tar -xzf muxcle-repeat-v0.1.0.tar.gz
```

Read the recipe and mod files before installation. The runtime only calls the native `tab.prev`, `tab.next`, and `pane.go` commands for the fixed key allowlist.

### Install through Herdr

Ask your Herdr agent to install only this package and optionally merge the shortcut from `keys.json`. Ask before replacing an existing shortcut or mod folder. Do not change the layout.

Manual file deployment, with `BUNDLE` pointing at the extracted folder:

```sh
set -eu
BUNDLE="/path/to/muxcle-repeat-v0.1.0"
APP_HOME="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
sh "$BUNDLE/check-install-targets.sh" "$APP_HOME"
mkdir -p "$APP_HOME/mods"
cp -R "$BUNDLE/mods/muxcle-repeat" "$APP_HOME/mods/"
HERDR_APP_HOME="$APP_HOME" herdr-app check "$APP_HOME/mods/muxcle-repeat"
```

Open the popup while Herdr is running:

```sh
HERDR_APP_HOME="${HERDR_APP_HOME:-$HOME/.config/herdr-app}" herdr-app do mod.open:muxcle-repeat
```

Optionally merge the `ctrl-a shift-r` entry from `keys.json` into the existing global section after reviewing terminal, layout-specific, and global bindings. Herdr reloads key changes live. Never replace the whole key map.

### Update or remove

Close the popup first. Back up the installed mod before an update, then run the replacement package's preflight and native check. Set `BUNDLE` to the replacement package folder:

```sh
BUNDLE="/path/to/muxcle-repeat-v0.1.0"
APP_HOME="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
sh "$BUNDLE/check-install-targets.sh" --update "$APP_HOME"
BACKUP_DIR="$(mktemp -d)"
mv "$APP_HOME/mods/muxcle-repeat" "$BACKUP_DIR/muxcle-repeat"
cp -R "$BUNDLE/mods/muxcle-repeat" "$APP_HOME/mods/"
HERDR_APP_HOME="$APP_HOME" herdr-app check "$APP_HOME/mods/muxcle-repeat"
```

Restore the backup if copying or checking fails. To uninstall, set `BUNDLE` to the installed package folder and `APP_HOME` to the Herdr app home. Remove the shortcut only if its key and action still match this package, then run the preflight and move only the marked mod folder to a backup:

```sh
BUNDLE="/path/to/muxcle-repeat-v0.1.0"
APP_HOME="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
sh "$BUNDLE/check-install-targets.sh" --remove "$APP_HOME"
BACKUP_DIR="$(mktemp -d)"
mv "$APP_HOME/mods/muxcle-repeat" "$BACKUP_DIR/muxcle-repeat"
```

Keep unrelated keys, mods, and settings.

## Limits

The popup consumes unrecognized key events before closing, and no terminal passthrough is promised. It is an explicit navigation mode, not a transparent tmux prefix or repeat table. The timeout is based on inactivity; only the allowlisted navigation keys renew it. Closing the popup or unmounting the mod cancels the timer and prevents later dispatch. Native initial-load checks do not prove interactive keyboard focus or popup behavior; verify these with the intended keys.
