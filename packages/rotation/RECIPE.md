# Pane rotation

Use the supplied compiled implementation as your base. Read this recipe and the package files, then fit them to the person's Herdr version, layout, keys, and stated preferences. Preserve unrelated configuration and disclose helper execution, network access, and reads outside the mod folder. Ask before replacing files or bindings or activating a different layout. Rebuild from the design only if the supplied files cannot work or the person requests a different implementation.

## Behavior and design

An optional Herdr mod that advances terminal panes one position in the focused tab: `[A, B, C]` becomes `[C, A, B]`. Focus returns to the incoming terminal at the original screen position only while the original focus context and pane identities still match. The command design requires exactly one shown, non-focusable host block in the active personal layout. The optional shortcut is Ctrl-a Ctrl-o.

Two panes use native swaps by default. Set the host mod's `props.native_rotation` to literal `false` to route exactly two terminal panes through the existing helper and one version-checked update; `native_pair_rotation` is an alias. Omitted, `true`, and malformed values keep native pair behavior. Three to 64 panes, including nested row/column grids, use the helper and one version-checked update to the original tab's machine-scoped Herdr core document. Slot sizes and constraints stay in place; pane IDs and terminal content move together. Unrelated tabs, containers, and document fields are preserved.

The helper validates the requested pane order and terminal identities before writing and never retries a version conflict. Duplicate shortcuts are ignored while an update is pending. Navigation away or host removal suppresses later focus restoration but cannot undo an in-flight document write. Transport or acknowledgement failures can leave the write outcome uncertain; inspect panes before repeating.

A single pane is a no-op. Mod panes, zoomed/replaced terminals, hidden or unsupported tree shapes, stale snapshots, and oversized inputs are refused. No path retries failed native swaps through the document adapter. This is rotation, not resizing or equalization.

Mixed-mod rotation remains blocked, not shipped. Herdr's pinned source shows that a full leaf move preserving pane ID and mod `{name, props}` retains the owned copy during reconciliation; its pane-header copy is also keyed by pane ID. However, the existing isolated native `window::tests` harness has no test that moves a mixed mod leaf and verifies copy/resource survival, header identity, or incoming-mod keyboard routing. `pane.focus` selects a model pane, but native `pane_focus()` only resolves terminal focus handles; a mod target follows the window-focus fallback. Keep the terminal-only guard until an authorized test in the existing harness covers those exact movement and focus cases. This is separate from the native 3+ swap optimization: the existing one-CAS document path is not the blocker.

The native-pair opt-out is independent of mixed-mod lifecycle proof. Add `"props": {"native_rotation": false}` to this mod's existing `content` object to use the helper for exactly two terminal panes; merge the property without replacing the layout or other mod props.

Requires Herdr 0.1.13. Larger rotations also need Python 3 and hc with versioned document API support on Herdr's PATH. The mod creates no terminals or persistent feature state and accesses no project files. The helper communicates only with the selected core, including its configured machine route when applicable. No other Herdr Term package, Node.js, Git, or repository checkout is required.

## Add this package to Herdr

For a published package, use its versioned archive and matching checksum; no source rebuild or development tooling is required. A GitHub source folder is an instruction entrypoint, not necessarily a compiled runtime payload. If a suitable release is unavailable, stop and explain what is missing rather than silently inventing a download or compiling on the user's machine.

Requires Herdr 0.1.13 and exactly one shown command-host block in a personal layout. No other Herdr Term package, Node.js, Git, or repository checkout is required. Three or more panes require Python 3 and `hc` on Herdr's `PATH`, with core support for versioned `doc.get` / `doc.set`. Two-pane native rotation needs neither helper; the explicit two-pane opt-out requires both.

The `hc` CLI must reach the same core/session as Herdr. Keep `HC_SESSION` consistent for isolated or custom sessions; do not direct the helper at a different core.

### Get the package

