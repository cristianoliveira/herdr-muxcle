# Recipes and delivery

Mods are the implementation units. Recipes describe their real behavior and compose selected mods; they do not create another package ownership layer.

## Native sharing format

Herdr's app-generated guide describes a shared mod/layout as an app-home-shaped folder with RECIPE.md and preview.png. A mod entry supplies mods/<id>/ and optional keys; a layout entry adds layouts/<name>.json and required mods. Each brief describes appearance, behavior, components, limits and acceptance checks. Consumers read the files, disclose access/execution, preserve names/configuration, merge selected keys and check mods before use.

This repository keeps flat source directories and recipes/<id>/RECIPE.md. Release assembly gathers the selected real files into that native shape; it does not compile or duplicate implementations. The tar.gz/checksum flow is our delivery choice, not a Herdr requirement. Gallery discovery/publication is a separate step, not proven by a local archive.

## Selection

catalog.json maps each entry ID to two explicit arrays:

- mods: actual mod directory IDs, not invented feature/package ownership IDs.
- files: root-relative optional configuration files, never globs or whole app homes.

There are twelve one-mod entries and the optional tmux composition. A recipe can select multiple mods, but it must state required mounted hosts, native dependencies and optional features. For example, tmux-picker works without recency; that extra behavior needs a separately installed and mounted tmux-compat host. Selecting a behavior inside that host does not turn it into an independently split module.

The assembler uses tracked source files only and excludes tests, SDK files and development artifacts from mod payloads. Recipes/configuration remain outside copied mod folders; mutable app settings, sessions and data are not installation payloads.

## Preview and verification status

Current briefs are drafts. No approved screenshots of this restored original UI are available. Do not reuse older adapted UI screenshots or manufacture a preview. Save a genuine current screenshot as recipes/<id>/preview.png and review the brief's pending-preview notice before preparing a complete entry. Native checks and acceptance remain separate from archive structure checks.

Without a preview, complete assembly must fail before writing artifacts. Explicit draft assembly can exercise the delivery pipeline, but its output is not gallery-ready. Do not upload drafts as verified releases. Prior published versions contain the previous adapted implementations and cannot stand in for this tree.

## Assemble release files

Developers need Node.js and Git; `make gate` also needs Python 3. No npm installation or compilation is involved. Version 0.3.0 below is an example, not a published-release claim.

```sh
node scripts/package.mjs --help
node scripts/package.mjs --version 0.3.0 --entry tmux-compat
node scripts/package.mjs --version 0.3.0 --entry tmux
```

Omit --entry to build all catalog entries. Complete assembly requires committed selected sources and each selected entry's tracked genuine preview. Use a new output directory or version: artifacts are never overwritten. Output defaults to dist/; app-home output is refused.

To check delivery before previews are approved, explicitly produce drafts:

```sh
node scripts/package.mjs --version 0.3.0 --out .tmp/draft-release --draft
```

Each archive expands to an entry/version folder containing RECIPE.md, selected app-home files and a manifest recording file hashes, executable modes and source provenance. Its matching .sha256 verifies the archive. Structural checks cannot certify that a PNG is a truthful current screenshot or that native behavior passed; review both separately.

The tag-driven GitHub workflow runs the gate, assembles complete entries and creates a **GitHub draft release** for review. It never uploads missing-preview --draft payloads. A vX.Y.Z tag uses one shared version; publication remains a deliberate human step. Missing previews stop the workflow before creating a release. No workflow or tag is triggered by preparing files locally.

## Installing and updating

From an appropriate published artifact, verify its SHA-256 and read RECIPE.md plus the actual files. Ask the Herdr agent to copy only the chosen mod folders, merge reviewed key additions, and fit required blocks into the current layout. Ask before replacing bindings/files or switching a layout. The recipient needs no source clone, npm installation or compiler; programs used by a feature remain explicit prerequisites.

For updates, review file changes and preserve runtime data. For removal, remove only the selected bindings/blocks/mod files; active owned tunnels or other long-lived actions require their documented cleanup. Dotfile managers are optional consumers, not required installation machinery.
