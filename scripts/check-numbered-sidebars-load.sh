#!/bin/sh
set -eu

mod_directory=${1:?Usage: sh check-numbered-sidebars-load.sh COMPILED_MOD_DIRECTORY}
temporary=$(mktemp -d)
trap 'rm -rf "$temporary"' EXIT HUP INT TERM
mod_target="$temporary/mods/muxcle-numbered-sidebars"
HERDR_APP_HOME="$temporary"
export HERDR_APP_HOME
mkdir -p "$mod_target"
cp "$mod_directory/main.js" "$mod_directory/model.js" "$mod_target/"

for role in spaces agents; do
  cat > "$temporary/main.js" <<EOF
import NumberedSidebars from "./mods/muxcle-numbered-sidebars/main.js";
export default class NumberedSidebarsLoadCheck extends NumberedSidebars {
  init(_props, cx) {
    super.init({ role: "$role" }, cx);
  }
}
EOF
  HC_SESSION="muxcle-numbered-sidebars-load-${role}-$$" herdr-app check "$temporary/main.js"
done
