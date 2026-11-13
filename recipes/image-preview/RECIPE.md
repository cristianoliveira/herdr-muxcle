# Image preview

A full-window native viewer for a copied, entered or dropped image path, without sending text to a terminal.

Preview pending: this is a draft entry, not a gallery-ready submission. Add an approved screenshot as preview.png; do not substitute diagnostic or unrelated UI footage.

## What you see

The initial view has a path input, machine controls and errors. A loaded image fits the full window without cropping; controls hide until requested. Its overlay metadata uses a frameless full-window dialog.

## How it behaves

Opening may read the local clipboard through the Python helper. Enter loads a path; a local drop selects a file. E reopens controls, Escape closes, and Alt-m changes machine. The focused space supplies the initial machine. Agent working/blocked/done/idle statuses have no special presentation.

## Built from

Use mods/image-preview/ with model.js and preview.py. Open through mod.open:image-preview; it needs no persistent layout block. Herdr exec invokes Python 3, and remote reads use the existing hc route and remote Python. The helper stages display assets in app-owned runtime data.

## Watch out

Disclose clipboard access and local/remote file reads before opening. Remote operations need hc and remote Python 3; local clipboard tools depend on the operating system. Terminal-rendered images are not detectable automatically. Preserve helper limits and errors; do not infer readiness from an image-path test.

Copy only the supplied mod folder into the app's mods/ after reading the files and reviewing name conflicts; do not overwrite a shipped or personal mod. Merge any chosen bindings instead of replacing keys.json. Mount only the blocks described above. To update, review the changed files and keep runtime state outside the source; to remove, first remove its bindings/blocks, then the copied mod folder.

## Done when

After a native load check, verify an approved local image, an invalid path, fit-without-cropping, controls and close. Clipboard, drop and remote-file checks are separate permissions, not covered by unit tests.

Run herdr-app check on the installed mod only when native checks are authorized. A passing offline test is not proof of keyboard, rendering, transport or destructive behavior. These checks describe acceptance; they are not claims that a live flow has passed.
