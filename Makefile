SHELL := /bin/sh

.PHONY: gate watch lint build test hooks-install hooks-check format coverage security herdr-check

gate:
	@./scripts/quality-gate.sh

lint:
	@./node_modules/.bin/tsc --noEmit --project tsconfig.json
	@set -e; files=$$(for root in src fixtures mods; do if test -d "$$root"; then find "$$root" -type f \( -name '*.js' -o -name '*.mjs' -o -name '*.cjs' \) -print; fi; done); for file in $$files; do node --input-type=module --check < "$$file"; done

build:
	@./node_modules/.bin/tsc --project tsconfig.json

test: build
	@set -e; files=$$(for root in src fixtures mods; do if test -d "$$root"; then find "$$root" -type f -name '*.test.mjs' -print; fi; done); if test -n "$$files"; then node --test $$files; fi

watch:
	@fzz --config watch.yaml watch

hooks-install:
	@git config core.hooksPath .githooks

hooks-check:
	@test "$$(git config --get core.hooksPath)" = .githooks || { echo 'Hooks are not installed. Run: make hooks-install' >&2; exit 1; }
	@for hook in pre-commit pre-push commit-msg; do test -x .githooks/$$hook || { echo "Missing or non-executable hook: .githooks/$$hook" >&2; exit 1; }; done

# Explicit checks, intentionally outside the normal gate.
format:
	@echo 'No formatter is configured yet.'

coverage: build
	@node --test --experimental-test-coverage src/lib/example.test.mjs

security:
	@npm audit --package-lock-only

herdr-check: build
	@tmp=$$(mktemp -d); trap 'rm -rf "$$tmp"' EXIT HUP INT TERM; cp -R .build/fixtures/herdr-mod/. "$$tmp/"; cp fixtures/herdr-mod/mod.json "$$tmp/"; herdr-app check "$$tmp"
