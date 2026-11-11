# Herdr dotfiles adoption ledger

Status: **source accounting complete; release verification pending**. Every reusable source behavior has an owner or an explicit boundary. Blocked features below are not shipped. TASK-0009 still owns combined-package and local-artifact readiness; this ledger does not establish publication or native interaction.

## Source and boundaries

Rechecked source: `nix/shared/herdr/` at dotfiles HEAD `c8a3177993943b4974148fad7ac7f0d6e83d2c24`, unchanged tree `6cc670a192143f5effbd8d0747eaa0f44182ed19`. The separate listening-port source `tmux/scripts/kill-port.sh` is blob `06a2ede4c7a5c09526282d0e5283bbc01cab7309` (last changed in `34037e76a9cca48d30c3d324ebf0183b01f94676`). Both source paths were clean. Recheck these identities before extracting later changes.

Muxcle's baseline already contains useful differences: bounded explicit-root local discovery, generalized sizing, native-order existing-target selection, and one version-checked update for multi-pane rotation. Preserve these instead of replacing them blindly.

The pinned subtree contains 92 tracked files: 54 mod-directory source/asset/metadata/reference files, 34 tests, and four top-level configuration/reference files. The 21 `tmux-compat` files are all assigned below; no unmatched compatibility file remained at inventory time.

Outcomes are **shipped**, **native**, **safety-adapted**, **personal-excluded**, or **blocked with evidence**. Shipped means reviewed source is committed, not that its archive is published or its live interaction was tested. Runtime recipes target Herdr 0.1.13 and define independent activation, dependencies, access and removal. Task IDs refer to the separate `plans` branch. No installation, layout switch, terminal/process action or publication follows from this ledger.

## Behavior map

