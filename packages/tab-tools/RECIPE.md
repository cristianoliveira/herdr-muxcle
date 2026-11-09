# Tab tools

Use the supplied compiled implementation as your base. Read this recipe and the package files, then fit them to the person's Herdr version, layout, keys, and stated preferences. Preserve unrelated configuration. Ask before replacing files or bindings, modifying an existing layout, or activating a different layout.

## Behavior and design

An optional, independently installable tab capability. It moves the active tab left or right within its space, opens a checked zero-based position prompt for the focused tab, or names the focused tab from its terminal's known cwd. All mutations use Herdr's native `tab.move` and `tab.rename` commands. No helper, local filesystem lookup, external process, or persistent feature state is used.

The position prompt captures the original space and tab IDs when opened. It validates whole-number input, checks the target is still in that original space, and reads the current tab count before sending a move. Positions are zero-based in the prompt and converted to Herdr's one-based `tab.move` index. Invalid values and stale targets send no command. Escape or Cancel closes the prompt without changing the tab. Moving left/right at an edge does nothing; there is no wraparound.

Folder naming reads only `focused().cwd` from Herdr. It removes trailing `/` separators and uses the final path component, with `/` itself naming the root. It performs no local path resolution, so remote cwd values stay remote. The focused tab ID (including machine-qualified IDs) is passed unchanged. Herdr's native `tab.rename` trims leading and trailing whitespace in the requested name; other Unicode characters and normalization forms are passed through unchanged.

Requires Herdr 0.1.13 or newer, with `focused().cwd`, the native `tab.move`/`tab.rename` commands, and mod overlays. Exactly one shown, non-focusable `host.json` block must be mounted in the active personal layout for key commands to reach the mod. The host is not a replacement for a layout and does not require the whole-pack layout or any other Muxcle package.

## Add this package to Herdr

For a published package, use its versioned archive and matching checksum; no source rebuild or development tooling is required. A GitHub source folder is an instruction entrypoint, not necessarily a compiled runtime payload. If a suitable release is unavailable, stop and explain what is missing rather than silently inventing a download or compiling on the user's machine.

### Get the package

Download `muxcle-tab-tools-v<version>.tar.gz` and its `.sha256` from the [GitHub Releases page](https://github.com/cristianoliveira/herdr-muxcle/releases). Choose a published tag; if none exists, stop and ask whether a contributor should prepare a local build. For a local archive, verify and extract in the directory containing both files:

```sh
shasum -a 256 -c muxcle-tab-tools-v0.1.0.tar.gz.sha256
tar -xzf muxcle-tab-tools-v0.1.0.tar.gz
```

### Install through Herdr

Ask your Herdr agent to read the recipe and package files, install only this mod, mount exactly one `host.json` block in the intended personal layout, and optionally merge the shortcut snippet. Ask before changing existing bindings or selecting another layout. Never replace an entire layout or key map.

Manual file deployment:

```sh
set -eu
BUNDLE="/path/to/muxcle-tab-tools-v0.1.0"
APP_HOME="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
sh "$BUNDLE/check-install-targets.sh" "$APP_HOME"
mkdir -p "$APP_HOME/mods"
cp -R "$BUNDLE/mods/muxcle-tab-tools" "$APP_HOME/mods/"
HERDR_APP_HOME="$APP_HOME" herdr-app check "$APP_HOME/mods/muxcle-tab-tools"
```

Add `host.json` as a child of a row or column in your personal layout. Resolve node-ID conflicts and do not mount duplicates. The one-pixel block is not focusable but must remain shown for command delivery. Do not edit a shipped layout: Herdr replaces those files on startup.

Optionally merge the global bindings in `keys.json`. They use Ctrl-a then Alt-h/l to move, Alt-m to set a position, and Alt-r to name the tab from cwd. Review exact and higher-priority layout/terminal bindings first. Keep your existing manual `tab.rename` shortcut; this package does not replace it. Herdr reloads key changes live.

### Commands

Mount the host block in the active layout, then invoke any of these through Herdr's CLI:

```sh
herdr-app do muxcle-tab-tools.move-left
herdr-app do muxcle-tab-tools.move-right
herdr-app do muxcle-tab-tools.move-position
herdr-app do muxcle-tab-tools.rename-from-cwd
```

The position prompt acts on the captured tab even if focus changes while it is open. Recheck tab order before retrying after a command-delivery error. Folder naming requires an ordinary focused terminal with a known cwd; unsupported or missing context gives an informational refusal and sends nothing.

### Update or remove

Back up local mod, layout and key edits first. Inspect a replacement package and run its preflight before replacing only the marked folder:

```sh
sh "$BUNDLE/check-install-targets.sh" --update "$APP_HOME"
BACKUP_DIR="$(mktemp -d)"
mv "$APP_HOME/mods/muxcle-tab-tools" "$BACKUP_DIR/muxcle-tab-tools"
cp -R "$BUNDLE/mods/muxcle-tab-tools" "$APP_HOME/mods/"
HERDR_APP_HOME="$APP_HOME" herdr-app check "$APP_HOME/mods/muxcle-tab-tools"
```

Restore the backup if copying or checking fails. Keep the existing host block; do not add another during an update.

To uninstall, remove the host block and only shortcut entries still matching this package. Run `sh "$BUNDLE/check-install-targets.sh" --remove "$APP_HOME"`, then move only `$APP_HOME/mods/muxcle-tab-tools` to a backup. Keep unrelated mods, settings, layout nodes, bindings, and runtime state. The mod stores no persistent feature state.

Native initial-render checks do not execute commands or prove keyboard dispatch. Verify interactive shortcuts and the position dialog with harmless tabs in the intended Herdr setup.
