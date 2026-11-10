# Workspace chrome

Use the compiled mod as supplied. This optional Herdr 0.1.13 package adds a per-pane branch footer and an optional local clock block. Keep the native workspace-status block mounted and unchanged; merge only selected fragments into your existing layout, not the layout or key map as a whole.

## Behavior and scope

The `pane-footer` role extends Herdr's native pane header with that model pane's branch. It keeps the native program icon/name, folder, reported status, focus, split, zoom, and close behavior. The footer reads `PaneInfo.branch`; it never substitutes the active space's branch. Long title, folder, and branch text can shrink and truncate; title and branch each have a 160 px maximum, while hover controls keep fixed widths. Local home abbreviations apply only when an exact tab-to-space match identifies a local space. Remote or unassociated paths are shown without local-home rewriting.

PaneFrame has one header, which may be positioned at the bottom. The `pane-header` fragment sets `position: bottom`, `reveal: always`, and the mod content. Merge those fields into the existing `pane.header`; preserve its height and other layout fields. This replaces the native `pane` header content with a small presentation extension of that UI. Review any existing custom header before replacing it. PaneFrame supplies the original model pane and terminal identities. A `terminal.show` replacement does not prove that those props describe the displayed replacement; this mod does not infer replacement metadata from global focus state.

The `status-clock` role renders only a local `HH:MM ddd DD-Mon-YY` clock with explicit English day/month names. The view checks once per second, notifies only when the displayed minute changes, and cancels/guards its timer when closed. Keep Herdr's native `workspace-status` block mounted: it already supplies machine context, agent counts, space branch, and the command-palette hint. The optional clock is a separate 24 px block for a column parent and does not duplicate or replace that UI.

The `workspace-status-clock-column` fragment adds a separate 24 px block. Its `size.px` is height only under a `column` parent. Place it as a sibling immediately after the existing native `workspace-status` block only when that block's parent is a column. Do not use this fragment under a `row` parent: there, `size.px` is width and 24 px is too narrow for the clock. If the native block is row-parented, omit this fragment rather than changing the native block or parent. The mod uses native theme tokens, pane/workspace-chrome assets, and native pane commands. It does not scan Git, run processes, access files other than native metadata, poll remote machines, add observers, install shortcuts, or write settings.

**Provenance:** The pane header's program/folder/status/actions follow Herdr 0.1.13 native `mods/pane/main.js` (source subtree `adf94cb2c9b6f1cadbb31c51f84114b1aa332f0a`). The native workspace-status block remains installed and unchanged; this package does not reproduce its machine, agent, space-branch, or palette UI. The per-pane branch field comes from native `panes()` metadata. The clock's local format and change-only one-second check follow the personal `mods/tmux-status` reference identified in the TASK-0018 preflight. No upstream or personal module is vendored wholesale.

## Add it to Herdr

For a published package, use its versioned archive and matching checksum. If no suitable release exists, stop and ask a contributor to prepare a local build; do not invent a download or compile on the user's machine. Herdr 0.1.13 is required. No other Muxcle package, Node.js, npm, Git, or repository checkout is needed at runtime.

With `BUNDLE` pointing at the extracted package:

```sh
set -eu
APP_HOME="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
sh "$BUNDLE/check-install-targets.sh" "$APP_HOME"
mkdir -p "$APP_HOME/mods"
cp -R "$BUNDLE/mods/muxcle-workspace-chrome" "$APP_HOME/mods/"
HC_SESSION="muxcle-workspace-chrome-check-$$" HERDR_APP_HOME="$APP_HOME" \
  herdr-app check "$APP_HOME/mods/muxcle-workspace-chrome"
```

Read `layout-snippets.json` and review conflicts before merging:

1. In each existing `pane.header`, merge the `pane-header` fragment's `position`, `reveal`, and `content`. Keep its current `height` and other layout fields. Do not add a second header.
2. Inspect the existing `workspace-status` block's parent type. Only when it is a `column`, insert the `workspace-status-clock-column` block as a sibling after it. Keep the native block and its content, ID, size, and parent unchanged. Omit the clock block for a row parent or if the sibling cannot be added safely.

The snippets are partial property fragments, not a replacement layout. They do not select a layout or edit one automatically. Leave native pane/workspace content in place unless you deliberately apply the reviewed fragment.

## Update or remove

Run the bundled preflight in `--update` mode before replacing only the marked `mods/muxcle-workspace-chrome` folder. For removal, remove only the added clock block and restore the original pane header fields, then run preflight in `--remove` mode and move only the marked mod folder to a backup. The package writes no persistent state.

## Limits and verification

Pure and adapter tests cover local formatting, pane-specific branches, long metadata under a 260 px narrow-pane fixture, exact target mapping, stale-target refusal, saved-callback close guards, and timer close/change behavior. The narrow-pane test verifies truncation/flex constraints and that controls remain in the tree; it does not run Herdr's layout engine. An isolated initial-load check does not prove real visual appearance, scrolling, keyboard behavior, or navigation. Verify the footer and status row in the user's intended layout after activation. PaneFrame header props describe the original model node; visible `terminal.show` replacement metadata is not established by this package.
