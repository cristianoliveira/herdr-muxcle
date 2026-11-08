# Herdr Muxcle scaffold

A small personal layout with the shipped Spaces and Tabs modules and a custom status row. The row says “Muxcle scaffold — no tmux bindings installed.” This package is an installation baseline, not a tmux compatibility implementation.

## What you see

A 240 px Spaces block on the left. The right side has the shipped Tabs strip, active tab with Herdr's shipped pane header, and a 28 px Muxcle status row at the bottom.

## How it behaves

The layout uses normal Herdr spaces, tabs, terminals, and panes. The status row is static. No shortcuts, commands, filesystem access, network access, or background work are added.

## Built from

- `layouts/muxcle.json` references shipped `spaces`, `tabs`, and `pane` mods plus this package's `muxcle-compat` mod.
- `mods/muxcle-compat/main.js` is compiled from `main.ts`; it extends Herdr's `View` and returns one string.
- `mod.json` places the mod in the layout rather than docking a copy as a panel.

## Watch out

The layout is a complete window layout, not a patch to the current one. Select it only after installing; switch back with `ctrl-shift-l`. It does not rebind keys or migrate settings. Tested with Herdr 0.1.13. Herdr's core remains shared; `HERDR_APP_HOME` is not a core sandbox.

## Done when

- `herdr-app check <installed-home>/mods/muxcle-compat` passes.
- The Muxcle status row is visible when the `muxcle` layout is selected.
- Existing keys, settings, runtime state, and terminals remain untouched.
