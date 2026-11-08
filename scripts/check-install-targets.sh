#!/bin/sh
set -eu

mode=fresh
if [ "${1:-}" = "--update" ]; then
  mode=update
  shift
fi
app_home=${1:?Usage: sh check-install-targets.sh [--update] APP_HOME}

for path in \
  "$app_home" \
  "$app_home/layouts" \
  "$app_home/mods" \
  "$app_home/layouts/muxcle.json" \
  "$app_home/mods/muxcle-compat"
do
  if [ -L "$path" ]; then
    echo "Refusing linked Herdr app-home path: $path" >&2
    exit 1
  fi
done

if [ "$mode" = fresh ]; then
  for target in "$app_home/layouts/muxcle.json" "$app_home/mods/muxcle-compat"; do
    if [ -e "$target" ]; then
      echo "Refusing to overwrite existing path: $target; review the update instructions." >&2
      exit 1
    fi
  done
fi
