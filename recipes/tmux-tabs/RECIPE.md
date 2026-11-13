# Tabs and panel controls

The original native tabs clone without window-control buttons, optionally split into separate tab and panel bars.

Preview pending: this is a draft entry, not a gallery-ready submission. Add an approved screenshot as preview.png; do not substitute diagnostic or unrelated UI footage.

## What you see

The tab strip uses compact rounded tabs with program icons, active/zoom indication and close controls. Panel mode shows + and Files/Changes controls. No minimize/maximize/window-close buttons are included.

## How it behaves

Select, rename, reorder or close tabs through native commands; scrolling selects adjacent tabs. Working shows a spinner, blocked/done use colored dots, idle has no activity marker. Panel visibility is remembered per space. mode: "tabs" shows only tabs, mode: "panels" shows controls, and no mode combines them.

## Built from

Use mods/tmux-tabs/main.js and mod.json. Mount one combined block or the two explicit modes. It expects layout node IDs panel and panel-body for Files/Changes, and sidebar for traffic-light spacing. Installed native workspace-chrome, pane, files, changes, new-menu and menu provide assets/actions.

## Watch out

Layout IDs and installed native assets are real dependencies, not optional implementation details. Panel visibility writes per-copy local storage. Rename/reorder/close and + change app state. This clone targets Herdr 0.1.13 structure and requires comparison when upstream changes. Do not replace a person's existing tabs/layout without review.

Copy only the supplied mod folder into the app's mods/ after reading the files and reviewing name conflicts; do not overwrite a shipped or personal mod. Merge any chosen bindings instead of replacing keys.json. Mount only the blocks described above. To update, review the changed files and keep runtime state outside the source; to remove, first remove its bindings/blocks, then the copied mod folder.

## Done when

Check native loading, combined and split modes, selection, status rendering and per-space panel restoration. Verify reorder/rename/close with approved disposable tabs; test traffic-light spacing on the target platform.

Run herdr-app check on the installed mod only when native checks are authorized. A passing offline test is not proof of keyboard, rendering, transport or destructive behavior. These checks describe acceptance; they are not claims that a live flow has passed.
