# Recipe: Broadcast input prototype for Herdr

This optional prototype relays supported keys to a reviewed, frozen set of 2–8 live local ordinary terminal panes. It is not transparent synchronization or finished tmux compatibility. It needs no assembly layout, mounted observer, sessionizer, or other Muxcle package.

## Limits and safety

- Install the mod separately. The optional `ctrl-a B` binding opens a review launcher; merge that one entry into your existing key map only after checking for conflicts. Loading the mod or opening the launcher sends no input. Review the exact pane and terminal list, then explicitly choose **Start broadcast prototype**.
- The launcher refuses remote spaces, mod/swapped/popup focus, duplicate or malformed references, inactive tabs, non-live targets, and counts outside 2–8. The captured set is immutable for that run. It targets model-pane terminal addresses from `panes()`; Native exposes `shown` replacement state only for the focused pane. A focused replacement is refused, but replacements on nonfocused panes cannot be reliably identified. Do not use this prototype where nonfocused panes may have swapped displays. Targets receive input sequentially, not atomically.
- The helper checks the same Core ID, focused space/tab, visible overlay, exact target membership, and each target's live state and `(pid, created_ms, argv, cols, rows)` before every bounded input batch. It attaches in resumed mode using the captured dimensions, verifies actual Core geometry immediately before and after attach, refuses missing/zero geometry, and stops if dimensions change. A concurrent native resize can race the attach check; no rollback is attempted if Core reports changed dimensions. Core handshake identity must match. Context changes, dialogs, stream failures, queue overflow, or unsupported keys stop delivery. In-flight input may be partial; there is no rollback or retry.
- The relay window shows every captured pane and terminal address without truncation. It needs at least 50 columns (or more for unusually long IDs) and `6 + 2 × target_count` rows; shrinking below that stops delivery. At eight targets, the minimum is 22 rows.
- The launcher does not expose or focus the helper until that exact helper process publishes a private, process-bound readiness marker after curses has enabled raw/noecho mode. This prevents the new helper PTY's cooked-mode echo window from displaying keystrokes before relay readiness. The marker confirms raw/noecho at publication only, not continuing liveness, and the helper withdraws it before curses restores terminal modes on exit. The helper has raw/noecho enabled before exposure and never displays or logs supported input; normal target terminal history still records it. UTF-8, basic control keys and navigation are supported. Escape exits. Paste, Alt, function keys, IME and advanced keyboard modes are unsupported and stop safely. The prototype installs no global keyboard hook and changes no normal pane input.
- The helper owns only its temporary removable terminal. Closing the overlay does not kill target processes; the helper exits on its own when it detects the overlay has closed. A durable launch receipt prevents duplicate helpers after ambiguous launch/close outcomes; reopening the same frozen scope reuses only a verified live helper. If ownership cannot be verified, inspect with `hc get <address>` or `hc ls --all`; there is no automatic retry, age-out, or cleanup. Do not force-kill targets to stop broadcast.

Runtime requires Herdr's shipped `peek` mod (for the helper header), `herdr-app`, `hc` with the framed `terminal.attach` API, and Python 3 with `curses`. These are prerequisites only for this package. Keep `HC_SESSION` available so CLI checks and `hc connect` use the same Core. Native initial-load and interactive use are separate checks; the package does not claim IME support or transparent synchronization.

## Install

Use a published versioned archive and matching checksum. A repository checkout or source folder is not an installable release.

```sh
set -eu
VERSION="${MUXCLE_VERSION:?Set MUXCLE_VERSION to a published tag containing this package}"
RELEASE_URL="https://github.com/cristianoliveira/herdr-muxcle/releases/download/$VERSION"
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT
ARCHIVE="muxcle-broadcast-prototype-${VERSION}.tar.gz"
curl -fL "$RELEASE_URL/$ARCHIVE" -o "$WORK_DIR/$ARCHIVE"
curl -fL "$RELEASE_URL/$ARCHIVE.sha256" -o "$WORK_DIR/$ARCHIVE.sha256"
(cd "$WORK_DIR" && shasum -a 256 -c "$ARCHIVE.sha256")
tar -xzf "$WORK_DIR/$ARCHIVE" -C "$WORK_DIR"
BUNDLE="$WORK_DIR/muxcle-broadcast-prototype-$VERSION"
APP_HOME="${HERDR_APP_HOME:?Set HERDR_APP_HOME to the Herdr app home you intend to use}"
sh "$BUNDLE/check-install-targets.sh" "$APP_HOME"
```

Copy only `$BUNDLE/mods/muxcle-broadcast-prototype` into `$APP_HOME/mods/`. Merge the optional key from `$BUNDLE/keys.json` into the existing key map without replacing other entries. Open the launcher, review its list, then choose **Start broadcast prototype**. Wait until the full scope and `READY · BROADCAST ON` are rendered before typing. Press Escape to exit.

## Update or uninstall

Back up the installed mod and key map. Use `check-install-targets.sh --update "$APP_HOME"` before replacing only the package-owned folder. Use `--remove` before uninstalling it. Remove `ctrl-a B` only if it still maps exactly to `mod.open:muxcle-broadcast-prototype`; preserve unrelated settings and later edits. The checker never removes files or edits key maps. A conflict requires review, not overwrite.