| Source behavior | Destination / task | Current outcome and verification boundary |
| --- | --- | --- |
| Native new tab, split, focus, zoom, numbered tab selection, manual rename, literal Ctrl-a | `muxcle-tmux-keys` | Shipped baseline; direct native commands, no runtime mod. Preserve n=previous/p=next. |
| Native help/palette and optional numbered-space shortcuts | TASK-0020, `muxcle-tmux-keys` | Shipped: Ctrl-a ? / : use native help/palette; space-number option remains recipe-only with Linux/macOS caveats. Merge checks include mod-specific precedence; no personal full-map import. |
| Last-two spaces and per-space tabs | `muxcle-history` | Shipped baseline; unchanged by MRU work. Requires explicit observer. |
| Full recent-tab order across spaces | TASK-0003, `muxcle-history` / `muxcle-picker` | Shipped in `1e614de`; separate bounded/versioned 256-target state and explicit picker opt-in. Visible layout configuration is not an observer-health proof. |
| Move tab left/right, move to zero-based position, rename from terminal cwd | TASK-0002, `muxcle-tab-tools` | Shipped in `d487932`; original target pinned, current bounds checked, native one-based dispatch, qualified IDs. Manual rename remains. |
| Existing-space/tab fuzzy picker | `muxcle-picker` | Shipped baseline; default native order and existing-target-only actions. |
| Machine/local alias and associated agent program/app search | TASK-0004, `muxcle-picker` | Shipped in `5ac5611`; machine-first fuzzy terms, exact space/tab association, fresh action validation and sticky stale-selection invalidation. |
| Picker new-tab/new-local/remote-space actions, selected-tab close and agent/team context | TASK-0022, `muxcle-picker` | Shipped in `77eacdc` / `433b95a` as separate default-off settings; bounded root-excluding live descendant-terminal counts are not team-size or ownership proof. Preserves existing-only default, pins remote actions to the captured native machine ID/name and connected non-temporary document peers, binds close confirmation to one immutable review, bounds review metadata, and keeps agent context independent. Herdr 0.1.13 native last-tab close also removes its parent space and may request native confirmation; the picker does not bypass it. |
| Immediate-child project discovery and same-folder reuse | `muxcle-sessionizer` | Shipped baseline; explicit local roots and bounds. No personal roots imported. |
| Connected remote project discovery, per-machine cache, progressive/stale results | TASK-0008, `muxcle-sessionizer` | Shipped in `9cefeee`: explicit remote roots, permanent peer identity, bounded per-machine cache and progressive/stale results. Failures stay machine-scoped; no auto-connect or local fallback. Remote discovery remains off by default. |
| Ordinary terminal rotation and slot geometry | `muxcle-rotation` | Shipped baseline: native pairs, CAS multi-pane fallback, no retry after uncertainty. |
| Native 3–16-pane rotation optimization | TASK-0001 → TASK-0010 | Blocked: supported native run queues individual unacknowledged swaps, not one transaction. Retain safe CAS rather than copy the optimization blindly. |
| Complex/mixed mod-pane rotation and mixed-pane strip preservation | TASK-0023 | **Blocked with evidence.** Keep Muxcle rotation and strip terminal-only. Pinned native application source shows same-slot `{pane ID, mod name, props}` retains its owned copy and derives pane headers from pane ID, but the existing isolated `window::tests` harness has no full-leaf movement/resource/header test or incoming non-focusable-mod focus/input test; it also lacks a mixed-strip lifecycle case. Reconsider only after an authorized test-only extension to that existing harness (no new framework or live-app probe). The one-CAS fallback is not the native 3+ swap blocker. |
| Terminal-only opt-out from native pair rotation | TASK-0023, `muxcle-rotation` | Shipped in `3e25f3e`; not published. Explicit `native_rotation: false` (`native_pair_rotation` alias) routes exactly two eligible terminal panes through one exact-version CAS write. Omitted, true, and malformed values preserve native-pair behavior; 3+ panes remain on CAS. Requires Python 3, `hc`, and versioned `doc.get` / `doc.set` support for the opt-out. Mixed-mod rotation and mixed-strip remain independently blocked; this does not weaken their terminal-only guards. |
| Recursive equalization and proportional width/height sizing | `muxcle-sizing` | Shipped Muxcle capability broader than the source; preserve. |
| Fixed 4% vertical terminal strip | TASK-0005, `muxcle-sizing.strip-height` | Shipped in `b227bf3`; distinct additive operation, not a redefinition of generic shrink-height. Actual zoomed-pane identity is rechecked before requesting unzoom. |
| Explicit 1.5-second navigation repeat popup | TASK-0006, `muxcle-repeat` | Shipped in `1259170`; native `mod.open:muxcle-repeat`, no host/layout dependency, fixed allowlist and generation-guarded timers. Unsupported keys exit and are consumed; interactive focus remains unverified. |
| Reviewed multi-space close | TASK-0012, `muxcle-space-closer` | Safety-adapted in `c313736`: starts unselected; freezes reviewed IDs, peer identity, names/folders and tab/pane scope; revalidates before each native request. Arrivals stay outside review. Cancel/plain Enter do not confirm; partial/queued effects are not completion acknowledgements. |
| Trusted project-local terminal popup | TASK-0007 | Safety-adapted: explicit local execution uses literal argv; dismissal leaves the terminal running because Herdr 0.1.13 has no atomic ownership-guarded stop API. Manual inspection/stop is required; no live interactive validation. |
| Listening TCP process picker / kill-port | TASK-0019, `muxcle-port-process-picker` | Safety-adapted in `43c42c2`: bundled local helper, listener search/multiselect, frozen process review and final UID/PID/start identity check after port checks. TERM is default; KILL needs separate explicit review. No personal helper path, sudo or remote fallback. Residual OS PID check/use race remains. |
| Frozen keyboard copy-mode snapshot | TASK-0013, `muxcle-copy-mode` | Safety-adapted in `a7110f7`: capture the actually displayed qualified terminal, bounded history/screen fallback, private local snapshot and isolated Neovim. Explicit bounded OSC 52 yank only; no source input or automatic clipboard integration. Normal cleanup cannot guarantee removal after a crash. Not native in-pane selection or an editor sandbox. |
| Broadcast input relay | TASK-0014, `muxcle-broadcast-prototype` | Safety-adapted prototype in `eadce29`: 2–8 captured local ordinary panes, session/Core-PID-bound stream and private readiness marker; raw/noecho and rendered scope/ON precede input. Bounded frames/expiry, no retry or rollback. No transparent tmux-sync, remote or universal nonfocused replacement-mapping promise. |
| Agent unread attention inbox, filters, jump/dismiss, reviewed dismiss-all | TASK-0015, `muxcle-agent-intray` | Shipped inspired tool in `2f50a1a`, independent of compatibility. Own bounded seen/unread metadata, transition deduplication, filters and reviewed dismiss-all. Optional mounted observer captures while closed. Queued jump closes only its popup and does not mark an event read; navigation is not acknowledged. |
| Local/remote existing Funzzy watcher status, location and notifications | TASK-0016, `muxcle-funzzy-status` | Shipped inspired feedback tool in `bd87102`: observes existing watchers only; never starts, triggers, retries or cancels jobs. Explicit remote opt-in, bounded polling/concurrency, location hints rather than ownership, canonical persisted cursors and contextual deduplicated notifications. Unsupported CLI is not offline. Source automatic unnamed-tab renaming is deliberately omitted to preserve user state; native manual rename remains available. Requires installed `fzz`; no personal binary path. Status is not edit-specific CI proof. |
| Numbered compact Spaces/Agents status navigation | TASK-0017, `muxcle-numbered-sidebars` | Shipped optional presentation in `910facb`: minimal status-colored/animated rails compose with installed native expanded controls; bounded scrolling and nonshrinking rows. Snapshot numbering follows native metadata, not a shortcut-order guarantee. No competing order publisher, settings rewrite or personal palette. |
| Per-pane program/cwd/branch/status footer and pane controls | TASK-0018, `muxcle-workspace-chrome` | Shipped optional footer in `b15343b`: pane-specific native program/folder/status/branch and focus/split/zoom/close controls. Fresh exact-ID mapping, no space-branch fallback or claim that frame props identify a shown replacement terminal. Installed native assets; no personal theme/layout. |
| Tabs-only/panels-only/combined bottom controls without window buttons | TASK-0018, `muxcle-workspace-chrome` | Shipped in `2f16e6f`: reuse installed native combined controls where suitable; explicit optional modes add only missing composition. Fresh tab/space IDs, canceled/stale drag refusal, configured panel-child ancestry and owned-popup chaining. Native window buttons stay default unless explicitly omitted. No second panel restorer or mandatory layout. |
| Machine/agent counts and local clock/date | TASK-0018, `muxcle-workspace-chrome` | Native installed `workspace-status` owns its machine/agent presentation. Shipped clock-only addition in `b15343b` / `2f16e6f` uses local time, injected-time tests and theme colors; column and row fragments are distinct. No process/network polling or new hidden observer. Counts do not prove permanent identity or live connectivity. |
| Compiled-output links and contributor watch/hot-reload loop | TASK-0011 | **Blocked verification, partial contributor tooling only.** `42cbf37` / `2ce31a0` build selected complete generations, snapshot sources before build and refuse publication after cancellation; `ec6e545` records limits. Whole-mod-directory links passed initial load/reinit; changed-helper, asset-refresh and manual-fallback evidence is incomplete. A leaf symlink outside a real module directory fails native containment. TASK-0011 stays open; no full hot-reload promise or further live probe. See [development limits](../DEVELOPMENT.md). |
| Complete derived pack and verified local release artifacts | TASK-0009 | Final composition/artifact verification pending after this ledger; derived component ownership defines a curated pack. Broadcast prototype and Port/process picker are separate packages, deliberately excluded from that pack. Local archives, tags, publication and gallery availability are separate claims; no release is implied here. |

