# Funzzy status

A compact native indicator for existing project watchers, with completion notifications. It observes watchers; it never starts or controls them.

Preview pending: this is a draft entry, not a gallery-ready submission. Add an approved screenshot as preview.png; do not substitute diagnostic or unrelated UI footage.

## What you see

A theme-colored bottom-bar label reports the active project's watcher state, generation and failure count. Offline, unsupported and invalid responses remain distinct.

## How it behaves

Poll open local and connected remote project folders every three seconds. Deduplicate completion alerts across repeated observations; initial observations are silent. Clicking a located local watcher focuses its pane. Working/running, passed and failed use theme status colors; this is watcher state, not an agent-status badge.

## Built from

Use mods/funzzy-status/ intact. Mount a visible layout block with content.mod = "funzzy-status"; a bottom-bar width of 160px matches the supplied tmux layout. Herdr exec runs a control-capable fzz and may use hc for metadata and existing remote transport. Props binary and remoteBinary select executables.

## Watch out

Requires an already running watcher and socket-configured .watch.yaml/.watch.yml in each monitored project. The supplied layout's local binary is ~/.cargo/bin/fzz; review it. Remote fzz must exist on the remote non-interactive PATH. Mounting starts polling open projects, including connected remote contexts, and can rename an unnamed matching watcher tab. This does not prove edits passed or an application is healthy.

Copy only the supplied mod folder into the app's mods/ after reading the files and reviewing name conflicts; do not overwrite a shipped or personal mod. Merge any chosen bindings instead of replacing keys.json. Mount only the blocks described above. To update, review the changed files and keep runtime state outside the source; to remove, first remove its bindings/blocks, then the copied mod folder.

## Done when

With approved local fixtures, verify running, passed, failed, offline and unsupported states. Check one notification for a new completion, silence for first/repeated observations, and no watcher lifecycle command. Remote checks require separate consent.

Run herdr-app check on the installed mod only when native checks are authorized. A passing offline test is not proof of keyboard, rendering, transport or destructive behavior. These checks describe acceptance; they are not claims that a live flow has passed.
