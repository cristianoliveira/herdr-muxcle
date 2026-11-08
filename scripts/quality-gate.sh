#!/bin/sh
set -u

output=$(mktemp)
trap 'rm -f "$output"' EXIT HUP INT TERM

if make --no-print-directory lint test >"$output" 2>&1; then
  printf 'true\n'
  exit 0
else
  status=$?
fi

printf 'false\n'
tail -n 20 "$output" >&2
exit "${status:-1}"
