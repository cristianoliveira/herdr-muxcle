#!/bin/sh
set -eu

mode=fresh
case "${1:-}" in
  --update) mode=update; shift ;;
  --remove) mode=remove; shift ;;
  --*) echo 'Usage: sh check-install-targets.sh [--update|--remove] APP_HOME' >&2; exit 2 ;;
esac
app_home=${1:?Usage: sh check-install-targets.sh [--update|--remove] APP_HOME}
if [ "$#" -ne 1 ]; then
  echo 'Usage: sh check-install-targets.sh [--update|--remove] APP_HOME' >&2
  exit 2
fi
while [ "$app_home" != "/" ] && [ "${app_home%/}" != "$app_home" ]; do
  app_home=${app_home%/}
done
case "$app_home" in
  /*) ;;
  *) echo "Pass an absolute Herdr app-home path: $app_home" >&2; exit 1 ;;
esac
if [ "$app_home" = "/" ]; then
  echo "Refusing the filesystem root as Herdr app-home." >&2
  exit 1
fi
mods="$app_home/mods"
target="$mods/muxcle-image-preview"
marker="$target/package-owner.json"
expected='{"package":"muxcle-image-preview","schema":1}'

for path in "$app_home" "$mods" "$target"; do
  if [ -L "$path" ]; then
    echo "Refusing linked Herdr app-home path: $path" >&2
    exit 1
  fi
done

if [ "$mode" = fresh ]; then
  if [ -e "$target" ]; then
    echo "Refusing to overwrite existing path: $target; review the update instructions." >&2
    exit 1
  fi
  exit 0
fi

if [ ! -d "$target" ]; then
  echo "Expected the installed Image preview folder at: $target" >&2
  exit 1
fi
if [ -L "$marker" ] || [ ! -f "$marker" ]; then
  echo "Refusing unmarked Image preview path: $target" >&2
  exit 1
fi
if ! printf '%s\n' "$expected" | cmp -s - "$marker"; then
  echo "Refusing Image preview path with an unexpected ownership marker: $target" >&2
  exit 1
fi
