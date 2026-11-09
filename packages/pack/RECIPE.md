# Muxcle whole pack

An optional complete Muxcle distribution for a setup you manage yourself. Vendor the extracted folder in your dotfiles, review the files, and decide how to deploy them. It does not install or activate anything automatically.

Includes Tmux keys, Rotation, Sizing, History, Picker, Sessionizer, and the optional original scaffold. The individual packages remain available; installing them first is not required.

The combined keymap contains the component packages' existing bindings. It is a Muxcle preset, not a merge with your personal bindings. The `muxcle-pack` layout mounts one History observer and one command host each for Rotation and Sizing, using Herdr's native Spaces/Tabs/pane views. It does not show the scaffold's static “no tmux bindings installed” message.

Requires Herdr 0.1.13, Python 3, and `hc` with versioned document support available on Herdr's PATH. Sessionizer project roots remain your choice. No Node.js, npm, compiler, Git, or repository checkout is required to use the released files.

Keep Herdr runtime state and caches out of the dotfiles payload. The pack does not include personal settings, projects, terminals, credentials, or an automatic updater. Review updates in your dotfiles and replace your owned files deliberately.
