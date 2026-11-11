# Pane sizing

Use the supplied compiled implementation as your base. Read this recipe and the package files, then fit them to the person's Herdr version, layout, keys, and stated preferences. Preserve unrelated configuration and disclose helper execution, network access, and reads outside the mod folder. Ask before replacing files or bindings or activating a different layout. Rebuild from the design only if the supplied files cannot work or the person requests a different implementation.

## Behavior and design

An optional Herdr capability for equalizing split shares, adjusting width/height weights, or creating a focused 4% height strip. Pane order, IDs, terminal content, focus, other tabs, and unrelated document fields stay unchanged. This is a tmux-inspired proportional layout tool, not tmux cell-based resizing.

The design requires exactly one shown, non-focusable command host in the active personal layout. The optional Ctrl-a = shortcut invokes muxcle-sizing.equalize. Commands: muxcle-sizing.help, equalize, grow-width, shrink-width, grow-height, shrink-height, and strip-height (all with the same muxcle-sizing prefix). These are command names, not installation steps. No resize shortcuts are part of the default snippet. Help opens a readable, closeable native dialog without a snapshot or core operation; Close or Escape returns to the existing pane.

Equalize balances flexible sibling shares recursively. Nested groups are balanced independently; this does not promise identical terminal pixel areas across an uneven tree. Already-equal groups remain intact, including their constraints. Changing an unequal group with fixed-pixel, min/max or non-resizable constraints is refused instead of discarding them.

Grow/shrink selects the nearest ancestor row for width or column for height with multiple children. It multiplies only the containing branch's weight by 1.1 to grow or divides by 1.1 to shrink, subject to native rounding/progress limits. Other sibling weights stay unchanged. Other panes within that branch may share its axis change. The entire selected group must be flexible and unconstrained; a constrained nearest split is refused rather than skipped. A single pane, missing axis or unrepresentable/no-progress resize is a no-op.

`muxcle-sizing.strip-height` is a separate operation; it does not redefine `shrink-height`. For 2–25 ordinary terminal panes, it converts every split to a vertical stack while preserving container and pane identities and order. Starting from an equal share per pane, the focused pane receives 4% of the tab's weighted height. The freed difference is added to the next pane in tree order, or the previous pane when focus is last; other panes keep their equal shares. Existing child size values are normalized to weights, including fixed-pixel sizes; custom `min`, `max`, or `resizable` constraints on any node refuse the operation. A repeated strip with no layout progress performs no document write.

Equalize and proportional grow/shrink require ordinary, unzoomed terminal layouts. The separate strip-height command also accepts a zoomed tab so the strip can be revealed after resizing. It requests native unzoom only after rechecking that the original pane is still focused and the tab is still zoomed; if focus or zoom changed, it leaves the tab alone. Hidden/mod panes, replaced terminal views, ambiguous sizing, custom strip constraints, and stale identities refuse. Every change uses at most one version-checked document write for the original tab and machine. Conflicts and uncertain acknowledgements are not retried. Repeated sizing commands are ignored while an operation is pending. Navigation or host removal does not cancel an already-started helper; the original tab may still change, but no focus command is issued. Inspect pane shares before repeating an uncertain operation.

Requires Herdr 0.1.13, Python 3 and hc with versioned doc.get/doc.set support on Herdr's PATH. The CLI must address the same core/session as the app; keep HC_SESSION consistent for isolated or custom sessions. No rotation or other Muxcle package, repository checkout, Node.js, Git, project-file access, new terminals, or persistent feature state is required. Recreation must preserve unrelated layouts, settings, bindings, and runtime state.

## Add this package to Herdr

For a published package, use its versioned archive and matching checksum; no source rebuild or development tooling is required. A GitHub source folder is an instruction entrypoint, not necessarily a compiled runtime payload. If a suitable release is unavailable, stop and explain what is missing rather than silently inventing a download or compiling on the user's machine.

Requires Herdr 0.1.13, Python 3 and `hc` on Herdr's `PATH`, with versioned `doc.get` / `doc.set` support. The CLI must reach the same core/session as the app: keep `HC_SESSION` consistent for isolated or custom sessions. No rotation package, other Muxcle capability, Node.js, Git, or repository checkout is required.

### Get the package