## Runtime file inventory

Paths below are relative to `nix/shared/herdr/`. Metadata belongs with its capability; a source `mod.json` is not blindly reused when activation/ownership changes.

| Source files | Owner / disposition |
| --- | --- |
| `mods/tmux-compat/main.js`, `mod.json` | Router/host integration split by cohesive capability; no mandatory personal compat singleton. |
| `mods/tmux-compat/history.js` | History toggles/MRU: existing History package, TASK-0003. |
| `mods/tmux-compat/move-tab.js`, `move-tab-view.js`, `rename.js` | Tab tools: TASK-0002. |
| `mods/tmux-compat/rotate.js`, `rotate.py` | Rotation/sizing decisions: existing package; TASK-0001/0005/0010/0023 boundaries explicit. |
| `mods/tmux-compat/pane-size.js` | Fixed strip adapter: TASK-0005. |
| `mods/tmux-compat/repeat.js`, `repeat-view.js` | Repeat: TASK-0006. |
| `mods/tmux-compat/close-spaces.js`, `close-spaces-view.js` | Reviewed close: TASK-0012. |
| `mods/tmux-compat/popup.js`, `popup-header.js` | Popup lifecycle/presentation: TASK-0007 and proven principles for dependent helpers. |
| `mods/tmux-compat/copy.js`, `copy_mode.py`, `copy-mode.lua` | Snapshot copy: TASK-0013; declare runtime prerequisites and data retention. |
| `mods/tmux-compat/broadcast.js`, `broadcast.py`, `broadcast_stream.py` | Prototype relay: TASK-0014; preserve limits rather than claiming transparent synchronization. |
| `mods/project-picker/main.js`, `model.js`, `discovery.js`, `projects.py`, `mod.json` | Sessionizer baseline plus TASK-0008; no personal roots. |
| `mods/tmux-picker/main.js`, `recency.js`, `mod.json` | Existing Picker plus TASK-0003/0004/0022. Reuse behavior, not the whole upstream clone. |
| `mods/intray/main.js`, `model.js`, `mod.json` | Independent inspired-tool package: TASK-0015. |
| `mods/funzzy-status/main.js`, `model.js`, `projects.js`, `location.js`, `mod.json` | Independent feedback package: TASK-0016. |
| `mods/number-agents/main.js`, `mod.json` | Numbered presentation: TASK-0017. |
| `mods/number-spaces/main.js`, `mod.json` | Numbered presentation: TASK-0017. |
| `mods/pane-footer/main.js`, `mod.json` | Optional chrome: TASK-0018. |
| `mods/pane-footer/{close,split-down,split-right,unzoom,zoom}.svg` | Native: installed Herdr assets supply the controls. No personal asset copy or additional theme dependency; TASK-0018 recipe declares native dependencies. |
| `mods/tmux-tabs/main.js`, `mod.json` | Optional chrome: TASK-0018; preserve controls without wholesale upstream ownership. |
| `mods/tmux-status/main.js`, `clock.js`, `mod.json` | Optional chrome: TASK-0018. |
| `keys.json` | Map reusable actions to optional component snippets; TASK-0020. Personal OS bindings are not automatic additions. |
| `layouts/tmux.json` | Optional component/pack composition, not a whole-file personal replacement; TASK-0009/0017/0018. |
| `themes/solarized-dark.json` | Personal-excluded. Use the user's theme/native colors; no theme prerequisite. |

