# Tmux-style workspace

An optional composition of the original JavaScript mods, Solarized Dark palette and tmux-inspired chords. This is one selectable layout, not a mandatory replacement for a person's Herdr setup.

Preview pending: this is a draft composition, not a gallery-ready submission. Add an approved full-window screenshot as preview.png. Existing screenshots of the older adapted implementations do not verify this setup.

## What you see

The root is a row: a 32px sidebar rail and the main work column. The rail contains native workspace chrome, numbered spaces and numbered agents. The main area contains the active terminal tab, a normally hidden 368px Files/Changes panel and a 26px bottom bar. Each pane has a 26px footer showing its own folder and branch.

The bottom bar orders computer/agent status (180px), tabs, Funzzy status (160px), add/panel controls (144px) and local time/date (150px). Theme colors come from solarized-dark: background #002b36, foreground #839496 and selection #073642. The original configuration selects Monaco at size 12, terminal opacity 0.85 and padding 4px. It removes the normal titlebar and moves macOS traffic lights offscreen; review those choices for the target platform.

## How it behaves

Ctrl-a is a chord prefix, not tmux's repeat table. Double Ctrl-a passes a literal prefix. The selected bindings support tab/split/focus/zoom, project and existing-space pickers, last-space/tab, tab movement, pane rotation/sizing, bounded repeat, copy mode and optional helper popups. Copy opens the snapshot viewer directly, with no second Enter.

Working, blocked, done and idle retain native theme/status semantics. Numbered rails add working pulses; tab and pane indicators retain their original spinner/dot/Needs you presentation. Intray observes agent transitions and keeps a searchable unread inbox. Funzzy observes existing watchers and reports completions, not agent or service health. Files/Changes panel visibility is remembered per space.

## Built from

Use layouts/tmux.json, themes/solarized-dark.json and the selected bindings from keys.json. The entry supplies these original mod directories:

- number-spaces and number-agents: sidebar clones.
- pane-footer, tmux-status and tmux-tabs: pane/bottom-bar presentation.
- funzzy-status: mounted watcher feedback.
- intray: shown 1px observer plus on-demand inbox.
- tmux-compat: shown 1px combined behavior host.
- project-picker, tmux-picker, image-preview and port-forward: on-demand popups.

Reuse the installed native workspace-chrome, files, changes, pane, menu, new-menu and confirmation infrastructure. Native assets are dependencies, not copied upstream implementations. Keep original IDs and layout node IDs; panel controls expect panel/panel-body and use sidebar for spacing. Python 3 and hc support the helper workflows; nvim supports copy mode, fzz supports watcher status, OpenSSH supports forwarding, and Git supplies sidebar repository metadata.

## Watch out

Read every file first. This is the original personal configuration: the full keys.json is a reference for reviewed merging, not permission to overwrite someone's keymap. Mounting starts the observers and polling; opening project-picker automatically scans ~/work and ~/other on local and connected non-temporary machines. Disclose filesystem reads, program execution, network access and remote queries before activation.

The tmux-compat mod contains multiple behaviors; installing it is not the same as splitting or enabling each as an independent module. Project popup executes a project's .tmp/popup. The port-process picker expects ~/.dotfiles/tmux/scripts/kill-port.sh, which is not supplied; omit its shortcut unless that dependency is reviewed and provided. Broadcast relays terminal input; close-space, tab/pane close and process actions can be destructive. Do not activate those paths in an unattended test gate. Port-forward tunnels can outlive their popup. Native version assumptions originate in Herdr 0.1.13 and need checking against the recipient's installed APIs.

Copy the mod folders and optional layout/theme only after reviewing conflicts. If a name is taken, review every internal ID/asset path before renaming; never overwrite a shipped or personal module silently. Keep the person's original layout available and switch only after approval. Runtime settings, terminal sessions, data/, shared state and caches stay outside the source/release files. An alternate app home does not isolate Core terminals.

To update, review changes and preserve runtime state. To remove, switch back to the original layout, remove only this composition's bindings/blocks/files and stop any owned tunnels explicitly if desired; do not erase unrelated data or watcher jobs.

## Done when

Offline checks pass, and an authorized native load check passes for every selected mod. After explicit permission, verify full-window layout spacing, narrow/expanded rails, native working/blocked/done/idle states, tab/panel behavior and restoration to the original layout. Verify direct copy-mode opening and cleanup only with approved terminal content. Remote discovery, clipboard, forwarding, script execution, broadcast and destructive operations each need separately approved disposable fixtures.

These are acceptance checks, not claims of completed live verification. Do not publish this entry as gallery-ready until it includes a genuine current preview and its native checks have passed.
