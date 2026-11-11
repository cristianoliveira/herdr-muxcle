# Funzzy status

Install this as an optional Herdr status row. It observes existing Funzzy watchers; it never starts, triggers, retries, or cancels jobs.

## Behavior and access

The mod polls every three seconds only while its block is present in the current layout and at least one project is monitorable; it monitors at most 64 projects, runs at most four queries in flight, issues no monitor queries with no project space, and app-close cancels its timer. It calls only `fzz control --format json capabilities` and `fzz control --format json status` through Herdr's native `exec` API. A status read is bracketed by capabilities reads because Funzzy status documents do not include the watcher instance token. If the tokens differ, the result is treated as a restart and ignored for that poll.

The row shows the latest state, generation, and failure count. It never displays or saves job commands, output, failure details, or credentials. Toasts include a bounded machine/project label and have no navigation action; clicking the row focuses only one exact local watcher match. Initial observations and watcher restarts are silent. Toasts fire once for each newly observed passed or failed generation; cancelled is display-only. Bounded deduplication metadata is stored under `muxcle.funzzy-status.v1` in Herdr shared state; it contains the machine/folder identity, instance token, generation, state, and last notified generation for up to 64 projects. The first observation after the app restarts is silent. Offline periods retain the cursor so a repeated generation is not notified again.

Local monitoring is enabled by default. Remote monitoring is **off by default**. To opt in, set `remote` to `true` in this block's props. Remote queries use Herdr's existing machine transport and the target machine's home when its project folder is empty; they do not use SSH, tunnels, listeners, or local fallback. Herdr must already be connected to the remote machine, and the configured remote `fzz` binary must be available there. `remoteBinary` can set a remote executable name or absolute path. A `~/` path is expanded only for the local `binary` option; remote paths are passed literally.

Local pane hints use an optional read-only `hc get <terminal> --json` metadata read through Herdr's native `exec` API; if it is unavailable, status monitoring continues without a pane hint. Discovery checks at most 32 local pane targets per refresh; if that limit truncates the scan, unique pane focus is disabled. A pane location is only a hint. The mod compares exact local foreground cwd, terminal address, and argv metadata. It never treats a title as proof or renames tabs. Multiple matches show a count and do not focus an arbitrary pane. Remote watcher status has no pane hint.

Requires Herdr 0.1.13 and an existing Funzzy watcher exposing control schema 1 with the `status` method. Missing/unreachable commands show offline; older or insufficient capabilities show unsupported; malformed status shows invalid. This package is independent of the Muxcle layout, tmux compatibility, and sessionizer.

## Install through Herdr

Use the versioned archive and matching checksum from the [GitHub Releases page](https://github.com/cristianoliveira/herdr-muxcle/releases). A source folder is not a compiled release. If no suitable published archive exists, stop and ask whether a contributor should prepare a local build.

Ask your Herdr agent to install this package and add exactly one bundled `observer.json` block to your existing personal layout. The block occupies 24 px. Do not replace the whole layout or switch layouts automatically. Resolve any existing node ID collision first. The default snippet keeps remote monitoring disabled; review the installation context before opting in to remote access.

Manual deployment, with `BUNDLE` pointing at the extracted archive:

```sh
set -eu
BUNDLE="/path/to/muxcle-funzzy-status-${MUXCLE_VERSION:?Set MUXCLE_VERSION to the extracted archive tag including leading v}"
APP_HOME="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
sh "$BUNDLE/check-install-targets.sh" "$APP_HOME"
mkdir -p "$APP_HOME/mods"
cp -R "$BUNDLE/mods/muxcle-funzzy-status" "$APP_HOME/mods/"
HC_SESSION="muxcle-funzzy-status-check-$$" HERDR_APP_HOME="$APP_HOME" \
  herdr-app check "$APP_HOME/mods/muxcle-funzzy-status"
```

Merge the single block from `observer.json` into the active personal layout at the desired row/column position. Do not copy a shipped layout over a personal layout. No key bindings are required.

## Update or remove

Back up the installed mod and personal layout first. For an update, run the bundled preflight in update mode, replace only the marked mod directory, and rerun `herdr-app check` with a private app home and a unique `HC_SESSION`. Keep the existing observer block; do not mount a second copy.

To remove, delete only this observer block from the personal layout. Then run `sh "$BUNDLE/check-install-targets.sh" --remove "$APP_HOME"` and move only `$APP_HOME/mods/muxcle-funzzy-status` to a backup. Leave unrelated mods, layout blocks, settings, keys, and shared state untouched. The package's `muxcle.funzzy-status.v1` cursor may remain; do not replace or delete `shared.json` to remove it.

## Limits

The status row reports observations, not execution acknowledgements. If monitoring is stopped or offline, missed generations are not reconstructed from job output. The app's initial-load check does not prove interactive layout rendering, remote connectivity, or real desktop notifications; verify those separately in a deliberate user environment.
