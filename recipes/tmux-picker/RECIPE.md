# Space and tab picker

A native fuzzy picker for existing spaces/tabs, with original creation and direct tab-close controls.

Preview pending: this is a draft entry, not a gallery-ready submission. Add an approved screenshot as preview.png; do not substitute diagnostic or unrelated UI footage.

## What you see

A 640px-wide popup occupies 80% window height. It groups tabs by machine/space, shows agent context and includes new-tab/new-space rows. Existing theme colors identify spaces and native agent activity.

## How it behaves

Search space, machine, tab and agent names. Arrows/Ctrl-j/k select; Enter goes to a tab or performs the selected creation action. Ctrl-d calls native tab.close on the selected tab without a custom confirmation; Escape leaves. Agent working uses a spinner; other native states retain their theme indicators. Recent ordering consumes tmux-compat.recent-tabs when available.

## Built from

Use mods/tmux-picker/ and open mod.open:tmux-picker. It needs no persistent host to search. Optional recency requires separately installing and mounting tmux-compat; the base picker still works without it. Native hc lists connected non-temporary machines. Reuse installed workspace-chrome icons and native confirmation UI.

## Watch out

This original picker includes creation and close actions; do not describe it as the adapted read-only/default-opt-in picker. Opening queries machine metadata. Creation and Ctrl-d close change runtime state. The optional history dependency is not included in this one-mod entry and must be selected explicitly if desired.

Copy only the supplied mod folder into the app's mods/ after reading the files and reviewing name conflicts; do not overwrite a shipped or personal mod. Merge any chosen bindings instead of replacing keys.json. Mount only the blocks described above. To update, review the changed files and keep runtime state outside the source; to remove, first remove its bindings/blocks, then the copied mod folder.

## Done when

Check native loading, search, keyboard/click navigation and fallback ordering without history. With an approved mounted host, verify recency. Test create/close only with explicitly disposable tabs/spaces; do not infer live behavior from mocked view tests.

Run herdr-app check on the installed mod only when native checks are authorized. A passing offline test is not proof of keyboard, rendering, transport or destructive behavior. These checks describe acceptance; they are not claims that a live flow has passed.
