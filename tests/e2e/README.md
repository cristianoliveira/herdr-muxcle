# Native E2E checks

Run packaged Muxcle features through real Herdr IPC, a private core, real terminal programs, and full-window screenshots. This is not keyboard/click automation.

## Run

```sh
make e2e-help
make e2e

# Inspect goals without opening a window.
python3 -B tests/e2e/run.py --list

# Use a specific source bundle. The runner copies it before launch.
make e2e E2E_ARGS="--app-bundle /Applications/Herdr.app"

# Keep evidence in a chosen NEW directory.
make e2e E2E_ARGS="--output /tmp/muxcle-e2e-new-run"
```

Prerequisites: a macOS GUI login, `hc`, `herdr-app` matching the packages' tested version, Python 3.11+, and Xcode Command Line Tools (`swiftc`). Run `xcode-select --install` if the compiler is missing. `make e2e` builds the archives first. The current native fixture requires macOS; unsupported hosts fail rather than reporting a skipped success.

A separate test window becomes visible. Do not type into it while tests run. No personal configuration, project commands, login data, clipboard contents, or default core are used.

## Coverage

| Capability | Native checks |
| --- | --- |
| Rotation | Two-pane native path; nested three-pane versioned document path; payload order, slot weights, metadata, focus |
| Sizing | Recursive equalize; all four nearest-axis resize operations; versioned writes, actual PTY rows/columns, focus |
| Refusals | Constrained and zoomed sizing shows an explanation without a document write |
| Help | All six command names and prerequisites are visible; native overlay dismissal preserves document and focus |
| History | Last-tab and last-space toggle in both directions through the mounted observer |
| Picker | Popup opens with cross-space rows/count and closes without changing the document |
| Sessionizer | Real discovery finds two scratch project directories and renders both results; dismissal makes no document change |

Pure model/controller/helper tests remain responsible for transport failures, stale snapshots, limits, and deterministic concurrency cases. These are not implied by a native happy-path run.

### Explicit gaps

- No synthetic keys or clicks on the user's desktop.
- No assertion that Ctrl-a dispatches the configured binding.
- No Help Close-button or Escape event dispatch; dismissal uses native `overlay.close`.
- No Picker/Sessionizer typing, filtering, selection, stale-result click, or project-launch interaction.
- No Linux/headless GUI runner yet.

An isolated display or VM is needed to close these interaction gaps. A passing run must not be described as complete keyboard or UI interaction coverage.

## Isolation and evidence

The harness uses a fresh HOME, app home, all XDG paths, TMPDIR, and unique core session. It copies the app bundle, pins the core executable, disables telemetry/clipboard writes, and directs release checks to a non-listening loopback endpoint. It proves process/socket identity before operating or stopping resources.

Terminal fixture programs only print labels and echo input as text. Herdr wraps supplied argv in a pinned `/bin/sh` login-shell startup envelope; the suite accepts only that exact envelope or the direct fixture invocation. HOME and working directories stay private. All project directories belong to the disposable test workspace.

Document changes wait for real core events. UI state, renderer-derived PTY geometry, and screenshot text use bounded IPC observations, not fixed sleeps. Fixture document replacement includes a native focus command to settle the app model before geometry checks. Sizing cases wait for old notices to clear, then require a fresh completion notice; they do not OCR tiny transient toast text. Offline macOS Vision reads saved PNGs; images are not uploaded. OCR normalizes punctuation/line wrapping, not letter substitutions. A failed text check preserves the observed text and full-window captures for diagnosis.

Each run preserves results, action order, native logs, document/world/focus snapshots, and full-window screenshots under its new output directory. Failures stop later scenarios and label them `not-run`. Existing output is never reused or overwritten. Ownership uncertainty fails closed and retains the scratch workspace; inspect the reported error rather than issuing broad process-kill commands.

The scenarios and action trace can support a later continuous full-window demo recording. Current screenshots are test evidence, not a video or polished feature demo.

## Fast safety tests

The normal gate includes mocked lifecycle and screenshot-oracle unit tests; it never launches a native app:

```sh
python3 -B -m unittest discover -s tests/e2e -p 'test_*.py'
```
