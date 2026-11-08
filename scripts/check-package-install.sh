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
