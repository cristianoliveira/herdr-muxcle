# Workspace chrome

Use the compiled mod as supplied. This optional Herdr 0.1.13 package adds a per-pane branch footer, optional tab/panel bar compositions, and local clock fragments. Keep Herdr's native `workspace-status` block mounted and unchanged. Merge selected snippets into an existing layout; do not replace the layout or key map.

## Behavior and scope

The `pane-footer` role extends Herdr's native pane header with that model pane's branch. It keeps the native program icon/name, folder, reported status, focus, split, zoom, and close behavior. The branch comes from `PaneInfo.branch`, never the active space. Pane commands revalidate exact pane, terminal, mod, and tab IDs against a fresh snapshot before dispatch. Native close confirmation stays enabled. Long title, folder, and branch text can shrink and truncate; hover controls keep fixed widths. Local home abbreviations apply only when an exact tab-to-space match identifies a local space.

Choose one bar composition for one existing toolbar slot. For an already-mounted toolbar block, merge only the selected fragment's `content`; preserve its ID, type, size, parent axis, ordering, and sibling blocks. Do not add a second tabs/panels controller beside an existing native `tabs` view. Add a new block only when the layout has a reviewed free slot. The row fragments are not column replacements.

- **Tabs only:** `tabs-only-row` renders a horizontally scrollable tab strip, create button, close controls, and a custom tab-actions popup for rename/new/close. Drag reorder captures exact space/tab IDs, then resolves the current destination from a fresh snapshot. Named tabs use Herdr's `named` metadata, so a user name that resembles an automatic label is preserved. Files/Changes controls are omitted.
- **Panels only:** `panels-only-row` renders Files/Changes and a tab-manager button plus create button. The tab manager provides select, close, rename, and ID-based drag reorder, so tab creation and management do not depend on a sibling tabs view. Panel controls are available only when their configured existing targets are verified in the current layout tree. Defaults are `panel`, `panel-body`, `files`, and `changes`; set `panel`, `stack`, `filesPanel`, and `changesPanel` props when the user's existing IDs differ. A missing or duplicate target, non-direct stack child, hidden target child, hidden stack, or panel/stack in an inactive ancestor branch is unavailable. The panel itself may be hidden and remain togglable. At each ancestor stack, visibility follows active-if-visible then first-visible fallback; the target stack uses the same rule for its displayed child while keeping its other direct children selectable. Clicks select/show or hide only those exact native layout nodes. This mod does not write settings, resize nodes, install a layout, or remember/restore panel state.
- **Combined:** prefer the `combined-native-tabs-row` fragment, which composes Herdr's installed `tabs` mod. That native view already provides create/select/close/reorder, native menu actions, Files/Changes, and platform-aware window controls. Its own native panel preference behavior remains owned by Herdr; this package adds no second restoration controller. Native `tabs` assumes panel IDs `panel`, `panel-body`, `files`, and `changes`, and does not read the custom mode's configurable IDs. If the existing layout uses different IDs, choose a custom combined or panels-only bar with explicit props; do not rewrite user IDs/settings. Use `combined-without-window-controls-row` only when deliberately omitting those controls; it uses this package's custom combined view. Custom bars follow `window().buttons` by default. `windowControls: "omit"` is the explicit opt-out. No traffic-light geometry is inferred.

The custom tab manager revalidates the captured active space and tab membership before every action. Removed, duplicated, moved, or stale targets refuse. Tab reorder stores IDs while dragging and computes the one-based native destination index from the current order only at drop time. Blank-area presses, root mouse-up, outside presses, and new tab presses clear or replace the captured source, so an outside release cannot leak the old drag into the next blank-area gesture. The tab picker and tab-actions popup close only their own overlay before opening the native creation menu. With no spaces, an unscoped create button opens Herdr's `new-menu` so its native new-space flow remains available; a stale pinned space is refused. Commands are queued native requests, not execution acknowledgements; there is no retry or rollback. The native combined bar uses Herdr's `tabs`, `menu`, and `new-menu` modules and native assets.

