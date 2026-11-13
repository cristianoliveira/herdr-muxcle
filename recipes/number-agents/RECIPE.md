# Numbered agents

Herdr's original agent sidebar clone with status-colored compact numbers instead of separate dots or spinners.

Preview pending: this is a draft entry, not a gallery-ready submission. Add an approved screenshot as preview.png; do not substitute diagnostic or unrelated UI footage.

## What you see

In a narrow sidebar, numbered rows use the current theme's agent status colors; working numbers have a subtle pulsing background. Expanded rows retain the original groups, controls and agent information.

## How it behaves

Working, blocked, done and idle remain distinct native agent states. Selection and native agent actions remain available; compact rendering changes presentation, not lifecycle. Preserve the clone's sorting, pinning and group controls.

## Built from

Use mods/number-agents/main.js and mod.json. Add content.mod = "number-agents" to the intended sidebar block. It is a clone of Herdr 0.1.13 agents, not a replacement installed over the shipped agents directory. It consumes native agent/space data and workspace-chrome icon assets.

## Watch out

Requires the installed native workspace-chrome assets and compatible Herdr/gpui APIs. The clone does not receive upstream mod changes automatically. Native controls can focus, start or act on agents; review those actions instead of treating the panel as a static label. No unrelated layout must be replaced.

Copy only the supplied mod folder into the app's mods/ after reading the files and reviewing name conflicts; do not overwrite a shipped or personal mod. Merge any chosen bindings instead of replacing keys.json. Mount only the blocks described above. To update, review the changed files and keep runtime state outside the source; to remove, first remove its bindings/blocks, then the copied mod folder.

## Done when

Check native loading, narrow and expanded widths, all four status states and selection with approved fixtures. Compare retained controls against the installed Herdr version before adopting an upgrade.

Run herdr-app check on the installed mod only when native checks are authorized. A passing offline test is not proof of keyboard, rendering, transport or destructive behavior. These checks describe acceptance; they are not claims that a live flow has passed.
