# Recipe: Keyboard copy mode for Herdr

This optional package opens the snapshot of the terminal actually shown by Herdr in a separate local Neovim terminal. It requires Herdr 0.1.13's shipped `peek` mod for the viewer header; do not copy or install `peek` separately. The target can be local or machine-qualified remote. It does not require a custom layout, sessionizer, project popup package, or mounted observer.

## Behavior and limits

- The optional `ctrl-a [` binding opens a launcher. Merge that one binding into your existing key map; if the chord already has another action, choose an unused chord instead of replacing it. Opening the launcher or loading the mod does not query Core or capture a snapshot; choose **Copy snapshot** to start.
- The package follows Native's visible layout semantics. An exact focused literal terminal block takes precedence over other surfaces; its machine comes from its own address, not the underlying space. A visible `tab: "active"` body targets the Native-focused pane and its `shown` terminal. A sole visible `{ "agent": "focused" }` body uses its live agent address. When simultaneously visible terminal bodies disagree, or no visible terminal body can be proven, copy mode refuses to guess. Stacks use Native's visible active-child / first-visible-child fallback. Hidden blocks do not count.
- Before capture, the helper pins the current Core ID and, for remote addresses, the machine's Core ID. It verifies those identities before and after `hc read --json --lines 10000 <exact-address>`, using literal argv. A three-second timeout permits one three-second `--lines 0` fallback. ReadResult `complete` and `how` are validated; screen-only and incomplete snapshots are labeled in the viewer. A failed/malformed capture or snapshot above 8 MiB is rejected.
- The snapshot viewer runs in a separately owned local Herdr terminal with the user's home as its non-project working directory. It does not send keys to, pause, or replace the source terminal; the original program keeps running. Press `q` or `Esc` to exit the viewer. Dismissing the overlay never kills the viewer; the active receipt prevents duplicate launches, and the same capture action can reopen a verified viewer without recapturing. Kept, replaced, or uncertain viewers are left untouched and require manual inspection with the exact `hc get <address>` or `hc ls --all` command shown by the mod.
- The bundled Neovim config disables user config/plugins, modelines, `exrc`, editing, swap, backup, undo history (`undolevels=-1`), persistent undo, and automatic clipboard integration. `q` or `Esc` exits; `h/j/k/l`, `/`, `v`, `V`, and `Ctrl-v` navigate, search, and select. Only an explicit `y` sends the selection through Herdr's local OSC 52 clipboard route. Selections over 1 MiB are refused.
- This is not a Neovim sandbox. The snapshot is treated as data, but Neovim itself and its runtime remain trusted. A forced kill or crash can leave a private temporary directory behind; cleanup is best-effort, not guaranteed. If ownership cannot be confirmed during cleanup, inspect the exact address shown by the error before stopping anything.

Runtime needs Herdr 0.1.13-compatible mod APIs and its shipped `peek` mod (required for the header; do not copy/install it separately), `hc` with `read --json --lines`, Python 3, and Neovim with the built-in OSC 52 clipboard helper. The helper passes the exact Native terminal address to `hc`; with a custom Herdr core/session, keep the app's `HC_SESSION` available to `hc` so it reads from that same core. The development acceptance checks used `hc 0.1.18` and Neovim 0.12.4. Python, `hc`, and Neovim are prerequisites only for this package; key-only and other packages remain independent.

## Add this package to Herdr

Use a published versioned archive and its matching checksum. No Git, repository clone, Node.js, npm, or local source build is required to install a release. A source folder is not a compiled runtime package. If no suitable release exists, stop rather than inventing a download or compiling on the user's machine.

```sh
set -eu
VERSION="${MUXCLE_VERSION:?Set MUXCLE_VERSION to a published tag containing this package}"
RELEASE_URL="https://github.com/cristianoliveira/herdr-muxcle/releases/download/$VERSION"
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT
ARCHIVE="muxcle-copy-mode-${VERSION}.tar.gz"
curl -fL "$RELEASE_URL/$ARCHIVE" -o "$WORK_DIR/$ARCHIVE"
curl -fL "$RELEASE_URL/$ARCHIVE.sha256" -o "$WORK_DIR/$ARCHIVE.sha256"
(cd "$WORK_DIR" && shasum -a 256 -c "$ARCHIVE.sha256")
tar -xzf "$WORK_DIR/$ARCHIVE" -C "$WORK_DIR"
BUNDLE="$WORK_DIR/muxcle-copy-mode-$VERSION"
```

Keep this shell open while inspecting and installing; `WORK_DIR` is removed when it exits.

## Fresh install

Set `HERDR_APP_HOME` to the app home you intend to use. The check refuses to overwrite an existing or linked mod folder.

```sh
APP_HOME="${HERDR_APP_HOME:?Set HERDR_APP_HOME to your Herdr app home}"
sh "$BUNDLE/check-install-targets.sh" "$APP_HOME"
```

Copy only `$BUNDLE/mods/muxcle-copy-mode` into `$APP_HOME/mods/`. Merge the optional `global` binding from `keys.json` into your existing key map, preserving every other key and setting. Do not install the key snippet as a replacement key map. Once Herdr loads the package, focus the desired terminal or make its agent body visible, press `ctrl-a [`, then press **Enter** to copy (or click **Copy snapshot**). Confirm the displayed address before copying; press **Esc** to close the launcher without capture.

## Update or reinstall

Verify the new archive and checksum. Back up the installed mod folder and key map. Run the bundle's ownership check before replacing files:

```sh
sh "$BUNDLE/check-install-targets.sh" --update "$APP_HOME"
```

Replace only the marked `$APP_HOME/mods/muxcle-copy-mode` folder. Merge the optional shortcut only if it still maps exactly to `mod.open:muxcle-copy-mode`; preserve later edits and unrelated settings.

## Uninstall

Back up the key map and run the ownership check:

```sh
sh "$BUNDLE/check-install-targets.sh" --remove "$APP_HOME"
```

If the marker matches, remove only `$APP_HOME/mods/muxcle-copy-mode`. Remove `ctrl-a [` only if it still maps exactly to `mod.open:muxcle-copy-mode`. Keep unrelated settings and later edits. The check script does not delete files or edit your key map.
