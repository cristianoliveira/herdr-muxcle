# Recipe: Listening process picker for Herdr

This optional native mod reviews local TCP listeners and signals only the exact processes you select. It is independently installable and does not require the assembly layout, a mounted host, or another Muxcle package.

## Safety and limits

- Opening the mod does not inspect processes. Choose **Scan local TCP listeners** to request an inventory. Scan is refused unless the current focus is an ordinary terminal in the active local space with no visible agent body; remote, swapped, mod, and unknown contexts have no local fallback.
- The inventory comes from this package's trusted `port_processes.py` helper using `lsof`, `ps`, and Python 3 in isolated mode from `/`. It does not load project or site scripts or read a personal dotfiles path. Supported platforms are macOS and Linux with local `lsof`, `ps`, and Python 3 available. No `sudo` or privilege escalation is used.
- Nothing is selected initially. Search the PID, command, start time, or ports; select up to 32 distinct processes; then choose **Review**. The review freezes each PID, UID, command, process start time, and all captured listening ports. A process listening on several ports is signaled once.
- **Send TERM** is available only from the frozen review. It requests graceful shutdown and does not automatically escalate or retry. A separate **Review force KILL…** step displays the frozen identities again; only its distinct **Confirm force KILL** button requests SIGKILL. Plain Enter, selection, Back, Escape, Cancel, and dismiss never signal a target.
- Immediately before each signal, the helper re-reads process identity and listening ports. Changed identity, start time, UID, or port set is rejected. PID reuse protection is best-effort: the OS does not provide an atomic “verify this process identity and signal it” operation here, so PID reuse or scheduling can still race the final check. Permissions can deny a signal. Some targets may be signaled before a later target fails; results can be partial or unknown. A sent signal does not confirm process exit. Rescan before any follow-up; the mod never retries, rolls back, or escalates automatically.
- Dismissing the picker closes only the native dialog. It creates no helper terminal and never kills an unselected or listed process as cleanup. Force KILL bypasses process cleanup and may lose unsaved work.

Runtime requires Herdr 0.1.13, Python 3, and `lsof` on macOS or Linux. `ps` and process signaling use the platform's standard facilities. The optional `ctrl-a shift-k` key is a snippet only; check for a conflict before merging it into your existing key map. The mod installs no shortcut by default.

## Install

Use a published versioned archive and matching checksum. A source folder is not a compiled runtime package.

```sh
set -eu
VERSION="${MUXCLE_VERSION:?Set MUXCLE_VERSION to a published tag including leading v and containing this package}"
RELEASE_URL="https://github.com/cristianoliveira/herdr-muxcle/releases/download/$VERSION"
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT
ARCHIVE="muxcle-port-process-picker-${VERSION}.tar.gz"
curl -fL "$RELEASE_URL/$ARCHIVE" -o "$WORK_DIR/$ARCHIVE"
curl -fL "$RELEASE_URL/$ARCHIVE.sha256" -o "$WORK_DIR/$ARCHIVE.sha256"
(cd "$WORK_DIR" && shasum -a 256 -c "$ARCHIVE.sha256")
tar -xzf "$WORK_DIR/$ARCHIVE" -C "$WORK_DIR"
BUNDLE="$WORK_DIR/muxcle-port-process-picker-$VERSION"
APP_HOME="${HERDR_APP_HOME:?Set HERDR_APP_HOME to the app home Herdr currently uses}"
sh "$BUNDLE/check-install-targets.sh" "$APP_HOME"
```

Copy only `$BUNDLE/mods/muxcle-port-process-picker` into `$APP_HOME/mods/`, then run:

```sh
HERDR_APP_HOME="$APP_HOME" herdr-app check "$APP_HOME/mods/muxcle-port-process-picker"
```

If you want the optional shortcut, merge only the entry from `$BUNDLE/keys.json` into the existing key map after checking that `ctrl-a shift-k` is unused. Preserve all other entries; do not replace the key map.

## Open

With Herdr running, open the dialog from a local ordinary terminal:

```sh
HERDR_APP_HOME="${HERDR_APP_HOME:?Set HERDR_APP_HOME}" herdr-app do mod.open:muxcle-port-process-picker
```

Choose **Scan local TCP listeners**, select the exact processes, and review the frozen identities. Then choose **Send TERM** for graceful shutdown, or use the separate force-review and confirmation steps only when you intentionally want SIGKILL. Keep the dialog open for the result. No release or interactive-runtime validation is implied by a local source checkout.

## Update or remove

Verify the new archive and checksum. Back up the installed folder and key map, then check exact ownership before replacing only the marked mod folder:

```sh
sh "$BUNDLE/check-install-targets.sh" --update "$APP_HOME"
```

To remove the mod, check ownership first and remove only the marked folder. Remove `ctrl-a shift-k` only if it still maps exactly to `mod.open:muxcle-port-process-picker`. Preserve all other keys, settings, layouts, and installed mods.

```sh
sh "$BUNDLE/check-install-targets.sh" --remove "$APP_HOME"
```