Download `muxcle-sizing-v<version>.tar.gz` and its `.sha256` from the [GitHub Releases page](https://github.com/cristianoliveira/herdr-muxcle/releases). Choose a published tag; if none exists, stop and ask whether a contributor should prepare a local build. For a local archive, verify and extract in the directory containing both files:

```sh
VERSION="${MUXCLE_VERSION:?Set MUXCLE_VERSION to the exact archive tag including leading v, for example v0.2.0 for a local candidate only}"
ARCHIVE="muxcle-sizing-${VERSION}.tar.gz"
shasum -a 256 -c "$ARCHIVE.sha256"
tar -xzf "$ARCHIVE"
```

### Install through Herdr

Ask your Herdr agent to read the recipe and package files, install only this mod, mount exactly one `host.json` block in the intended personal layout, and optionally merge the shortcut. Ask before cloning or switching a shipped layout, changing existing blocks, or replacing bindings. Never replace an entire layout or key map.

Manual file deployment:

```sh
set -eu
BUNDLE="/path/to/muxcle-sizing-${MUXCLE_VERSION:?Set MUXCLE_VERSION to the extracted archive tag including leading v}"
APP_HOME="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
sh "$BUNDLE/check-install-targets.sh" "$APP_HOME"
mkdir -p "$APP_HOME/mods"
cp -R "$BUNDLE/mods/muxcle-sizing" "$APP_HOME/mods/"
HERDR_APP_HOME="$APP_HOME" herdr-app check "$APP_HOME/mods/muxcle-sizing"
```

Add the `host.json` node as a child of a row or column in a personal layout. Resolve node-ID conflicts; do not mount duplicate copies. The one-pixel block is not focusable but must remain shown for command delivery. Do not edit a shipped layout: Herdr replaces those files on startup.

Optionally merge `ctrl-a =` → `muxcle-sizing.equalize` from `keys.json` into the global section. Review exact and higher-priority terminal/layout bindings first. Herdr reloads key changes live.

### Commands

Focus an ordinary terminal pane and mount the command host. Equalize and grow/shrink require the tab to be unzoomed; `strip-height` can start zoomed and only requests unzoom after rechecking focus. Choose one command below; wait for its result before invoking another:

```sh
herdr-app do muxcle-sizing.help
herdr-app do muxcle-sizing.equalize
herdr-app do muxcle-sizing.grow-width
herdr-app do muxcle-sizing.shrink-width
herdr-app do muxcle-sizing.grow-height
herdr-app do muxcle-sizing.shrink-height
herdr-app do muxcle-sizing.strip-height
```

`help` opens a readable native dialog without changing layout or reading core state. Use Close or Escape to dismiss it and return to the existing pane. The CLI confirms delivery, not asynchronous write completion; check Herdr's result before issuing another sizing command. `equalize` gives each nested row/column equal flexible sibling shares. This balances groups, not terminal pixel areas across an uneven tree.

Grow/shrink finds the nearest ancestor split on the requested axis: a row for width, a column for height. Only the weight of its child branch containing the focused pane changes. Grow multiplies that weight by `1.1`; Shrink divides it by `1.1`, subject to native numeric rounding. Other sibling weights stay unchanged. This is a reciprocal proportional step, not a 10-percentage-point allocation change or cell/pixel-based tmux resize.

In a nested grid, resizing may change the width or height of other panes in the same branch. For two equal siblings, one grow step changes weights from `[1, 1]` to `[1.1, 1]`, not allocations from 50/50 to 60/40. Pane IDs, order, terminal content, focus, container metadata, other tabs, and unrelated document fields are preserved. No new resize shortcuts are installed; review conflicts before binding these command names yourself. `strip-height` is bounded to 25 panes and intentionally changes the tab to a vertical stack; it is not a pixel-exact 4% display guarantee.

### Limits

A single pane, a missing split axis, and a resize beyond native numeric/progress limits change nothing. `strip-height` is limited to 25 panes; custom `min`, `max`, or `resizable` constraints refuse before writing. Existing child pixel/weight sizes are replaced by weighted strip shares. Equalize also leaves already-equal groups intact, including their existing constraints. If balancing an unequal group would change fixed-pixel sizes, min/max constraints or a non-resizable node, the whole operation is refused rather than discarding constraints.

Grow/shrink requires the entire selected sibling group to be flexible and unconstrained. A constrained nearest split is refused; the command does not jump to a more distant ancestor. Ambiguous sizing in affected groups, hidden or unsupported trees, mod panes, zoomed/replaced terminals for equalize/grow/shrink, and inconsistent snapshots are also refused. Trees are bounded to 64 panes, 32 nested levels and 512 nodes; the core document must fit its 1 MiB limit.

Mixed-strip parity also remains blocked. The pinned source `shrink_document` shares a validator that accepts terminal or mod leaves and preserves leaf payloads while restacking, but its tests do not exercise a mod through this strip path. Herdr has an existing isolated native `window::tests` harness; no case verifies a nonfocused mod's copy/resources and pane-header identity survive strip sizing alongside a focused terminal. Muxcle intentionally rejects mod panes. Keep that guard until an authorized test in the existing harness covers this exact mixed-strip lifecycle and focus behavior.

The helper validates the original tab's pane order and terminal identities, then makes at most one version-checked write. Conflicts are not retried. Repeated sizing commands are ignored while an update is pending. A timeout or lost acknowledgement can leave the write outcome uncertain: inspect pane shares before repeating.

Navigation away or closing/unmounting the host does not cancel an already-started helper; the originally selected tab may still change. No focus command is issued, so completion does not pull focus back.

### Update or remove

Back up local mod, layout and key edits first. Inspect a replacement package and run its preflight before replacing only the marked folder:

```sh
sh "$BUNDLE/check-install-targets.sh" --update "$APP_HOME"
BACKUP_DIR="$(mktemp -d)"
mv "$APP_HOME/mods/muxcle-sizing" "$BACKUP_DIR/muxcle-sizing"
cp -R "$BUNDLE/mods/muxcle-sizing" "$APP_HOME/mods/"
HERDR_APP_HOME="$APP_HOME" herdr-app check "$APP_HOME/mods/muxcle-sizing"
```

Restore the backup if copying or checking fails. Keep the existing host block; do not add another during an update.

To uninstall, remove this host block and only shortcut entries still matching this package. Run `sh "$BUNDLE/check-install-targets.sh" --remove "$APP_HOME"`, then move only `$APP_HOME/mods/muxcle-sizing` to a backup. Keep unrelated mods, settings, layout nodes, bindings, and runtime state. The mod stores no persistent feature state.

Native initial-render checks do not execute sizing commands. Verify interactive behavior with harmless terminals in the intended Herdr setup.