Download `muxcle-rotation-v<version>.tar.gz` and its `.sha256` from the [GitHub Releases page](https://github.com/cristianoliveira/herdr-term/releases). Choose a published tag; if none exists, stop and ask whether a contributor should prepare a local build. For a local archive, verify and extract in the directory containing both files:

```sh
VERSION="${MUXCLE_VERSION:?Set MUXCLE_VERSION to the exact archive tag including leading v, for example v0.2.0}"
ARCHIVE="muxcle-rotation-${VERSION}.tar.gz"
shasum -a 256 -c "$ARCHIVE.sha256"
tar -xzf "$ARCHIVE"
```

### Install through Herdr

Ask your Herdr agent to read the package recipe and files, install only this mod, mount one `host.json` block in the intended personal layout, and optionally merge the shortcut. Ask before cloning or switching a shipped layout, changing existing blocks, or replacing bindings. Do not replace the entire layout or key map.

Manual file deployment:

```sh
set -eu
BUNDLE="/path/to/muxcle-rotation-${MUXCLE_VERSION:?Set MUXCLE_VERSION to the extracted archive tag including leading v}"
APP_HOME="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
sh "$BUNDLE/check-install-targets.sh" "$APP_HOME"
mkdir -p "$APP_HOME/mods"
cp -R "$BUNDLE/mods/muxcle-rotation" "$APP_HOME/mods/"
HERDR_APP_HOME="$APP_HOME" herdr-app check "$APP_HOME/mods/muxcle-rotation"
```

Add the `host.json` node as a child of a row or column in the personal layout. Resolve existing node-ID conflicts; do not mount duplicate copies. The one-pixel block is not focusable but must remain shown for command delivery. Do not edit a shipped layout: Herdr replaces those files on startup.

Optionally merge `ctrl-a ctrl-o` → `muxcle-rotation.rotate` from the package's `keys.json` into the global section. Review exact and higher-priority terminal/layout bindings first. Herdr reloads key changes live.

### Use and limits

Focus an ordinary terminal, then invoke the shortcut. Rotation advances pane contents one position: `[A, B, C]` becomes `[C, A, B]`. Focus returns to the incoming terminal at its original screen position if the original focus context is still current. A single pane changes nothing.

Supports up to 64 ordinary terminal panes, including nested row/column grids. Two panes use native swaps unless `props.native_rotation` is literal `false`; larger tabs use one version-checked core document update. The document adapter preserves slot sizes and min/max/resizable constraints, container metadata, other tabs, and unrelated document fields. It verifies pane order and terminal identities before writing. Hidden or unsupported tree shapes, zoomed/replaced terminals, mod panes, missing focus, oversized documents, and inconsistent snapshots are refused. Trees are bounded to 32 nested levels and 512 nodes; the core document must fit its 1 MiB limit.

The native two-pane command sequence is not an atomic transaction; a failure may leave partial changes. Document rotations—including the two-pane opt-out—write once using the exact version read from core; a conflict is not retried. Each core request has a five-second timeout; a lost write acknowledgement leaves the outcome uncertain. Inspect pane positions before repeating an uncertain command.

Repeated shortcuts are ignored while a document update is pending. Navigating away does not pull focus back; the originally selected tab may still rotate. Closing or unmounting the command host suppresses focus restoration but does not cancel the helper; the original tab may still rotate. No path retries a failed native sequence through the document adapter.

### Update or remove

Close any popup and back up local mod, layout, and key edits first. For an update, inspect the replacement package and run its preflight before replacing only the marked folder:

```sh
sh "$BUNDLE/check-install-targets.sh" --update "$APP_HOME"
BACKUP_DIR="$(mktemp -d)"
mv "$APP_HOME/mods/muxcle-rotation" "$BACKUP_DIR/muxcle-rotation"
cp -R "$BUNDLE/mods/muxcle-rotation" "$APP_HOME/mods/"
HERDR_APP_HOME="$APP_HOME" herdr-app check "$APP_HOME/mods/muxcle-rotation"
```

Restore the backup if copying or checking fails. Keep the existing host block; do not add another during an update.

To uninstall, first remove this host block and only shortcut entries still matching this package. Run `sh "$BUNDLE/check-install-targets.sh" --remove "$APP_HOME"`, then move only `$APP_HOME/mods/muxcle-rotation` to a backup. Keep unrelated mods, settings, layout nodes, bindings, and runtime state. This mod stores no persistent state.

Native initial-render checks do not execute pane swaps or verify focus restoration. Verify interactive behavior with harmless terminals in the intended Herdr setup.
