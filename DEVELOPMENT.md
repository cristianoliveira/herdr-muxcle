# Development

Installing a capability? Start with [Installation](INSTALLATION.md). Preparing a versioned download? Follow the [release process](docs/RELEASING.md). This page covers source changes and local checks.

## Prerequisites

- Git
- GNU Make
- Node.js 22.23.4 to match CI (built-in `node:test`)
- npm 10.9.9 for the pinned TypeScript development compiler
- Python 3.11+ for repository validation and E2E harness safety tests (available on the Ubuntu CI runner)
- `tar` for package archives
- `herdr-app` for native package verification and release checks

The project pins npm 10.9.9 and disables lifecycle scripts in its local `.npmrc`. Install locked development tools with `npm ci --ignore-scripts`. TypeScript output is written under ignored `.build/`; `node_modules/` and build output are not committed.

```sh
make lint          # strict typecheck + syntax-check JavaScript
make build         # emit ESM JavaScript to .build/
make test          # build, then run co-located Node tests
make gate          # canonical typecheck/build/test gate
make herdr-check   # package, install into a temporary app home, preserve settings, native-check
make e2e-help      # prerequisites and coverage of opt-in native IPC scenarios
make e2e           # real isolated macOS app/core, PTY geometry, focus, screenshots
make package       # build each optional capability archive with SHA-256
make release-plan  # preview versioned package downloads and installation notes; no publication
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
- `make e2e`: run packaged capabilities through a copied native app and a private core on macOS. Check sizing, rotation, history, Help visibility, and popup/discovery smoke behavior. Requires a GUI login and `swiftc` for offline screenshot text checks. Opens a separate test window; never sends keyboard/mouse events. See [native E2E coverage and explicit gaps](tests/e2e/README.md). The normal gate runs only mocked harness/oracle unit tests, not this suite.
- `make release-plan`: preview the shared package catalog's versioned download links and installation notes; does not build, publish, create tags, or contact GitHub.
- `make release-ci`: gate, network-dependent audit, and package build/verification; this is what hosted tag automation runs before preparing a draft release.
- `make release-check`: `make release-ci` plus a native check in a clean temporary app home. Run this locally before creating a release tag; GitHub-hosted runners do not have Herdr installed.

## Failure and recovery

- `make hooks-check` reports hooks are not installed → run `make hooks-install`.
- `make gate` reports a type, syntax, build, or test failure → fix the reported file and rerun `make gate`.
- `tsc` is missing → run `npm ci --ignore-scripts`.
- `make herdr-check` cannot find `herdr-app` → install/enter the environment that provides Herdr, then rerun it.
- `make e2e` reports a prerequisite or ownership error → read `make e2e-help`; use a new `--output` directory and resolve the reported app/core identity issue. Never recover with broad process kills.
- Hook blocks a commit message → use a conventional message such as `fix(mod): handle missing pane`.

Do not write to live `~/.config/herdr-app` state, copy personal configuration into fixtures, or treat the helper as product functionality. `HERDR_APP_HOME` alone does not isolate the separate Herdr core state; do not launch a development app against a live core. `herdr-app check` validates initial loading only and may generate helper files, so the target checks the extracted package in a temporary app home and removes it afterward. See [Installation](INSTALLATION.md) for package selection and links to standalone install/update/removal instructions. See [Release process](docs/RELEASING.md) for versioning, draft review, and explicit publication. The scaffold's `docs/INSTALLATION.md` is specific to that optional layout, not the project's installation entrypoint.

## Completion

A change is ready for review when `make gate` passes, its relevant happy and failure behavior has deterministic tests where applicable, and any required native validation is recorded separately. Coverage, formatting, security scans, and native checks are not implied by the normal gate.
