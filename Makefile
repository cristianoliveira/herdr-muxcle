SHELL := /bin/sh

.PHONY: gate watch lint test hooks-install hooks-check format coverage security herdr-check

gate:
	@./scripts/quality-gate.sh

lint:
	@set -e; files=$$(for root in src fixtures mods; do if test -d "$$root"; then find "$$root" -type f \( -name '*.js' -o -name '*.mjs' -o -name '*.cjs' \) -print; fi; done); for file in $$files; do node --input-type=module --check < "$$file"; done

test:
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

coverage:
	@node --test --experimental-test-coverage src/lib/example.test.mjs

security:
	@echo 'No dependency audit is configured; this project currently has no package dependencies.'

herdr-check:
	@tmp=$$(mktemp -d); trap 'rm -rf "$$tmp"' EXIT HUP INT TERM; cp -R fixtures/herdr-mod/. "$$tmp/"; herdr-app check "$$tmp"
