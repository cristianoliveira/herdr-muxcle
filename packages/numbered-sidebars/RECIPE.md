# Numbered sidebars

Use the compiled mod as supplied. Fit its optional blocks into the user's current layout; do not replace a layout or key map.

## Behavior and scope

This optional Herdr 0.1.13 mod provides two compact display roles: `spaces` and `agents`. Each is a 40 px strip with status-colored position numbers in a native vertical scroll area; fixed-height rows stay reachable when a list exceeds the viewport. A working number uses Herdr's native opacity loop. The selected space also has a neutral `>` marker, so selection is not conveyed by color alone. Unknown agent status or missing pane metadata is marked with `?`; rows without a verified pane cannot focus.

The strips render native snapshots without sorting. Space labels follow `spaces()` order. Agent labels follow `agents()` space/tab/pane snapshot order. These are local display labels, not promises about the expanded Agents view's priority/pin ordering or native `agent.next`/`agent.prev` navigation order. The mod never calls `setAgentOrder`.

Clicking a space dispatches `space.select` with its exact current ID. Clicking an agent dispatches `pane.focus` only after rechecking the captured exact address/pane pair against fresh `agents()` and `panes()` snapshots. A removed or changed target is ignored; no index is used as a target. `run()` is asynchronous from the mod's perspective, so a click is not proof that navigation completed.

The strips are presentation and navigation only. Keep the installed native `spaces` and `agents` blocks mounted wherever their expanded management controls are needed. The strips do not provide native creation, rename, close, drag, pin, grouping, or filtering controls. They do not change native sidebar width/collapse state; Herdr's built-in compact behavior remains coupled to the literal `sidebar` layout node and its width. Add one or both strips as siblings without renaming or resizing that node. The native APIs provide the snapshots whether or not a strip is mounted; the expanded blocks are needed for their management UI.

No shortcut, global agent order, settings/shared-state write, observer, polling, custom color palette, process, filesystem scan, or network access is added. The package does not auto-activate a layout.

**Provenance:** the status-number tint and working opacity loop reproduce demonstrated presentation behavior from the personal Herdr clones at dotfiles HEAD `c8a3177993943b4974148fad7ac7f0d6e83d2c24` (`mods/number-spaces/main.js` and `mods/number-agents/main.js`). The neutral `>` selected-space marker is an acceptance-driven addition here; those clones used a selected background instead. The clone implementations are not vendored. Supported Herdr source `adf94cb2c9b6f1cadbb31c51f84114b1aa332f0a` already numbers both native compact views and supplies native status indicators; this package adds only the missing presentation treatment.

## Add it to Herdr

For a published package, use its versioned archive and matching checksum. If no suitable release exists, stop and ask a contributor to prepare a local build; do not invent a download or compile on the user's machine. Herdr 0.1.13 is required. No other Herdr Term package, Node.js, npm, Git, or repository checkout is needed at runtime.

Read `layout-snippets.json`. Copy the `spaces` block, the `agents` block, or both into an existing row's `children`; choose their order for left/right placement. The file contains block snippets, not a replacement layout. Review node-ID conflicts first. Preserve the existing native expanded views and all unrelated layout blocks. Do not mount the snippets by replacing the user's layout.

With `BUNDLE` pointing at the extracted package:

```sh
set -eu
APP_HOME="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
sh "$BUNDLE/check-install-targets.sh" "$APP_HOME"
mkdir -p "$APP_HOME/mods"
cp -R "$BUNDLE/mods/muxcle-numbered-sidebars" "$APP_HOME/mods/"
HERDR_APP_HOME="$APP_HOME" herdr-app check "$APP_HOME/mods/muxcle-numbered-sidebars"
```

Then merge only the desired block snippets into the chosen personal layout and review the result before selecting that layout. No keyboard binding is installed.

## Update or remove

Run the bundled preflight in `--update` mode and replace only the marked `mods/muxcle-numbered-sidebars` folder. Keep the layout blocks; they remain valid for a compatible replacement. For removal, first remove only the package blocks that were added. If an existing node was deliberately reused, restore its original content/props instead of deleting the user's node or native expanded controls. Preserve unrelated IDs, parent geometry and fields. Then run preflight in `--remove` mode and move only the marked mod folder to a backup. The package writes no persistent state.

## Limits and verification

The built-in `spaces` and `agents` views retain their own width/order behavior. This package does not align its labels with native priority sorting or navigation cycling, and it makes no visual, keyboard, or end-to-end navigation claim from a native initial-load check. Verify appearance and clicking in the user's intended layout after activation. Keep the native expanded blocks available for full management.
