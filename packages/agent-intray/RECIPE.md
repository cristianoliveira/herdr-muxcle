# Agent attention inbox

This optional native mod keeps a bounded inbox of observed agent `done` and `blocked` transitions. It is separate from tmux compatibility, the Pi intray database, and any assembly layout. It does not send notifications to another process, read terminal contents, or infer errors.

## Behavior

- Stores up to 100 unread events and 1,000 remembered agent statuses/labels under its own `muxcle-agent-intray.state.v1` shared-state key. Labels and addresses are bounded and control characters are removed. Existing `intray.state` data is not read, changed, or deleted.
- Events appear newest first. Equal-sequence reports are ordered deterministically, and duplicate reports for an address are resolved deterministically.
- All / Finished / Needs input filters and literal multiword search only change the view. They do not mark events read.
- Enter queues a focus request to the exact live local or machine-qualified address. Native `run()` is asynchronous dispatch, not proof of focus; jumping never marks the event read. Use **Ctrl-D** to dismiss one event.
- **Dismiss all** opens a fixed-ID review. New arrivals remain unread. Escape or Cancel abandons review; only Ctrl-Enter or a pointer click on the explicit confirmation button confirms. Plain Enter does not.
- Mounting the optional one-pixel observer captures transitions while the popup is closed. Without it, transitions are observed only while the popup is open. Neither mode replays transitions from before it began observing.

Requires Herdr 0.1.13 or newer, whose native `agents()` API supplies status, sequence, title, space name, and tab name. The mod uses only native Herdr APIs; it requires no other Herdr Term package, Python, Node.js, Git, or repository checkout.

## Install

For a published package, download `muxcle-agent-intray-v<version>.tar.gz` and its matching `.sha256` from the [GitHub Releases page](https://github.com/cristianoliveira/herdr-term/releases). If no suitable release exists, stop and ask a contributor to prepare a local build. Verify and extract the archive:

```sh
VERSION="${MUXCLE_VERSION:?Set MUXCLE_VERSION to the exact archive tag including leading v, for example v0.2.0}"
ARCHIVE="muxcle-agent-intray-${VERSION}.tar.gz"
shasum -a 256 -c "$ARCHIVE.sha256"
tar -xzf "$ARCHIVE"
```

Ask your Herdr agent to install the package, optionally mount exactly one `observer.json` block in your existing personal layout, and review/merge the optional shortcut. Preserve unrelated files. Do not switch layouts or overwrite an existing binding without asking.

Manual deployment, with `BUNDLE` pointing at the extracted package:

```sh
set -eu
BUNDLE="/path/to/muxcle-agent-intray-${MUXCLE_VERSION:?Set MUXCLE_VERSION to the extracted archive tag including leading v}"
APP_HOME="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
sh "$BUNDLE/check-install-targets.sh" "$APP_HOME"
mkdir -p "$APP_HOME/mods"
cp -R "$BUNDLE/mods/muxcle-agent-intray" "$APP_HOME/mods/"
HERDR_APP_HOME="$APP_HOME" herdr-app check "$APP_HOME/mods/muxcle-agent-intray"
```

Open the popup with `herdr-app do mod.open:muxcle-agent-intray`, or merge the bundled `keys.json` entry (`Ctrl-A Shift-I`) after checking your own key map. The snippet is optional and is not installed automatically.

For closed-popup observation, add the bundled `observer.json` node to a suitable row or column in your existing personal layout. Check for an ID collision and mount exactly one shown observer. It occupies one pixel, is not focusable, and must remain mounted. Do not replace the whole layout. If you do not add the observer, the popup remains usable but cannot capture transitions while closed.

## Update or remove

Back up the installed mod and review the new files first. `--update` verifies the exact package ownership marker; replace only this mod folder, then run `herdr-app check` again:

```sh
sh "$BUNDLE/check-install-targets.sh" --update "$APP_HOME"
BACKUP_DIR="$(mktemp -d)"
mv "$APP_HOME/mods/muxcle-agent-intray" "$BACKUP_DIR/muxcle-agent-intray"
cp -R "$BUNDLE/mods/muxcle-agent-intray" "$APP_HOME/mods/"
HERDR_APP_HOME="$APP_HOME" herdr-app check "$APP_HOME/mods/muxcle-agent-intray"
```

To uninstall, remove only this mod's observer block and any shortcut that still maps to `mod.open:muxcle-agent-intray`. Then run `sh "$BUNDLE/check-install-targets.sh" --remove "$APP_HOME"` and move only `$APP_HOME/mods/muxcle-agent-intray` to a backup. The shared state key remains; do not edit or replace `shared.json` because it contains other mods' data. Keep unrelated layout blocks, keys, settings, and mods.

## Limits

The observer is required only for capture while the popup is closed, not for opening or using the inbox. UI state and unread events are shared between the popup and observer. The shared store has no compare-and-swap operation; both views always re-read before changing state, and no-op renders do not write. Native initial-load validation does not prove live status delivery, focus success, or persistence across an app restart. Verify interactive behavior in the intended Herdr setup. GitHub release publication does not imply a Herdr gallery listing; no gallery listing is claimed.
