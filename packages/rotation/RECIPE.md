# Pane rotation

An optional Herdr mod that advances terminal panes one position in the focused tab: `[A, B, C]` becomes `[C, A, B]`. Focus returns to the incoming terminal at the original screen position only while the original focus context and pane identities still match. Mount exactly one non-focusable command-host block from host.json in a personal layout. The optional shortcut is Ctrl-a Ctrl-o.

Two panes use native swaps without a helper. Three to 64 panes, including nested row/column grids, use a Python helper and one version-checked update to the original tab's machine-scoped Herdr core document. Slot sizes and constraints stay in place; pane IDs and terminal content move together. Unrelated tabs, containers, and document fields are preserved.

The helper validates the requested pane order and terminal identities before writing and never retries a version conflict. Duplicate shortcuts are ignored while an update is pending. Navigation away or host removal suppresses later focus restoration but cannot undo an in-flight document write. Transport or acknowledgement failures can leave the write outcome uncertain; inspect panes before repeating.

A single pane is a no-op. Mod panes, zoomed/replaced terminals, hidden or unsupported tree shapes, stale snapshots, and oversized inputs are refused. No path retries failed native swaps through the document adapter. This is rotation, not resizing or equalization.

Requires Herdr 0.1.13. Larger rotations also need Python 3 and hc with versioned document API support on Herdr's PATH. The mod creates no terminals or persistent feature state and accesses no project files. The helper communicates only with the selected core, including its configured machine route when applicable. No other Muxcle package, Node.js, Git, or repository checkout is required.
