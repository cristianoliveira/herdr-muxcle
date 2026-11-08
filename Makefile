SHELL := /bin/sh

.PHONY: gate lint test hooks-install hooks-check format coverage security herdr-check

gate:
	@./scripts/quality-gate.sh

lint:
	@node --check src/lib/example.js

test:
	@node --test src/lib/example.test.mjs

hooks-install:
	@git config core.hooksPath .githooks

hooks-check:
	@test "$$(git config --get core.hooksPath)" = .githooks || { echo 'Hooks are not installed. Run: make hooks-install' >&2; exit 1; }

# Explicit checks, intentionally outside the normal gate.
format:
	@echo 'No formatter is configured yet.'

coverage:
	@node --test --experimental-test-coverage src/lib/example.test.mjs

security:
	@echo 'No dependency audit is configured; this project currently has no package dependencies.'

herdr-check:
	@herdr-app check "$(CURDIR)/fixtures/herdr-mod"
