# Pane footer

A compact native footer showing each terminal pane's own program, folder, branch and status.

Preview pending: this is a draft entry, not a gallery-ready submission. Add an approved screenshot as preview.png; do not substitute diagnostic or unrelated UI footage.

## What you see

A 26px-high footer sits below each pane in the supplied layout. It shows a program icon/name, shortened home-relative folder and that pane's branch. Hover exposes split, zoom and close controls.

## How it behaves

Clicking focuses the pane. Working shows a spinner, blocked shows Needs you, done shows a small status dot, and idle has no extra activity marker. Hover controls call native pane.split, pane.zoom and pane.close for that exact pane.

## Built from

Use mods/pane-footer/ including its SVGs. Configure the terminal frame's pane.header with content.mod = "pane-footer", height 26, position "bottom" and reveal "always". Herdr provides pane/terminal props; panes(), theme() and home() supply display data. Reuse installed workspace-chrome branch/spinner assets.

## Watch out

This is a pane frame, not a persistent observer. Branch is pane-specific and may be absent. Close affects the chosen pane; don't click it during unattended checks. Native program icons and workspace-chrome assets must exist. Preserve other frame settings.

Copy only the supplied mod folder into the app's mods/ after reading the files and reviewing name conflicts; do not overwrite a shipped or personal mod. Merge any chosen bindings instead of replacing keys.json. Mount only the blocks described above. To update, review the changed files and keep runtime state outside the source; to remove, first remove its bindings/blocks, then the copied mod folder.

## Done when

Verify two approved panes with different folders/branches, correct focus, working/blocked/done/idle appearance and hover controls. Test close only on an explicitly disposable fixture.

Run herdr-app check on the installed mod only when native checks are authorized. A passing offline test is not proof of keyboard, rendering, transport or destructive behavior. These checks describe acceptance; they are not claims that a live flow has passed.
