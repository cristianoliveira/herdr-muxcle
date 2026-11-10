---
id: TASK-0008
title: Add opt-in remote sessionizer discovery and progressive cache
status: done
depends_on: []
priority: normal
tags: [dotfiles-adoption]
---

## Problem

Muxcle discovers local folders only; users with connected remote projects cannot find them in the same project workflow.

## Outcome

Explicitly enabled machines contribute bounded, machine-scoped project results, with responsive cached results and honest stale/offline feedback.

## Acceptance criteria

- Preserve the existing local-only default, explicit roots, configuration compatibility and scan/output bounds. Remote participation and roots are deliberate configuration.
- Use Herdr's connected-machine transport and a trusted scanner over stdin; no extra SSH connection, remote mod installation, shell interpolation or project-local executable.
- Require available hc and remote Python; report unavailable/disconnected machines without erasing valid local results or falling back to local execution.
- Bound concurrency and command/client timeouts; source baseline is four concurrent machines, six-second remote and eight-second client timeouts. Inject time/transport in tests.
- Render per-machine cached results immediately, progressively refresh, and use a 60-second default cache lifetime. Mark retained stale results on failure and bound/validate persisted data.
- Machine identity plus canonical folder determines reuse. Identical paths on different machines never collide; revalidate connectivity/identity before opening a cached selection.
- Failed/disconnected cached selections cannot create local spaces. Keep no duplicate spaces from repeated selection.
- Tests cover machine isolation, literal paths, ordering, timeout/failure, corrupt/stale cache, progressive updates, reconnection and old local configurations.

## Constraints and non-goals

No automatic machine connection, credentials, watcher lifecycle, background scans of unconfigured roots or remote path canonicalization on the local filesystem.

## Evidence

Dotfiles: mods/project-picker/{projects.py,discovery.js,main.js}, tests/{test_projects.py,project-discovery.test.mjs}. Muxcle: mods/muxcle-sessionizer.

## Done when

- Tests first: deterministic happy, refusal, stale-state and cancellation cases; mock external dependencies. Review changed-behavior coverage and regression risk.
- Use native commands where sufficient; keep pure decisions separate from runtime adapters.
- Update compiled payload membership, recipe, optional keys, prerequisites, activation, update and removal instructions. New capabilities install independently; disclose required mounted hosts/observers. Do not require the scaffold.
- Extend whole-pack composition without duplicate hosts, silent key conflicts or changes to unrelated settings. Keep key-only installation free of runtime mods.
- End users need no Git, Node.js, npm, TypeScript or repository checkout. Preserve shared release version and verified checksums.
- Use the configured watcher for the applicable gate. Isolated initial-load checks are separate; do not claim headless tests prove interactive keyboard/UI behavior.
- Commit implementation with this TASK ID; move its board file to done and commit the board transition. No live installation, layout switching or publication without separate authorization.
