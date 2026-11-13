SHELL := /bin/sh

MODULE_DIRS := $(shell node scripts/mod-directories.mjs)

.PHONY: gate lint test watch

gate:
	@./scripts/quality-gate.sh

lint:
	@set -eu; test -n "$(MODULE_DIRS)" || { echo 'No tracked mods/*/main.js entrypoints found.' >&2; exit 1; }; find scripts tests $(MODULE_DIRS) -type f \( -name '*.js' -o -name '*.mjs' \) -exec node --experimental-default-type=module --check {} \;

test:
	@set -eu; test -n "$(MODULE_DIRS)" || { echo 'No tracked mods/*/main.js entrypoints found.' >&2; exit 1; }; set --; for file in tests/*.test.mjs scripts/*.test.mjs; do [ -f "$$file" ] && set -- "$$@" "$$file"; done; for module in $(MODULE_DIRS); do for file in "$$module"/*.test.mjs; do [ -f "$$file" ] && set -- "$$@" "$$file"; done; done; node --experimental-default-type=module --test "$$@"
	@set -eu; for file in tests/test_*.py; do [ -f "$$file" ] || continue; name=$$(basename "$$file"); if [ "$$name" = test_install.py ]; then continue; fi; TMPDIR=/tmp python3 -B -m unittest discover -s tests -p "$$name"; done

watch:
	@fzz --config .watch.yaml watch
