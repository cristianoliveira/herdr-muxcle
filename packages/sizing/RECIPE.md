# Pane sizing

**Recipe:** behavior and design brief for recreating this capability. To deploy the released files into an existing setup, follow [Installation](INSTALLATION.md) instead. Reading this recipe is not an instruction to install or activate anything.

An optional Herdr capability for equalizing split shares and adjusting width/height weights in an ordinary terminal tab. Pane order, IDs, terminal content, focus, other tabs, and unrelated document fields stay unchanged. This is a tmux-inspired proportional layout tool, not tmux cell-based resizing.

The design requires exactly one shown, non-focusable command host in the active personal layout. The optional Ctrl-a = shortcut invokes muxcle-sizing.equalize. Commands: muxcle-sizing.help, equalize, grow-width, shrink-width, grow-height, and shrink-height (all with the same muxcle-sizing prefix). These are command names, not installation steps. No resize shortcuts are part of the default snippet. Help opens a readable, closeable native dialog without a snapshot or core operation; Close or Escape returns to the existing pane.

Equalize balances flexible sibling shares recursively. Nested groups are balanced independently; this does not promise identical terminal pixel areas across an uneven tree. Already-equal groups remain intact, including their constraints. Changing an unequal group with fixed-pixel, min/max or non-resizable constraints is refused instead of discarding them.

Grow/shrink selects the nearest ancestor row for width or column for height with multiple children. It multiplies only the containing branch's weight by 1.1 to grow or divides by 1.1 to shrink, subject to native rounding/progress limits. Other sibling weights stay unchanged. Other panes within that branch may share its axis change. The entire selected group must be flexible and unconstrained; a constrained nearest split is refused rather than skipped. A single pane, missing axis or unrepresentable/no-progress resize is a no-op.

Only ordinary, unzoomed terminal layouts are supported. Hidden/mod panes, replaced terminal views, ambiguous sizing, and stale identities refuse. Every change uses at most one version-checked document write for the original tab and machine. Conflicts and uncertain acknowledgements are not retried. Repeated sizing commands are ignored while an operation is pending. Navigation or host removal does not cancel an already-started helper; the original tab may still change, but no focus command is issued. Inspect pane shares before repeating an uncertain operation.

Requires Herdr 0.1.13, Python 3 and hc with versioned doc.get/doc.set support on Herdr's PATH. The CLI must address the same core/session as the app; keep HC_SESSION consistent for isolated or custom sessions. No rotation or other Muxcle package, repository checkout, Node.js, Git, project-file access, new terminals, or persistent feature state is required. Recreation must preserve unrelated layouts, settings, bindings, and runtime state.
