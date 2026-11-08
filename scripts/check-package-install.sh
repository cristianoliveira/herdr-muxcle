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
