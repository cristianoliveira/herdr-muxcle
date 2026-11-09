# Spaces and tabs picker

**Recipe:** behavior and design brief for recreating this capability. To deploy the released files into an existing setup, follow [Installation](INSTALLATION.md) instead. Reading this recipe is not an instruction to install or activate anything.

An optional Herdr popup that searches existing spaces and tabs. Compact fuzzy queries match ordered characters across the space and tab names, ignoring case and whitespace. Quiet spaces remain visible; empty spaces are selectable.

Use arrows or Ctrl-J/K to move, Enter or a click to select, and Escape to cancel. Results keep Herdr's native ordering, not most-recent-first ordering. The current tab is selected initially when visible. Both local and connected remote spaces use their existing native IDs.

The picker does not create or close tabs, spaces, or terminals. It does not track history, scan files, run programs, or access the network. It requires Herdr 0.1.13, but no Python, Node.js, custom layout, or other Muxcle package. The optional shortcut is Ctrl-a Ctrl-b.
