# Development

## Prerequisites

- Git
- GNU Make
- Node.js 22.23.4 to match CI (built-in `node:test`)
- npm 10.9.9 for the pinned TypeScript development compiler
- Python 3.10+ for repository-local AGENTS.md link and landmark validation (available on the Ubuntu CI runner)
- `tar` for package archives
- `herdr-app` for native package verification and release checks

The project pins npm 10.9.9 and disables lifecycle scripts in its local `.npmrc`. Install locked development tools with `npm ci --ignore-scripts`; TypeScript 5.9.3 is the only development dependency. TypeScript output is written under ignored `.build/`; `node_modules/` and build output are not committed.

```sh
make lint          # strict typecheck + syntax-check JavaScript
make build         # emit ESM JavaScript to .build/
make test          # build, then run co-located Node tests
make gate          # canonical typecheck/build/test gate
make herdr-check   # package, install into a temporary app home, preserve settings, native-check
make package       # build each optional capability archive with SHA-256
make release-check # release CI checks plus isolated native check
make release-ci    # checks available on the hosted release runner
make release-tag TAG=v0.1.0  # verify tag matches package.json; does not publish
```

## One normal quality gate

Run `make gate` locally or while iterating. The versioned hooks and CI use this same command. It type-checks TypeScript with strict mode, ES2022-only libraries, and no Node/browser globals; syntax-checks JavaScript modules under `src/`, `fixtures/`, and `mods/`; validates repository AGENTS.md links and public landmarks; builds to `.build/`; and runs discovered co-located Node behavior tests. Success prints exactly `true`; failure prints `false` first, then at most 20 diagnostic lines (including Make's failure summaries). A `true` gate is the definition of passing automated baseline checks, not proof of complete feature behavior.

Run `make watch` to start the configured `fzz` watcher. Its `watch.yaml` job reruns `make gate`, so watcher feedback uses the same gate; install `fzz` separately if it is unavailable.

Install and verify hooks explicitly:

```sh
make hooks-install
make hooks-check
```

Hooks invoke the gate before commit and push. The commit-msg hook enforces `type(scope): subject`; accepted types include `feat`, `fix`, `docs`, `test`, `refactor`, and `chore` (also `style`, `build`, `ci`, `perf`, `revert`). Examples: `feat(mod): add pane shortcut`, `docs: explain development setup`.

## Explicit checks outside the gate

- `make format`: formatting is manual until a formatter is selected.
- `make coverage`: build and report Node test coverage; not a threshold or gate.
- `make security`: run `npm audit` against the lockfile, including development tools. This is network-dependent and intentionally outside the normal gate.
- `make package`: create separate precompiled archives and checksums for each optional capability listed in README; does not install or merge packages.
- `make herdr-check`: unpack into a clean temporary app home, preserve a sentinel settings file, and ask Herdr to load the packaged mod. This checks initial mod loading only, not layout activation or interactive behavior.
- `make release-ci`: gate, network-dependent audit, and package build/verification; this is what hosted tag automation can run.
- `make release-check`: `make release-ci` plus a native check in a clean temporary app home. Run this locally before creating a release tag; GitHub-hosted runners do not have Herdr installed.

## Failure and recovery

- `make hooks-check` reports hooks are not installed → run `make hooks-install`.
- `make gate` reports a type, syntax, build, or test failure → fix the reported file and rerun `make gate`.
- `tsc` is missing → run `npm ci --ignore-scripts`.
- `make herdr-check` cannot find `herdr-app` → install/enter the environment that provides Herdr, then rerun it.
- Hook blocks a commit message → use a conventional message such as `fix(mod): handle missing pane`.

Do not write to live `~/.config/herdr-app` state, copy personal configuration into fixtures, or treat the helper as product functionality. `HERDR_APP_HOME` alone does not isolate the separate Herdr core state; do not launch a development app against a live core. `herdr-app check` validates initial loading only and may generate helper files, so the target checks the extracted package in a temporary app home and removes it afterward. See [Installation](docs/INSTALLATION.md) for manual no-overwrite install, reviewed update, scoped uninstall, and tagged release instructions.

## Completion

A change is ready for review when `make gate` passes, its relevant happy and failure behavior has deterministic tests where applicable, and any required native validation is recorded separately. Coverage, formatting, security scans, and native checks are not implied by the normal gate.
