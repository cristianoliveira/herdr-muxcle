# Recipe: Tmux keys for Herdr

**Recipe:** behavior and design brief for recreating this capability. To deploy the released files into an existing setup, follow [Installation](INSTALLATION.md) instead. Reading this recipe is not an instruction to install or activate anything.

A set of explicit tmux-inspired shortcuts expressed through native Herdr commands in a `keys.json` snippet. This package contains only the key snippet and docs.

## Bindings

- `ctrl-a c`: create a tab.
- `ctrl-a n` / `ctrl-a p`: previous / next tab.
- `ctrl-a 1` through `ctrl-a 9`: select a tab by position.
- `ctrl-a w` / `_`: split down; `ctrl-a v` / `|`: split right.
- `ctrl-a ctrl-h/j/k/l`: focus left/down/up/right.
- `ctrl-a ctrl-f` / `z`: zoom the focused pane.
- `ctrl-a ,`: ask Herdr to rename the tab.
- `ctrl-a ctrl-a` in terminal context: send U+0001 to the terminal program.

The previous/next order is deliberate: `n` moves backward and `p` forward. These are explicit Herdr key sequences, not tmux's repeat-table or modal prefix state. Existing terminal or layout-specific bindings can take precedence over a global binding. The snippet defines only these bindings, not an entire personal key map. Conflict resolution and merging belong to the installation guide.
