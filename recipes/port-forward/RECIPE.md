# Port forwarding

A native popup to inspect remote listeners and explicitly start or stop owned loopback-only SSH tunnels.

Preview pending: this is a draft entry, not a gallery-ready submission. Add an approved screenshot as preview.png; do not substitute diagnostic or unrelated UI footage.

## What you see

A dialog at 70% window width and 85% height shows machine, remote/local port fields, listener rows, owned state and errors. Tunnel state is distinct from application readiness.

## How it behaves

Use a discovered or manually entered remote port. Enter toggles the selected tunnel; a separate local-port field avoids occupied ports. Closing the popup leaves tunnels running. Stop ends only its owned tunnel; opening a browser is explicit. Agent statuses have no special rendering.

## Built from

Use mods/port-forward/ with model.js and forward.py. Open mod.open:port-forward; no mounted observer is required. Python 3, hc and OpenSSH implement machine discovery, remote queries and owned forwarding. App-owned data/port-forward stores tunnel state.

## Watch out

Disclose remote listener queries and SSH execution. Requires verified non-interactive SSH; remote discovery may need lsof or ss. It neither kills port occupants nor proves a remote service is healthy. A recipe update must preserve active owned state. For an agent running remotely, run the helper on the browser's computer through an existing reverse hc route.

Copy only the supplied mod folder into the app's mods/ after reading the files and reviewing name conflicts; do not overwrite a shipped or personal mod. Merge any chosen bindings instead of replacing keys.json. Mount only the blocks described above. To update, review the changed files and keep runtime state outside the source; to remove, first remove its bindings/blocks, then the copied mod folder.

## Done when

Use an approved disposable remote fixture to check discover/manual entry, occupied-port failure, explicit start/browser/stop and persistence after closing. Confirm unrelated SSH tunnels and listener processes are unchanged. These live checks are not part of the offline gate.

Run herdr-app check on the installed mod only when native checks are authorized. A passing offline test is not proof of keyboard, rendering, transport or destructive behavior. These checks describe acceptance; they are not claims that a live flow has passed.
