# Herdr dotfiles adoption ledger

Status: **in progress**. This is a finite extraction inventory, not a claim that all rows ship today.

## Source and boundaries

Inspected source: `nix/shared/herdr/` in the dotfiles repository, Herdr tree `6cc670a192143f5effbd8d0747eaa0f44182ed19`. Repository HEAD was `752268c0`; the last Herdr-subtree changes were already present at `0944335e`. Recheck the tree before extracting further changes. The listening-port helper also depends on the separate `tmux/scripts/kill-port.sh` source and needs its own provenance check.

Muxcle's baseline already contains useful differences: bounded explicit-root local discovery, generalized sizing, native-order existing-target selection, and one version-checked update for multi-pane rotation. Preserve these instead of replacing them blindly.

The pinned subtree contains 92 tracked files: 54 mod-directory source/asset/metadata/reference files, 34 tests, and four top-level configuration/reference files. The 21 `tmux-compat` files are all assigned below; no unmatched compatibility file remained at inventory time.

Each row must end as **shipped**, **native**, **safety-adapted**, **personal-excluded**, or **blocked with evidence**. Planned/in-progress rows are not delivered. Task IDs refer to the `plans` branch. No live installation, layout switch, terminal/process action or publication follows from this ledger.

## Behavior map

| Source behavior | Destination / task | Current outcome and verification boundary |
| --- | --- | --- |
| Native new tab, split, focus, zoom, numbered tab selection, manual rename, literal Ctrl-a | `muxcle-tmux-keys` | Shipped baseline; direct native commands, no runtime mod. Preserve n=previous/p=next. |
| Native help/palette and optional numbered-space shortcuts | TASK-0020 | Planned; optional native snippets, platform/conflict review, no full personal key-map import. |
| Last-two spaces and per-space tabs | `muxcle-history` | Shipped baseline; unchanged by MRU work. Requires explicit observer. |
| Full recent-tab order across spaces | TASK-0003, `muxcle-history` / `muxcle-picker` | Shipped in `1e614de`; separate bounded/versioned 256-target state and explicit picker opt-in. Visible layout configuration is not an observer-health proof. |
| Move tab left/right, move to zero-based position, rename from terminal cwd | TASK-0002, `muxcle-tab-tools` | Shipped in `d487932`; original target pinned, current bounds checked, native one-based dispatch, qualified IDs. Manual rename remains. |
| Existing-space/tab fuzzy picker | `muxcle-picker` | Shipped baseline; default native order and existing-target-only actions. |
| Machine/local alias and associated agent program/app search | TASK-0004, `muxcle-picker` | Shipped in `5ac5611`; machine-first fuzzy terms, exact space/tab association, fresh action validation and sticky stale-selection invalidation. |
| Picker new-tab/new-local/remote-space actions, selected-tab close and agent/team context | TASK-0022 | Planned opt-in extension; preserve existing-only default, explicit destructive confirmation, bounded metadata association. |
| Immediate-child project discovery and same-folder reuse | `muxcle-sessionizer` | Shipped baseline; explicit local roots and bounds. No personal roots imported. |
| Connected remote project discovery, per-machine cache, progressive/stale results | TASK-0008 | Planned explicit opt-in; machine-scoped identity and failure isolation. |
| Ordinary terminal rotation and slot geometry | `muxcle-rotation` | Shipped baseline: native pairs, CAS multi-pane fallback, no retry after uncertainty. |
| Native 3–16-pane rotation optimization | TASK-0001 → TASK-0010 | Blocked: supported native run queues individual unacknowledged swaps, not one transaction. Retain safe CAS rather than copy the optimization blindly. |
| Complex/mixed mod-pane rotation, mixed-pane strip preservation and native-pair opt-out | TASK-0023 | Assessment planned; CAS extension is independent of the native multi-swap blocker. Broaden only with proof of pane/mod identity, properties and resource/lifecycle preservation. Current strip accepts ordinary terminals only. |
| Recursive equalization and proportional width/height sizing | `muxcle-sizing` | Shipped Muxcle capability broader than the source; preserve. |
| Fixed 4% vertical terminal strip | TASK-0005, `muxcle-sizing.strip-height` | Shipped in `b227bf3`; distinct additive operation, not a redefinition of generic shrink-height. Actual zoomed-pane identity is rechecked before requesting unzoom. |
| Explicit 1.5-second navigation repeat popup | TASK-0006, `muxcle-repeat` | Shipped in `1259170`; native `mod.open:muxcle-repeat`, no host/layout dependency, fixed allowlist and generation-guarded timers. Unsupported keys exit and are consumed; interactive focus remains unverified. |
| Reviewed multi-space close | TASK-0012 | Planned independent destructive workflow; fixed reviewed IDs and revalidation, honest partial-completion semantics. |
| Trusted project-local terminal popup | TASK-0007 | Planned; literal argv, explicit execution, local scope and owned cleanup. |
| Listening TCP process picker / kill-port | TASK-0019 | Planned safety adaptation: portable trusted helper, reviewed identity, graceful default, explicit force. No personal script path or immediate SIGKILL default. |
| Frozen keyboard copy-mode snapshot | TASK-0013 | Planned; bounded capture/fallback/clipboard, isolated local Neovim, private temporary files and cleanup limits. Not native in-pane selection. |
| Broadcast input relay | TASK-0014 | Planned explicit prototype: 2–8 captured local panes, bounded session-bound stream, no retry/rollback or transparent-sync claim. |
| Agent unread attention inbox, filters, jump/dismiss, reviewed dismiss-all | TASK-0015 | Planned separate inspired tool, not a compatibility prerequisite. Bounded metadata/events and explicit observer. |
| Local/remote existing Funzzy watcher status, location and notifications | TASK-0016 | Planned separate feedback tool. Never start/trigger/cancel jobs; no personal binary path; status is not edit-specific CI proof. |
| Numbered compact Spaces/Agents status navigation | TASK-0017 | Planned optional presentation; reuse installed native expanded controls rather than wholesale upstream clones. |
| Per-pane program/cwd/branch/status footer and pane controls | TASK-0018 | Planned optional chrome; pane-specific native metadata and exact-ID actions. |
| Tabs-only/panels-only/combined bottom controls without window buttons | TASK-0018 | Planned optional chrome, preserving native tab/panel capabilities. No mandatory replacement layout. |
| Machine/agent counts and local clock/date | TASK-0018 | Planned optional chrome with injected-time tests and native theme colors. |
| Compiled-output links and contributor watch/hot-reload loop | TASK-0011 | Planned isolated developer workflow. Published packages remain standalone; symlink reload behavior must be measured, not assumed. |
| Complete derived pack and verified local release artifacts | TASK-0009 | Pending shipped slices and final ledger; publication remains a separate action. |

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
| `mods/pane-footer/{close,split-down,split-right,unzoom,zoom}.svg` | Prefer installed native assets; if copied, record need/license/provenance and allowlist exactly. TASK-0018. |
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

## Completion evidence

Every shipped or safety-adapted row needs its actual command/package, recipe/activation, targeted tests, fresh applicable watcher result and scoped commit. Initial-load, pure-model coverage and real interactive behavior are distinct claims. Keep blocked rows explicit; never turn a limitation into an implementation or publication claim.
