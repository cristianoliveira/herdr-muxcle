SHELL := /bin/sh

.PHONY: gate watch lint build test package release-plan release-tag release-ci release-check hooks-install hooks-check format coverage security herdr-check e2e e2e-help dev-help

gate:
	@./scripts/quality-gate.sh

lint:
	@./node_modules/.bin/tsc --noEmit --project tsconfig.json
	@set -e; files=$$(for root in src fixtures mods scripts; do if test -d "$$root"; then find "$$root" -type f \( -name '*.js' -o -name '*.mjs' -o -name '*.cjs' \) -print; fi; done); for file in $$files; do node --input-type=module --check < "$$file"; done
	@python3 -B scripts/validate_agents_links.py .
	@python3 -B scripts/validate_agents_landmarks.py .

build:
	@./node_modules/.bin/tsc --project tsconfig.json

test: build
	@set -e; files=$$(for root in src fixtures mods scripts; do if test -d "$$root"; then find "$$root" -type f -name '*.test.mjs' -print; fi; done); if test -n "$$files"; then node --test $$files; fi
	@python3 -B -m unittest discover -s mods/muxcle-sessionizer -p 'test_*.py'
	@python3 -B -m unittest discover -s mods/muxcle-rotation -p 'test_*.py'
	@python3 -B -m unittest discover -s mods/muxcle-sizing -p 'test_*.py'
	@python3 -B -m unittest discover -s mods/muxcle-broadcast-prototype -p 'test_*.py'
	@python3 -B -m unittest discover -s mods/muxcle-port-process-picker -p 'test_*.py'
	@python3 -B -m unittest discover -s mods/muxcle-image-preview -p 'test_*.py'
	@python3 -B -m unittest discover -s mods/muxcle-port-forward -p 'test_*.py'
	@python3 -B -m unittest discover -s tests/e2e -p 'test_*.py'

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
	@node --test --experimental-test-coverage src/lib/example.test.mjs src/lib/keymap-merge.test.mjs mods/muxcle-sessionizer/*.test.mjs mods/muxcle-picker/*.test.mjs mods/muxcle-history/*.test.mjs mods/muxcle-rotation/*.test.mjs mods/muxcle-sizing/*.test.mjs mods/muxcle-tab-tools/*.test.mjs scripts/package.test.mjs scripts/dev-loop.test.mjs scripts/release-plan.test.mjs

security:
	@npm audit --package-lock-only

package: build
	@node scripts/package.mjs

herdr-check: package
	@./scripts/check-package-install.sh

e2e: package
	@python3 -B tests/e2e/run.py $(E2E_ARGS)

e2e-help:
	@python3 -B tests/e2e/run.py --help

dev-help:
	@node scripts/dev-loop.mjs help

release-plan:
	@node scripts/release-plan.mjs

release-tag:
	@test -n "$(TAG)" || { echo 'Set TAG, for example: make release-tag TAG=v0.2.0' >&2; exit 1; }
	@node scripts/release-tag.mjs "$(TAG)"

release-ci:
	@make gate
	@make security
	@make package

release-check: release-ci
	@make herdr-check
