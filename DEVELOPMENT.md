# Development

## Prerequisites

- Git
- GNU Make
- Node.js 22 (built-in `node:test`; no package install)
- `herdr-app` only for the optional native loader check

The repository deliberately has no package manager lockfile or third-party dependencies yet. See [the Herdr development research](docs/HERDR-RESEARCH.md) for the local API evidence, native-mod boundaries, and safety constraints behind these choices.

## One normal quality gate

Run `make gate` locally or while iterating. The same command is run by the versioned hooks, CI, and any watcher (for example, configure `fzz` to invoke `make gate`). It syntax-checks JavaScript with Node and runs deterministic co-located behavior tests. Success prints exactly `true`; failure prints `false` first, then at most 20 diagnostic lines. A `true` gate is the definition of passing automated baseline checks, not proof of complete feature behavior.

Install and verify hooks explicitly:

```sh
make hooks-install
make hooks-check
```

Hooks invoke the gate before commit and push. The commit-msg hook enforces `type(scope): subject`; accepted types include `feat`, `fix`, `docs`, `test`, `refactor`, and `chore` (also `style`, `build`, `ci`, `perf`, `revert`). Examples: `feat(mod): add pane shortcut`, `docs: explain development setup`.

## Explicit checks outside the gate

- `make format`: formatting is manual until a formatter is selected.
- `make coverage`: report Node test coverage; not a threshold or gate.
- `make security`: no dependency scanner is configured while there are no dependencies.
- `make herdr-check`: ask the installed Herdr app to load the illustrative fixture in a temporary directory. This checks initial loading only, not UI or asynchronous behavior, and is not required for every edit.

## Failure and recovery

- `make hooks-check` reports hooks are not installed → run `make hooks-install`.
- `make gate` reports a syntax/test failure → fix the reported file and rerun `make gate`.
- `make herdr-check` cannot find `herdr-app` → install/enter the environment that provides Herdr, then rerun it.
- Hook blocks a commit message → use a conventional message such as `fix(mod): handle missing pane`.

Do not write to live `~/.config/herdr-app` state, copy personal configuration into fixtures, or treat the example helper as product functionality. `HERDR_APP_HOME` alone does not isolate the separate Herdr core state; do not launch a development app against a live core. `herdr-app check` validates initial loading only, and may generate helper files, so the target copies the fixture to a temporary directory and removes it afterward.

## Completion

A change is ready for review when `make gate` passes, its relevant happy and failure behavior has deterministic tests where applicable, and any required native validation is recorded separately. Coverage, formatting, security scans, and native checks are not implied by the normal gate.
