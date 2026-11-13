# Agent attention inbox

A native unread inbox for observed agent completions and requests for input, with optional background observation.

Preview pending: this is a draft entry, not a gallery-ready submission. Add an approved screenshot as preview.png; do not substitute diagnostic or unrelated UI footage.

## What you see

A 700px-wide popup contains a title, All/Finished/Needs input tabs, search, virtual event rows and keyboard hints. The original popup is 536px high. A pending dismiss-all confirmation replaces the title controls.

## How it behaves

Record transitions to done or blocked; working and idle are not unread categories. Search/filter, select with arrows or Ctrl-j/k, Enter jumps and marks read, Ctrl-d dismisses one. Ctrl-Shift-d requests dismiss-all; Ctrl-Enter confirms, Escape cancels the confirmation before closing. New arrivals are not swept into an existing confirmation.

## Built from

Use mods/intray/ and open mod.open:intray. To observe while closed, add a shown 1px block with content {"mod":"intray","props":{"mode":"observer"}}. Popup and observer share intray.state through Herdr shared/setShared; navigation uses terminal data and native commands.

## Watch out

Without the observer, events are observed only while a copy renders, so closed periods can be missed. Observation is bounded persisted state, not a complete historical event log. It does not poll external services or run a shell. Do not replace unrelated shared data.

Copy only the supplied mod folder into the app's mods/ after reading the files and reviewing name conflicts; do not overwrite a shipped or personal mod. Merge any chosen bindings instead of replacing keys.json. Mount only the blocks described above. To update, review the changed files and keep runtime state outside the source; to remove, first remove its bindings/blocks, then the copied mod folder.

## Done when

Use approved agent fixtures to verify a completion, a blocked event, no fabricated working/idle event, filtering, unavailable-terminal feedback and reviewed dismissal. Verify observer capture separately from opening the popup.

Run herdr-app check on the installed mod only when native checks are authorized. A passing offline test is not proof of keyboard, rendering, transport or destructive behavior. These checks describe acceptance; they are not claims that a live flow has passed.
