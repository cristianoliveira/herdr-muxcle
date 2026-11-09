# Equalize pane shares

An optional Herdr capability that equalizes flexible sibling shares in each row and column of the focused terminal tab. Nested groups are balanced independently; this does not promise identical terminal pixel areas across an uneven tree. Pane order, IDs, terminal content, focus, other tabs, and unrelated document fields stay unchanged.

Mount exactly one shown, non-focusable host.json block in a personal layout. The optional Ctrl-a = shortcut invokes muxcle-sizing.equalize. This is a tmux-inspired layout tool, not tmux cell-by-cell directional resizing. It needs no rotation or other Muxcle package.

Only ordinary, unzoomed terminal layouts are supported. Equal sibling groups are left intact, including existing constraints. If balancing an unequal group would change fixed-pixel sizing, min/max constraints or a non-resizable node, the whole operation is refused instead of discarding constraints. Hidden/mod panes, replaced terminal views, ambiguous sizing, and stale identities are also refused. A single pane and an already-equal layout are no-ops.

A successful change uses one version-checked core document write for the original tab and machine. Conflicts and uncertain acknowledgements are not retried. Repeated shortcuts are ignored while an operation is pending. Navigation or host removal does not cancel an already-started helper; the original tab may still change, but no focus command is issued. Inspect pane shares before repeating an uncertain operation.

Requires Herdr 0.1.13, Python 3 and hc with versioned doc.get/doc.set support on Herdr's PATH. The CLI must address the same core/session as the app; keep HC_SESSION consistent for isolated or custom sessions. No repository checkout, Node.js, Git, project-file access, new terminals, or persistent feature state is required. Preserve existing layouts, settings and bindings; review conflicts before installing optional snippets.
