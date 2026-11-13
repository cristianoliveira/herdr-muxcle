# Project picker

A native fuzzy picker for immediate project directories on this computer and connected Herdr machines.

Preview pending: this is a draft entry, not a gallery-ready submission. Add an approved screenshot as preview.png; do not substitute diagnostic or unrelated UI footage.

## What you see

A 640px-wide, 440px-high popup has search, machine-labelled project rows, loading progress and partial-scan warnings. Cached results remain available during refresh.

## How it behaves

Scan immediate non-hidden directories and directory symlinks under ~/work and ~/other, including connected non-temporary machines. Query matches machine and project. Arrows/Ctrl-j/k select, Enter opens or reuses the matching machine-scoped space, and Escape cancels. Working/blocked/done/idle are not custom project-row status categories.

## Built from

Use mods/project-picker/ with projects.py, model.js and discovery.js. Open mod.open:project-picker without a mounted host. The Python 3 helper uses hc for machine discovery and remote scans; remote machines need Python 3. Herdr shared state keeps the project cache.

## Watch out

Opening automatically lists connected machines and reads project directories; it is not local-only or a new opt-in discovery design. Roots/depth are original behavior, not configurable recursive search. Missing roots are skipped; inaccessible scans must leave other results visible. The helper runs programs and reads outside its mod folder.

Copy only the supplied mod folder into the app's mods/ after reading the files and reviewing name conflicts; do not overwrite a shipped or personal mod. Merge any chosen bindings instead of replacing keys.json. Mount only the blocks described above. To update, review the changed files and keep runtime state outside the source; to remove, first remove its bindings/blocks, then the copied mod folder.

## Done when

Check local results, hidden-entry exclusion, query/keyboard behavior and same-machine space reuse with approved fixtures. Verify remote scans/partial failure only after permission; offline tests do not prove transport availability.

Run herdr-app check on the installed mod only when native checks are authorized. A passing offline test is not proof of keyboard, rendering, transport or destructive behavior. These checks describe acceptance; they are not claims that a live flow has passed.
