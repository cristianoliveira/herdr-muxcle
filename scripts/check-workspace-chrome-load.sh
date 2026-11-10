#!/bin/sh
set -eu

mod_directory=${1:?Usage: sh check-workspace-chrome-load.sh COMPILED_MOD_DIRECTORY}
temporary=$(mktemp -d)
trap 'rm -rf "$temporary"' EXIT HUP INT TERM
mod_target="$temporary/mods/muxcle-workspace-chrome"
HERDR_APP_HOME="$temporary"
export HERDR_APP_HOME
mkdir -p "$mod_target"
cp "$mod_directory/main.js" "$mod_directory/model.js" "$mod_target/"

for role in pane-footer status-clock; do
  cat > "$temporary/main.js" <<EOF
import WorkspaceChrome from "./mods/muxcle-workspace-chrome/main.js";
export default class WorkspaceChromeLoadCheck extends WorkspaceChrome {
  init(_props, cx) {
    super.init({ role: "$role", pane: "load-check-pane" }, cx);
  }
}
EOF
  HC_SESSION="muxcle-workspace-chrome-load-${role}-$$" herdr-app check "$temporary/main.js"
done
