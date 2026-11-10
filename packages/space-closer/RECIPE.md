# Herdr Close spaces

Close several selected Herdr spaces through one review-and-confirm flow. This is an optional, independently installable native mod. It does not replace the active layout, install shortcuts, or require Sessionizer, Python, Git, Node.js, npm, or a repository checkout at runtime.

## Behavior and safety

Open the dialog and filter spaces by name, machine, or folder. Nothing is selected at first. Filtering does not clear selections hidden by the current query. The review freezes the selected space IDs, machine names and Core identities, folders, tab IDs, and pane counts. New spaces are never added to that review.

The final confirmation re-reads the native space and layout snapshots and, for remote selections, rechecks `hc machine ls --json` through Herdr's native `hc` API. A missing, changed, unavailable, or retargeted reviewed space prevents dispatch and requires a new review. The mod calls native `space.close` once per reviewed ID only after the explicit confirmation button is clicked. Enter and Escape do not confirm; Escape and Cancel close the dialog, while Back clears review authorization and returns to selection.

Herdr's `run()` API does not acknowledge terminal termination. After dispatch, the dialog reports completion as unknown. Closing a space can asynchronously terminate local or remote terminals and descendant agents; partial shutdown is possible. There is no automatic retry or rollback. Inspect the current spaces before taking any manual follow-up action.

## Install

For a published package, use its versioned archive and matching checksum. A GitHub source folder is an instruction entrypoint, not necessarily a compiled runtime payload. If a suitable release is unavailable, stop and ask whether a contributor should prepare a local build; do not build on the user's machine.

```sh
set -eu
VERSION=v0.1.0
RELEASE_URL="https://github.com/cristianoliveira/herdr-muxcle/releases/download/$VERSION"
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT
ARCHIVE="muxcle-space-closer-${VERSION}.tar.gz"
curl -fL "$RELEASE_URL/$ARCHIVE" -o "$WORK_DIR/$ARCHIVE"
curl -fL "$RELEASE_URL/$ARCHIVE.sha256" -o "$WORK_DIR/$ARCHIVE.sha256"
(cd "$WORK_DIR" && shasum -a 256 -c "$ARCHIVE.sha256")
tar -xzf "$WORK_DIR/$ARCHIVE" -C "$WORK_DIR"
BUNDLE="$WORK_DIR/muxcle-space-closer-${VERSION}"
APP_HOME="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
sh "$BUNDLE/check-install-targets.sh" "$APP_HOME"
mkdir -p "$APP_HOME/mods"
cp -R "$BUNDLE/mods/muxcle-space-closer" "$APP_HOME/mods/"
HERDR_APP_HOME="$APP_HOME" herdr-app check "$APP_HOME/mods/muxcle-space-closer"
```

The checker refuses to overwrite an existing mod or follow linked app-home, `mods`, or mod paths. It does not alter settings, keys, the active layout, or other installed packages. The app-home should be the one Herdr currently uses; an alternate app-home does not isolate existing terminals or sessions.

## Open

With Herdr running, open the optional dialog from a shell:

```sh
HERDR_APP_HOME="${HERDR_APP_HOME:-$HOME/.config/herdr-app}" herdr-app do mod.open:muxcle-space-closer
```

Select one or more spaces, choose **Review**, inspect the frozen IDs and tab/pane details, then choose **Confirm close N spaces**. Back requires a fresh review. Cancel and Escape send no close request.

No shortcut is installed by default. If you add one, merge a single binding into your existing `keys.json` after checking for conflicts; do not replace the file.

## Update or remove

Before updating, inspect local edits and verify the ownership marker:

```sh
APP_HOME="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
sh "$BUNDLE/check-install-targets.sh" --update "$APP_HOME"
diff -ru "$APP_HOME/mods/muxcle-space-closer" "$BUNDLE/mods/muxcle-space-closer"
```

Back up and replace only the exact mod folder. Keep the backup until `herdr-app check` passes. To remove it, close the dialog, run the `--remove` check, and move only the marked mod folder to a backup before deleting it. Settings, shortcuts, layouts, other mods, and runtime state remain untouched.
