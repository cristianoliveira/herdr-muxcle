SHELL := /bin/sh

.PHONY: gate lint test watch

gate:
	@./scripts/quality-gate.sh

lint:
	@set -e; find herdr scripts -type f \( -name '*.js' -o -name '*.mjs' \) -print | while IFS= read -r file; do node --experimental-default-type=module --check "$$file"; done

test:
	@set -e; files=$$(find herdr -type f -name '*.test.mjs' -print); node --experimental-default-type=module --test $$files
	@set -e; for file in herdr/tests/test_*.py; do name=$$(basename "$$file"); if [ "$$name" = test_install.py ]; then continue; fi; TMPDIR=/tmp python3 -B -m unittest discover -s herdr/tests -p "$$name"; done

watch:
	@fzz --config .watch.yaml watch
