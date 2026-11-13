# Herdr setup

The original dotfiles Herdr setup, copied without runtime changes into `herdr/`.

- `herdr/mods/`: the original JavaScript mods, Python helpers, metadata and assets.
- `herdr/keys.json`, `herdr/layouts/`, `herdr/themes/`: the original configuration.
- `herdr/tests/`: the original behavior tests.

There is no TypeScript compilation, capability packaging, generated runtime or npm installation. Herdr loads the JavaScript directly. Keep whole mod directories together; do not link individual JavaScript files outside their module folder.

The runtime was copied from dotfiles commit `b5417a09`, subtree `nix/shared/herdr` (`cbaf9a1d5ebf27f8aba3e3f99d13cd7b87d34242`). Runtime files, module IDs, shortcuts, state keys and helper arguments remain unchanged; documentation uses the current repository paths. See the [setup and shortcut guide](herdr/README.md), including existing system-tool and personal-path requirements.

Dotfiles pins this repository and links its files into Herdr. Run installation commands from the dotfiles checkout; run the development checks below from this checkout. No build step is needed. Mutable settings and runtime data do not belong in this checkout and must not be replaced.

## Development checks

Run `make gate` with Node.js and Python 3. These tools are only for tests, not a runtime build. Checks parse JavaScript and run the original runtime tests without starting Herdr or capturing terminals.

`herdr/tests/test_install.py` is retained as original dotfiles installation-policy reference, not run here: it assumes the dotfiles directory structure. Installation tests run in dotfiles instead. Do not reformat or adapt the copied runtime while restoring this baseline.
