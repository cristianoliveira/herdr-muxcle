# Navigation history

**Recipe:** behavior and design brief for recreating this capability. To deploy the released files into an existing setup, follow [Installation](INSTALLATION.md) instead. Reading this recipe is not an instruction to install or activate anything.

An optional non-focusable Herdr observer that remembers the last two visited spaces and the last two visited tabs independently in each space. Repeating a last-tab or last-space command toggles between the two observed targets.

The design requires exactly one observer block in the active personal layout. History tracks focus changes while mounted, including changes made through native shortcuts, the sidebar, or other pickers. Inactive spaces do not record unseen tab selections. Missing spaces/tabs are pruned from history.

Optional shortcuts: Ctrl-a Shift-L for the last space; Ctrl-a Ctrl-R or Ctrl-a Tab for the last tab. With no previous target, no navigation occurs and a notice is posted.

The mod persists only space/tab IDs under its own shared-state key, `muxcle-history.v1`. It does not create, close, or reorder anything; run programs; scan files; or access the network. Requires Herdr 0.1.13, but no other Muxcle package, Python, or Node.js.
