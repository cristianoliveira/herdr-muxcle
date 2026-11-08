# Herdr development baseline

## Decision

Build `herdr-muxcle` as a **Herdr desktop app customization**, not a plugin for the separate Herdr terminal application. Use personal JavaScript/GPUI mods and JSON layouts or key bindings. Reuse native commands before adding compatibility behavior.

This is an established extension surface, but the sampled community repositories do not establish one shared development toolchain. Keep the repository gate small and independent of a running desktop app.

### TypeScript authoring

TypeScript is the approved source language for this repository. Compile it to JavaScript before Herdr loads the mod; the desktop entry point remains `main.js`. This is a repository build choice, not a claim that Herdr loads TypeScript directly.

- Typecheck and test through the shared gate; keep generated JavaScript separate from source and out of Git.
- Keep native imports (`herdr`, `gpui-kit`) as runtime imports, not bundled replacements. Use matching API declarations when integrating those modules.
- Do not expose browser or Node globals to native mod source. Node remains development tooling only.
- Pin the compiler and lock development dependencies. Building and testing must not require an active Herdr home or core.

## Problem and outcome

Developers need to change tmux-style behavior without overwriting shipped files, personal settings, or running terminals. A passing JavaScript test alone cannot prove that Herdr can render a mod.

Desired outcome: one documented local/CI gate for deterministic checks, plus an explicit native validation step before declaring a mod ready. This bootstrap does not migrate the personal dotfiles or implement tmux behavior.

## Local evidence

Inspected `~/.dotfiles/nix/shared/herdr/` and the installed guide at `~/.config/herdr-app/AGENTS.md` on 2026-11-08. Installed app: `herdr-app 0.1.13`; `hc` is installed separately.

- `mods/project-picker/model.js` separates selection/filtering decisions from native UI; `tests/model.test.mjs` exercises these decisions with Node's built-in runner. Node is a development tool, not the mod runtime.
- `mods/project-picker/mod.json` declares popup placement; `jsconfig.json` enables JavaScript checking with ES2022 globals, not DOM globals.
- Personal `tmux-compat`, picker, status, and sidebar mods demonstrate layouts mounting observers and shared state. These are reference material, not automatically portable product requirements.
- The dotfiles installer deliberately manages only selected paths and preserves runtime state. Do not copy its absolute paths or take ownership of the whole app home.
- Personal clones of shipped mods require comparison with upstream on upgrades. They do not receive upstream fixes automatically.

The installed guide and generated `herdr.d.ts` / `gpui-kit.d.ts` describe the installed API. Online `master` can differ from version 0.1.13; record version when diagnosing compatibility.

## Public examples inspected

Source snapshots were shallow-cloned into `$WORKSPACE/<owner>/<repo>` outside this repository. No community code was installed or executed.

| Project | Snapshot | Evidence and relevance |
| --- | --- | --- |
| [herdrdev/herdr-app](https://github.com/herdrdev/herdr-app) | `7fe7ac34fef8a3ee76cb5d2f17bc8d6331e50bd8` | Official desktop contract: [mod guide](https://github.com/herdrdev/herdr-app/blob/7fe7ac34fef8a3ee76cb5d2f17bc8d6331e50bd8/docs/mods.md), [contributing](https://github.com/herdrdev/herdr-app/blob/7fe7ac34fef8a3ee76cb5d2f17bc8d6331e50bd8/CONTRIBUTING.md), and [security](https://github.com/herdrdev/herdr-app/blob/7fe7ac34fef8a3ee76cb5d2f17bc8d6331e50bd8/docs/security.md). Prefer mods/layouts over upstream feature patches. |
| [jankeesvw/herdr-space-folders](https://github.com/jankeesvw/herdr-space-folders/tree/63a78b20d5ed30d57166a3c7165a6eb558c3ef84) | `63a78b20d5ed30d57166a3c7165a6eb558c3ef84` | Native `mods/space-folders/main.js`, `mod.json`, personal layout, keys snippet, and `RECIPE.md`. README identifies its copied layout baseline as 0.1.10 and notes symlink reload limitations. Useful packaging example, not a test standard. |
| [atuinsh/herdr-atuin-threads](https://github.com/atuinsh/herdr-atuin-threads/tree/6e2786d1ae7555cbe4c338c55c265badc86812cb) | `6e2786d1ae7555cbe4c338c55c265badc86812cb` | Native `mods/atuin-threads/{main.js,mod.json,threads.svg}`, keys snippet, and recipe. Uses `exec` argument arrays and native `cx.timer.every`; documents its external Atuin prerequisite. No package build is required by the inspected layout. |
| [hhdebb/herdr-radar](https://github.com/hhdebb/herdr-radar/tree/8619655557a4d2c2852e819d424e4af4ed83e4b1) | `8619655557a4d2c2852e819d424e4af4ed83e4b1` | Contains `herdr-plugin.toml`, Node checks/tests and separate formatting commands. This snapshot targets the terminal plugin surface, not the desktop mod contract. Do not borrow its manifest as a desktop template. |
| [alexarthurs/herdr-sidebar](https://github.com/alexarthurs/herdr-sidebar/tree/081ed133f3faa377438b51ce435fe8a87c439593) | `081ed133f3faa377438b51ce435fe8a87c439593` | Rust plugin installed with `herdr plugin install`; distinct from desktop `herdr-app`. Useful counterexample to choosing tooling from the project name alone. |

These are observations of five snapshots, not an exhaustive ecosystem survey or a security review.

## Guardrail acceptance boundaries

1. A documented command runs lint/type checks and deterministic behavior tests without Herdr, a network connection, or personal dotfiles. Hooks, watcher and CI invoke that same command.
2. Success prints exactly `true`. Failure returns nonzero, starts with `false`, then gives bounded diagnostics. Verify both paths, not only a passing baseline.
3. Hook installation and inspection have explicit commands. Pre-commit and pre-push share the normal gate; commit-msg enforces the documented convention.
4. Runtime-facing mod changes must also pass `herdr-app check <mod folder>` and an interactive check. The native check loads and renders once; it does not validate later async states, deferred rows, keyboard behavior or spacing.
5. Domain decisions stay testable without `herdr`/GPUI imports. Runtime integrations use explicit boundaries. Keep tests beside the code they exercise; do not add tests that merely match configuration text.
6. Formatting, coverage, security and native validation remain explicit checks outside the normal lint-and-test gate. Document their scope and unavailable prerequisites honestly.
7. No bootstrap command installs mods into the active app home, replaces keys/layouts/settings, or mutates live core documents. No migration is included.

## Safety and upgrade constraints

- Mods run trusted JavaScript with program, filesystem and network access. They are not sandboxed; read every file before installing a third-party mod. A layout can load mods too.
- `HERDR_APP_HOME` chooses an app home, **not an isolated core**. Spaces, tabs, terminals and splits belong to core. Any later interactive development launcher must isolate both app and core before it runs.
- Shipped files and generated API types can be rewritten at startup. Edit personal copies, not shipped defaults. Never commit runtime state or sensitive terminal output.
- GPUI is not a web view: no DOM, CSS, Node APIs or global `setTimeout` in mods. Development tools may use Node APIs separately.
- Use installed declarations for installed-version checks. A Node unit test or a typecheck is not proof of native render compatibility.
- Do not import community source without checking license and attribution. This work borrows structure and lessons only.

## Next product slice

Choose one tmux workflow and its compatibility expectations before migrating behavior. Keep “space”, “tab”, “pane”, “mod”, “layout”, and “core” distinct; do not promise full tmux equivalence from similar shortcut names.
