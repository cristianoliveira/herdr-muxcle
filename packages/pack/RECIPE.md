# Muxcle whole pack

**Recipe:** behavior and design brief for recreating this capability. To deploy the released files into an existing setup, follow [Installation](INSTALLATION.md) instead. Reading this recipe is not an instruction to install or activate anything.

An optional complete Muxcle composition for a user-owned setup. Recreate the component behaviors as one coherent collection while keeping each capability independently usable. Distribution and dotfiles deployment belong to the installation guide.

Includes Tmux keys, Rotation, Sizing, History, Picker, Sessionizer, and the optional original scaffold. The individual packages remain available; installing them first is not required.

The combined keymap contains the component packages' existing bindings. It is a Muxcle preset, not a merge with your personal bindings. The `muxcle-pack` layout mounts one History observer and one command host each for Rotation and Sizing, using Herdr's native Spaces/Tabs/pane views. It does not show the scaffold's static “no tmux bindings installed” message.

Requires Herdr 0.1.13, Python 3, and `hc` with versioned document support available on Herdr's PATH. Sessionizer project roots remain your choice. No Node.js, npm, compiler, Git, or repository checkout is required to use the released files.

## Recreate the composition

Use native Spaces, Tabs, and terminal pane views. Combine the component recipes under `components/` in the release, or the sibling package recipes in this repository. Keep their command names, key actions, helper boundaries, and failure behavior. Preserve component ownership and keep the original scaffold separate from the active complete layout.

The pack has no personal settings, project paths, terminals, credentials, or updater. Project discovery runs only for user-configured roots; pane helpers address the intended core. Recreating it must not change live configuration or runtime state.

## Done when

- All component behaviors match their recipes and remain independently usable.
- The complete layout contains exactly one History observer and one Rotation/Sizing host, with no scaffold status row.
- Combined key actions match component snippets without collisions.
- Pure checks and isolated initial-load checks pass; these do not imply complete keyboard or UI verification.