## Development/reference files

- Root/source mod READMEs are behavioral evidence, not installation scripts to transplant. Adapt relevant instructions into each self-contained recipe.
- `tests/*.mjs`, `tests/test_*.py` and `mods/funzzy-status/*.test.mjs`: port relevant deterministic behavior cases beside their owners; source test presence is not proof of a passing Muxcle test or native interaction.
- `tests/test_install.py` covers personal Stow/Nix deployment policy; do not port that policy into runtime packages. TASK-0011 documents an optional user-owned linked development flow instead.
- Generated `*.d.ts`, `jsconfig.json`, `__pycache__`, compiled caches, mutable app state and developer tooling are not runtime payloads. The narrow supported API projection must be checked against actual generated declarations before claiming an API is absent.
- Personal paths, themes, automatic installer conflict replacement and unrelated settings remain excluded. End users receive compiled archives and checksums; no dotfiles/repository clone is required.

## Delivery and verification evidence

The source commits above are traceable in Git; corresponding board transitions were verified in the separate plans worktree. TASK-0023 closes an assessment and the independent terminal-only preference, not the blocked mixed-mod features. TASK-0001/0010 and TASK-0011 remain open. TASK-0009 still verifies the final composed payload and candidate artifacts.

| Capability | Activation, dependencies and removal | Deterministic behavior evidence |
| --- | --- | --- |
| Keys/help | [Tmux keys recipe](../packages/tmux-keys/RECIPE.md); optional conflict-reviewed merges, no mod/host | Key conflict/merge and archive tests in `scripts/package.test.mjs`; TASK-0020 |
| Rotation/sizing | [Rotation](../packages/rotation/RECIPE.md), [Sizing](../packages/sizing/RECIPE.md); one shown host each; document paths need Python/`hc` | `mods/muxcle-rotation/*test*`, `mods/muxcle-sizing/*test*`; ordinary terminal scope, CAS/uncertainty, geometry, opt-out and refusal fixtures |
| Tab tools/history | [Tab tools](../packages/tab-tools/RECIPE.md), [History](../packages/history/RECIPE.md); shown host/observer, no observer-health inference | Owner model/controller tests; pinned target, native indices, bounded visits and MRU |
| Picker | [Picker](../packages/picker/RECIPE.md); standalone popup; separate order/context/management opt-ins; remote management needs both `management: true` and `remoteSpaces: true`, plus `hc` identity | `mods/muxcle-picker/{model,view}.test.mjs`; 47 cases at TASK-0022 delivery, including stale review and peer rebound |
| Sessionizer | [Sessionizer](../packages/sessionizer/RECIPE.md); explicit local/remote roots, Python; remote transport and cache limits | Owner discovery/model/controller tests plus `test_discover.py`; exact identity, stale results, cancellation and machine isolation |
| Repeat/project popup | [Repeat](../packages/repeat/RECIPE.md), [Project popup](../packages/project-popup/RECIPE.md); standalone popups, explicit execution only for project popup | Owner models/controllers; timer generation, allowlist, trusted argv, ownership/uncertainty and cancellation fixtures |
| Space/process close | [Space closer](../packages/space-closer/RECIPE.md), [Port/process picker](../packages/port-process-picker/RECIPE.md); explicit review; native/OS/tool limits | Owner adapter/controller/model and fake process tests; identity/scope changes, cancel, partial/uncertain effects |
| Snapshot/broadcast | [Copy mode](../packages/copy-mode/RECIPE.md), [Broadcast prototype](../packages/broadcast-prototype/RECIPE.md); required helpers/tools, separate consent | Owner Node/Python tests; visible surface, bounds, isolated viewer, readiness, raw TTY, expiry and no retry |
| Inspired agent/feedback tools | [Agent inbox](../packages/agent-intray/RECIPE.md), [Funzzy status](../packages/funzzy-status/RECIPE.md); observer/remote/notification choices explicit | Owner transition/cursor/location/controller tests; deduplication, restart silence, unavailable/unsupported, pending/late callbacks |
| Optional presentation | [Numbered sidebars](../packages/numbered-sidebars/RECIPE.md), [Workspace chrome](../packages/workspace-chrome/RECIPE.md); additive/reviewed fragments and installed native controls | Owner model/view tests; native metadata, bounded lists, frozen IDs, canceled drag, panel ancestry, timer/closed guards |

Native inert checks use a private app home **and** unique `HC_SESSION`; they establish initial load only. Model/helper tests and mocked native views do not establish real keyboard, scroll, drag, navigation, remote execution, terminal/process effects or mod lifecycle survival. One early TASK-0017 inert check used a private home without a unique session: no mutation was observed, but zero default-Core reads cannot be proved; later checks were isolated. No retrospective live probe was used.

Reviewed code, measured coverage and fresh applicable watcher gates are evidence for bounded behavior, not substitutes for interaction tests. Current policy pauses E2E pending a suitable headless path. No live installation, source-dotfiles change, upstream change, release tag, publication or gallery availability is claimed.
