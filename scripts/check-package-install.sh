#!/bin/sh
set -eu

version=$(node -p 'require("./package.json").version')
bundle="herdr-muxcle-v$version"
temporary=$(mktemp -d)
trap 'rm -rf "$temporary"' EXIT HUP INT TERM

mkdir "$temporary/home"
tar -xzf "dist/$bundle.tar.gz" -C "$temporary"
printf '%s\n' '{"preserve":"this file"}' > "$temporary/home/settings.json"
sh "$temporary/$bundle/check-install-targets.sh" "$temporary/home"
cp -R "$temporary/$bundle/layouts" "$temporary/home/layouts"
cp -R "$temporary/$bundle/mods" "$temporary/home/mods"
printf '%s\n' '{"preserve":"this file"}' > "$temporary/expected-settings.json"
HERDR_APP_HOME="$temporary/home" herdr-app check "$temporary/home/mods/muxcle-compat"
cmp "$temporary/expected-settings.json" "$temporary/home/settings.json"

sessionizer_bundle="muxcle-sessionizer-v$version"
mkdir "$temporary/sessionizer-home"
tar -xzf "dist/$sessionizer_bundle.tar.gz" -C "$temporary"
printf '%s\n' '{"preserve":"this file"}' > "$temporary/sessionizer-home/settings.json"
sh "$temporary/$sessionizer_bundle/check-install-targets.sh" "$temporary/sessionizer-home"
mkdir "$temporary/sessionizer-home/mods"
cp -R "$temporary/$sessionizer_bundle/mods/muxcle-sessionizer" "$temporary/sessionizer-home/mods/"
HERDR_APP_HOME="$temporary/sessionizer-home" herdr-app check "$temporary/sessionizer-home/mods/muxcle-sessionizer"
cmp "$temporary/expected-settings.json" "$temporary/sessionizer-home/settings.json"
test ! -e "$temporary/sessionizer-home/data/muxcle-sessionizer/config.json"

picker_bundle="muxcle-picker-v$version"
mkdir "$temporary/picker-home"
tar -xzf "dist/$picker_bundle.tar.gz" -C "$temporary"
printf '%s\n' '{"preserve":"this file"}' > "$temporary/picker-home/settings.json"
sh "$temporary/$picker_bundle/check-install-targets.sh" "$temporary/picker-home"
mkdir "$temporary/picker-home/mods"
cp -R "$temporary/$picker_bundle/mods/muxcle-picker" "$temporary/picker-home/mods/"
HERDR_APP_HOME="$temporary/picker-home" herdr-app check "$temporary/picker-home/mods/muxcle-picker"
cmp "$temporary/expected-settings.json" "$temporary/picker-home/settings.json"

history_bundle="muxcle-history-v$version"
mkdir "$temporary/history-home"
tar -xzf "dist/$history_bundle.tar.gz" -C "$temporary"
printf '%s\n' '{"unrelated":"keep"}' > "$temporary/history-home/shared.json"
sh "$temporary/$history_bundle/check-install-targets.sh" "$temporary/history-home"
mkdir "$temporary/history-home/mods"
cp -R "$temporary/$history_bundle/mods/muxcle-history" "$temporary/history-home/mods/"
HERDR_APP_HOME="$temporary/history-home" herdr-app check "$temporary/history-home/mods/muxcle-history"
python3 -c 'import json,sys; assert json.load(open(sys.argv[1]))["unrelated"] == "keep"' "$temporary/history-home/shared.json"

rotation_bundle="muxcle-rotation-v$version"
mkdir "$temporary/rotation-home"
tar -xzf "dist/$rotation_bundle.tar.gz" -C "$temporary"
sh "$temporary/$rotation_bundle/check-install-targets.sh" "$temporary/rotation-home"
mkdir "$temporary/rotation-home/mods"
cp -R "$temporary/$rotation_bundle/mods/muxcle-rotation" "$temporary/rotation-home/mods/"
HERDR_APP_HOME="$temporary/rotation-home" herdr-app check "$temporary/rotation-home/mods/muxcle-rotation"
