# Two-pane rotation

An optional Herdr mod that swaps the two ordinary terminal panes of the focused tab, then focuses the incoming terminal at the original screen position. Both horizontal and vertical two-pane splits are supported, from either focused pane. Sizing follows Herdr's native swap behavior; this is not pane equalization or resizing.

Mount exactly one non-focusable command-host block from host.json in a personal layout. The optional Ctrl-a Ctrl-o shortcut invokes muxcle-rotation.rotate. A single pane is a no-op. Larger layouts, zoomed tabs, replaced terminals, mod panes, and inconsistent snapshots are refused before dispatch.

Uses only native pane.swap and pane.focus commands in one synchronous script turn. It does not rewrite core documents, run programs, persist data, or require Python, Node.js, or other Muxcle packages. Requires Herdr 0.1.13. Native failures can leave a partial result; there is no rollback or automatic retry.
