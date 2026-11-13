# Numbered spaces

Herdr's original spaces sidebar clone with compact status-colored numbers and preserved expanded controls.

Preview pending: this is a draft entry, not a gallery-ready submission. Add an approved screenshot as preview.png; do not substitute diagnostic or unrelated UI footage.

## What you see

A narrow rail shows numbered spaces with status color and a subtle working pulse. Expanded groups retain machine, project, branch and space information; selected spaces keep their row highlight.

## How it behaves

Follow native space/agent state for working, blocked, done and idle presentation. Keep selection, groups and native creation/worktree controls. Repository information refreshes independently and can be unavailable without hiding the space.

## Built from

Use mods/number-spaces/main.js and mod.json in a sidebar block. It clones Herdr 0.1.13 spaces, reusing installed workspace-chrome icons. Native exec runs git status/rev-parse in local or remote project contexts; filesystem watching refreshes local repository information.

## Watch out

Disclose Git execution and project metadata reads, including remote exec contexts. Git is needed for repository details, not to download this mod. Native creation/worktree controls can change runtime state when selected. Preserve the original no-optional-locks Git behavior. This clone needs upstream comparison when Herdr changes.

Copy only the supplied mod folder into the app's mods/ after reading the files and reviewing name conflicts; do not overwrite a shipped or personal mod. Merge any chosen bindings instead of replacing keys.json. Mount only the blocks described above. To update, review the changed files and keep runtime state outside the source; to remove, first remove its bindings/blocks, then the copied mod folder.

## Done when

Verify native loading, narrow/expanded rows, selection and status appearance. With approved repository fixtures, compare branch/ahead/behind data and missing-Git/unavailable-repository behavior. Do not run worktree or destructive actions without explicit approval.

Run herdr-app check on the installed mod only when native checks are authorized. A passing offline test is not proof of keyboard, rendering, transport or destructive behavior. These checks describe acceptance; they are not claims that a live flow has passed.
