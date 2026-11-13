# Herdr Term

Original JavaScript mods for familiar tmux workflows in Herdr. Select a mod, or compose them with a recipe; no capability-package layer or TypeScript compilation.

## Choose a recipe

| Recipe | What it adds |
| --- | --- |
| [Tmux workspace](recipes/tmux/RECIPE.md) | Optional composition of all original mods, layout, theme and reviewed bindings |
| [Tmux behavior host](recipes/tmux-compat/RECIPE.md) | Original combined history, tab, pane and helper-popup workflows |
| [Project picker](recipes/project-picker/RECIPE.md) | Projects under local and connected machines' home roots |
| [Space/tab picker](recipes/tmux-picker/RECIPE.md) | Search, navigate, create and directly close tabs |
| [Intray](recipes/intray/RECIPE.md) | Observed agent completions and requests for input |
| [Funzzy status](recipes/funzzy-status/RECIPE.md) | Feedback from existing project watchers |
| [Image preview](recipes/image-preview/RECIPE.md) | Full-window image viewer |
| [Port forwarding](recipes/port-forward/RECIPE.md) | Explicitly managed, owned SSH tunnels |
| [Numbered spaces](recipes/number-spaces/RECIPE.md) / [agents](recipes/number-agents/RECIPE.md) | Compact status-colored sidebar clones |
| [Pane footer](recipes/pane-footer/RECIPE.md) | Pane-specific program, folder, branch and controls |
| [Computer status/clock](recipes/tmux-status/RECIPE.md) | Machine and agent counts, or local date/time |
| [Tabs/panels](recipes/tmux-tabs/RECIPE.md) | Original tab bar and Files/Changes controls |

Each recipe describes the actual files: what you see, how it behaves, what it uses, limits and acceptance checks. A behavior inside `tmux-compat` is not advertised as an independently split mod. Optional dependencies and mounted hosts/observers are explicit.

## Add it to Herdr

Give your Herdr agent the selected recipe and matching ready-to-use files. Read both before changing anything. Copy selected whole `mods/<id>/` directories, review name conflicts, merge chosen shortcuts, and fit optional blocks into the existing layout. Never silently replace a keymap, layout, settings or runtime data. Disclose program execution, clipboard/file access and remote queries before activation.

Herdr's sharing format is an app-home-shaped folder with `RECIPE.md`, a genuine `preview.png`, selected `mods/`, and optional keys/layout/theme files. The recipe is also a rebuild brief if the supplied implementation cannot fit the recipient's Herdr version. Distribution archives carry JavaScript directly: users need no npm install, compiler or source clone. Feature-specific programs such as Python, Git, Neovim, Funzzy or SSH are listed in the recipes.

**Current entries are drafts:** verified screenshots of the restored original UI are not available. Complete release assembly must reject a missing preview. Older published archives contain the earlier adapted implementations; they are not releases of this flat original-mod tree. No gallery availability or native-flow success is claimed here.

See [source layout and delivery](recipes/README.md) and the [setup/shortcut reference](SETUP.md). Dotfiles can pin and link this repository, but are not required to install a distributed entry.

## Repository layout

- `mods/`: original native JavaScript mods, Python helpers, metadata and assets.
- `recipes/`: behavior/rebuild briefs and explicit mod/config selections; no duplicate runtime implementations.
- `layouts/`, `themes/`, `keys.json`: optional original composition, palette and binding reference.
- `tests/`: original behavior tests; some mod tests remain beside their helper.
- `scripts/`: development checks and direct-file release assembly, not runtime behavior.

Keep helpers inside their mod by default. Add shared source only for demonstrated reuse, after verifying the native loader and ensuring every delivered mod has its dependencies. There is no mandatory `lib/`, build output or package ownership layer.

## Development

Run `make gate` with Node.js and Python 3. Checks do not start Herdr, access live terminals or run an installer. The retained `tests/test_install.py` is a historical dotfiles installation-policy reference, excluded here because it assumes the old dotfiles tree. A consuming dotfiles checkout owns its own installer tests.

Runtime/configuration content originates from dotfiles commit `b5417a09`, subtree `nix/shared/herdr` (`cbaf9a1d5ebf27f8aba3e3f99d13cd7b87d34242`). This repository relocates those files without changing runtime behavior, module IDs, shortcuts, helper arguments or state keys. Mutable state stays outside the source tree.