PaneFrame has one header, which may be positioned at the bottom. The `pane-header` fragment sets `position: bottom`, `reveal: always`, and the mod content. Merge those fields into the existing `pane.header`; preserve its height and other fields. This replaces the native pane header content with a small presentation extension. Review any existing custom header before merging it. PaneFrame header props describe the original model node; a `terminal.show` replacement does not establish displayed replacement metadata.

The `status-clock` role renders only a local `HH:MM ddd DD-Mon-YY` clock with explicit English day/month names. It checks once per second, notifies only when the displayed minute changes, and cancels/guards its timer when closed. Keep native `workspace-status` mounted: it supplies machine context, agent counts, space branch, and the command-palette hint.

Use `workspace-status-clock-column` only as a sibling under a column parent; its 24 px size is height. Use `workspace-status-clock-row` only as a sibling under a row parent; its weight-based size is width, not a 24 px strip. Never apply the row weight to an existing column block or overwrite the column clock's height. Keep the parent and native workspace-status node unchanged. Omit either clock fragment if the matching sibling cannot be added safely.

**Native dependencies:** Herdr 0.1.13 supplies `tabs`, `menu`, `new-menu`, `pane`, `files`, `changes`, and `workspace-status`. The custom views also reuse installed assets at `mods/workspace-chrome/{branch.svg,spinner.svg}`, `mods/pane/{split-right,split-down,zoom,unzoom,close}.svg`, `mods/files/file.svg`, `mods/changes/changes.svg`, and `mods/tabs/{win-min,win-max,win-restore,win-close}.svg`; the package does not copy these assets. The optional custom bar uses the native `window()`, `layout()`, `spaces()`, and `run()` APIs; it does not depend on another Herdr Term package. The installed `tabs` source supplies the combined-mode behavior and platform-control precedent. This package does not vendor that module. The clock format follows the personal `mods/tmux-status` reference from TASK-0018 preflight; no personal layout geometry or theme is copied.

The mod itself runs no background processes, scans no Git or project files, polls no remote machines, adds no observers, installs no shortcuts, and writes no persistent settings or keymaps. User-selected native creation, close, and panel commands keep their normal Herdr effects; the installed combined `tabs` module retains its own panel persistence. Layout snippets are optional partial fragments, not an activation mechanism.

## Add it to Herdr

For a published package, use its versioned archive and matching checksum. If no suitable release exists, stop and ask a contributor to prepare a local build; do not invent a download or compile on the user's machine. No Node.js, npm, Git, or repository checkout is needed at runtime.

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

Read `layout-snippets.json` and review conflicts before merging. Before reusing a bar or pane header, back up its original content, props and header fields so removal can restore them. Choose only the composition that fits the existing bar. Keep native `workspace-status`, pane content, parent axes, sizes, and other layout fields unchanged. The snippets do not select a layout, change keys, or activate the package.

## Update or remove

Run the bundled preflight in `--update` mode before replacing only the marked `mods/muxcle-workspace-chrome` folder. For removal, delete only nodes added for this package. If a fragment reused an existing bar or header, restore its backed-up content, props and header fields instead of deleting that node; preserve its ID, parent, axis, size and unrelated fields. Keep the native `workspace-status` block and installed native modules. Run preflight with `--remove`, then move only the marked mod folder to a backup. The custom panel mode writes no persistent state; native command effects and the installed `tabs` module retain Herdr's normal behavior.

## Limits and verification

Pure and adapter tests cover role/mode selection, tab management, named labels, fresh-ID reorder resolution, stale and cancelled actions, configured panel ancestry/visibility, window-control omission, local clock formatting, pane-specific branches, and close guards. Tests do not run Herdr's layout engine or prove real render, keyboard, or navigation behavior. A private `herdr-app check` verifies isolated initial load only; it does not exercise live UI, Core, navigation, or deployment.

**Provenance:** Pane header behavior follows Herdr 0.1.13 native `mods/pane/main.js` (source subtree `adf94cb2c9b6f1cadbb31c51f84114b1aa332f0a`). The native combined `tabs` source is reused rather than copied. Per-pane branch data comes from native `panes()` metadata. The native `workspace-status` block remains installed and unchanged. No upstream or personal UI module is vendored wholesale.
