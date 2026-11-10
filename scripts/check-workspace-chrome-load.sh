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

for variant in pane-footer status-clock tabs-only panels-only combined tab-picker tab-actions; do
  case "$variant" in
    pane-footer) props='role: "pane-footer", pane: "load-check-pane"' ;;
    status-clock) props='role: "status-clock"' ;;
    tabs-only) props='role: "workspace-bar", mode: "tabs"' ;;
    panels-only) props='role: "workspace-bar", mode: "panels"' ;;
    combined) props='role: "workspace-bar", mode: "combined", windowControls: "omit"' ;;
    tab-picker) props='role: "tab-picker", space: "load-check-space"' ;;
    tab-actions) props='role: "tab-actions", space: "load-check-space", tab: "load-check-tab"' ;;
  esac

  cat > "$temporary/main.js" <<EOF
import WorkspaceChrome from "./mods/muxcle-workspace-chrome/main.js";
export default class WorkspaceChromeLoadCheck extends WorkspaceChrome {
  init(_props, cx) {
    super.init({ $props }, cx);
  }
}
EOF
  HC_SESSION="muxcle-workspace-chrome-load-${variant}-$$" herdr-app check "$temporary/main.js"
done
