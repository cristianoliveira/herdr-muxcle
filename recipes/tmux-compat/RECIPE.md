# Tmux behavior host

The original combined tmux workflow mod: focus history, tab operations, navigation repeat, pane rotation/sizing and terminal helper popups.

Preview pending: this is a draft entry, not a gallery-ready submission. Add an approved screenshot as preview.png; do not substitute diagnostic or unrelated UI footage.

## What you see

The mounted host is a shown 1px block. Its commands open native repeat, tab-position and close-space dialogs or terminal popups. Copy mode opens its isolated snapshot viewer directly, without a separate launcher or second Enter.

## How it behaves

Observe focus to support last-space/last-tab and picker recency. Commands include move-tab-left/right/to, rename-from-folder, repeat, close-spaces, rotate-panes, shrink-height, popup, kill-port, broadcast and copy-mode. Preserve bounded repeat behavior, explicit close-space confirmation and each helper's cleanup. This host has no agent-status badge.

## Built from

Use all runtime files under mods/tmux-compat/ together. Keep one shown layout block with content.mod = "tmux-compat"; commands reach shown copies. JavaScript helpers make plans; Herdr APIs manage native dialogs/terminals; Python helpers handle rotation, sizing, copy capture and broadcast. Python 3 and hc are needed for helper workflows; copy also needs nvim and clipboard support.

## Watch out

This is one original multi-behavior mod, not independently split capability modules. Project popup runs the focused local project's executable .tmp/popup. kill-port expects the personal executable ~/.dotfiles/tmux/scripts/kill-port.sh, which is NOT bundled: omit that binding unless reviewed and supplied. Broadcast can relay input to captured panes; port-process actions and close-space are destructive. Never activate them as automated smoke tests. Copy capture reads terminal content but must not send input to the source.

Copy only the supplied mod folder into the app's mods/ after reading the files and reviewing name conflicts; do not overwrite a shipped or personal mod. Merge any chosen bindings instead of replacing keys.json. Mount only the blocks described above. To update, review the changed files and keep runtime state outside the source; to remove, first remove its bindings/blocks, then the copied mod folder.

## Done when

Run offline behavior tests, then an approved native load check. Use disposable fixtures to verify history, tab movement, repeat and pane operations; separately approve capture, broadcast, project-script execution, process termination and close-space tests. Preserve helper failure feedback and direct copy-mode opening.

Run herdr-app check on the installed mod only when native checks are authorized. A passing offline test is not proof of keyboard, rendering, transport or destructive behavior. These checks describe acceptance; they are not claims that a live flow has passed.
