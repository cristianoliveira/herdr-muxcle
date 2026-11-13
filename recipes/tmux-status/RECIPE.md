# Computer status and clock

A native bottom-bar label for the active machine and agent counts, plus an optional clock-only presentation.

Preview pending: this is a draft entry, not a gallery-ready submission. Add an approved screenshot as preview.png; do not substitute diagnostic or unrelated UI footage.

## What you see

The default view is a compact themed computer/agent summary. mode: "clock" shows right-aligned HH:MM ddd DD-Mon-YY; the supplied layout uses 180px for status and 150px for clock.

## How it behaves

The summary follows active space and native agents, counting blocked agents as needing attention. It does not add separate working/done/idle indicators. Clock checks local time each second and redraws when the displayed minute changes.

## Built from

Use mods/tmux-status/ with clock.js. Mount content.mod = "tmux-status" for summary; use a second block with props {"mode":"clock"} for time. It consumes spaces(), agents() and theme(), and uses installed workspace-chrome monitor/server SVGs.

## Watch out

This only presents existing native data. It does not execute shell programs, discover projects or run a watcher. Time/date are local, not the selected remote machine's. Preserve layout placement and don't imply an agent-count label proves agent or service health.

Copy only the supplied mod folder into the app's mods/ after reading the files and reviewing name conflicts; do not overwrite a shipped or personal mod. Merge any chosen bindings instead of replacing keys.json. Mount only the blocks described above. To update, review the changed files and keep runtime state outside the source; to remove, first remove its bindings/blocks, then the copied mod folder.

## Done when

Verify summary reacts to an approved space/agent fixture and blocked count, both presentation modes, local date formatting and minute updates. Native layout and clock appearance remain manual checks.

Run herdr-app check on the installed mod only when native checks are authorized. A passing offline test is not proof of keyboard, rendering, transport or destructive behavior. These checks describe acceptance; they are not claims that a live flow has passed.
