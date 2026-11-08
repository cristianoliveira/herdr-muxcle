# Herdr Sessionizer

Sessionizer is an optional native Herdr popup for choosing a project folder and opening it in one local Herdr space. It discovers immediate, non-hidden child directories beneath the roots you configure. It does not start an agent or create a terminal fleet.

Configure absolute root paths in `data/muxcle-sessionizer/config.json`. Search matches folder names fuzzily and paths by exact or substring matches. Use the arrow keys or Ctrl-J/Ctrl-K to move, Enter or a click to open, and Esc to cancel.

When a project is selected, Sessionizer rechecks the current local spaces and selects one already using the same canonical folder. Otherwise it asks Herdr to create one local space for that folder. Spaces on other machines are not reused. Herdr creates the space's initial native tab.

The mod requires Herdr 0.1.13 and `python3` on `PATH`. It reads the config and scans only the configured roots when opened. It writes no config or project files and makes no network requests. The config example starts with an empty root list; no default project path is assumed.
