# Muxcle whole pack

Use the supplied compiled implementation as your base. Read this recipe and the package files, then fit them to the person's Herdr version, layout, keys, and stated preferences. Preserve unrelated configuration and disclose helper execution, network access, and reads outside the mod folder. Ask before replacing files or bindings or activating a different layout. Rebuild from the design only if the supplied files cannot work or the person requests a different implementation.

## Behavior and design

An optional complete Muxcle composition for a user-owned setup. Recreate the component behaviors as one coherent collection while keeping each capability independently usable. The setup section below covers distribution and dotfiles deployment.

Includes Tmux keys, Rotation, Sizing, History, Picker, Sessionizer, and the optional original scaffold. The individual packages remain available; installing them first is not required.

The combined keymap contains the component packages' existing bindings. It is a Muxcle preset, not a merge with your personal bindings. The `muxcle-pack` layout mounts one History observer and one command host each for Rotation and Sizing, using Herdr's native Spaces/Tabs/pane views. It does not show the scaffold's static “no tmux bindings installed” message.

Requires Herdr 0.1.13, Python 3, and `hc` with versioned document support available on Herdr's PATH. Sessionizer project roots remain your choice. No Node.js, npm, compiler, Git, or repository checkout is required to use the released files.

## Included behavior and limits

- **Keys:** Ctrl-a then `c` creates a tab; `n` goes to the previous tab and `p` to the next; digits select tabs. `w`/`_` splits down, `v`/`|` splits right, Ctrl-h/j/k/l navigates panes, and `z`/Ctrl-f zooms. Ctrl-a Ctrl-a sends U+0001 in terminal context. These are explicit sequences, not a tmux prefix mode or repeat-table. Existing layout/terminal bindings may take precedence.
- **Picker:** Ctrl-a Ctrl-b opens fuzzy search over existing spaces/tabs, including quiet work. Arrows or Ctrl-j/k move; Enter/click selects; Escape cancels. Native ordering is preserved. No project scan, program execution, or network access.
- **Sessionizer:** Ctrl-a Ctrl-p searches immediate non-hidden directories under configured absolute roots. Selection reuses a local space with the same canonical folder or creates one native space/tab. Python scans only those roots; no config/project writes or network calls. Remote spaces are not reused.
- **History:** Ctrl-a Shift-L toggles last space; Ctrl-a Ctrl-r or Tab toggles last tab per space. Tracking requires the shown observer and two observed targets. It stores IDs under `muxcle-history.v1`, prunes missing targets, and does not launch programs or access the network.
- **Rotation:** Ctrl-a Ctrl-o maps `[A,B,C]` to `[C,A,B]` while preserving slot sizes. Two panes use native swaps; 3–64 use Python and one versioned core-document update. Unsupported/mod/zoomed panes and stale snapshots refuse. Focus restoration depends on unchanged context. No retry after conflict or uncertain acknowledgement; an in-flight write can finish after navigation.
- **Sizing:** Ctrl-a `=` recursively equalizes flexible sibling shares, not all terminal pixel areas. `muxcle-sizing.grow-width`, `shrink-width`, `grow-height`, and `shrink-height` multiply/divide the containing branch's nearest-axis weight by 1.1. Constraints, unsupported/zoomed trees, or stale identities refuse; no-progress changes do nothing. One versioned core write, no retry, no focus change. `muxcle-sizing.help` explains commands. Inspect the result before repeating an uncertain operation.

Rotation/Sizing helpers communicate with the intended core and preserve unrelated document fields. Pending commands are ignored; unmounting a host does not cancel an already-started helper. No component runs an agent fleet or reads account credentials. The optional scaffold is a separate static alternative, not an extra functional capability.

## Recreate the composition

Use native Spaces, Tabs, and terminal pane views. Use the supplied active mods, combined keymap, and composed layout as the base. This root recipe is the pack's single guide; `components/` contains supporting snippets and blocks, not additional guides. The repository's sibling recipes provide optional deeper component design detail. Keep their command names, key actions, helper boundaries, and failure behavior. Preserve component ownership and keep the original scaffold separate from the active complete layout.

The pack has no personal settings, project paths, terminals, credentials, or updater. Project discovery runs only for user-configured roots; pane helpers address the intended core. Recreating it must not change live configuration or runtime state.

## Done when

- All component behaviors match their recipes and remain independently usable.
- The complete layout contains exactly one History observer and one Rotation/Sizing host, with no scaffold status row.
- Combined key actions match component snippets without collisions.
- Pure checks and isolated initial-load checks pass; these do not imply complete keyboard or UI verification.

## Add this package to Herdr

For a published package, use its versioned archive and matching checksum; no source rebuild or development tooling is required. A GitHub source folder is an instruction entrypoint, not necessarily a compiled runtime payload. If a suitable release is unavailable, stop and explain what is missing rather than silently inventing a download or compiling on the user's machine.

**One download, managed by you.** `muxcle-pack` contains all Muxcle capabilities as ready-to-use files. It does not run an installer, change your keys, switch your layout, or update itself.

Individual packages remain available. The older `herdr-muxcle` archive is only the scaffold; the complete archive is named **`muxcle-pack-v<version>.tar.gz`**.

### Requirements

- Herdr 0.1.13, the tested app version.
- Python 3 and Herdr's core CLI, `hc`, on **Herdr's** PATH.
- Versioned core document support for Sizing and larger Rotations.
- The same core/session for the app and helpers; preserve `HC_SESSION` when using a custom session.

No Git, Node.js, npm, or compiler is required to use the archive. A dotfiles repository or manager is your choice, not a runtime dependency.

### 1. Download and keep your own copy

Choose a published tag from [GitHub Releases](https://github.com/cristianoliveira/herdr-muxcle/releases). Download `muxcle-pack-<tag>.tar.gz` and its matching `.sha256`. If no release exists yet, contributors can build with `make package` and use the archive in `dist/`.

The public `v0.1.0` release predates the whole pack. For example, after a newer `v0.1.1` release includes it, place both files in the current directory:

```sh
shasum -a 256 -c muxcle-pack-v0.1.1.tar.gz.sha256
tar -xzf muxcle-pack-v0.1.1.tar.gz
```

Stop if verification fails. Linux users can use `sha256sum -c` instead. Extract into a scratch directory, not over your live Herdr app home.

Copy the extracted folder into a location you own, for example:

```text
your-dotfiles/
  vendor/
    muxcle-pack/
      RECIPE.md
      manifest.json
      keys.json
      config.example.json
      layouts/
      mods/
      components/
      scaffold/
```

You can rename the extracted top-level folder. Keep `manifest.json` to identify the upstream version. Keep your customizations in your dotfiles commits so you can review them against the next release.

This recipe covers the complete tree. Supporting resources under `components/` retain the individual key snippets, observer/host blocks, and preflight scripts for reference. They are not independent extracted packages.

### Agent-assisted alternative

You can also ask your Herdr agent to read this guide, `RECIPE.md`, and the verified package files, explain helper execution and filesystem access, and fit the pack into your setup. Ask it to preserve existing settings and state, review key conflicts, and ask before replacing files or selecting a layout. This is Herdr's standard agent-assisted flow, not a custom installer. If you want dotfiles ownership, ask it to prepare your managed files there rather than changing the live app home directly.

### 2. Choose what your dotfiles deploy

| Pack content | Intended destination or use |
| --- | --- |
| `mods/*` | Matching folders under your Herdr app home's `mods/` |
| `layouts/muxcle-pack.json` | Personal layout under `layouts/`; mounts all required hosts/observer |
| `keys.json` | Combined Muxcle keymap: review/merge, or adopt as your owned replacement deliberately |
| `scaffold/layouts/` and `scaffold/mods/` | Original scaffold as an optional alternative, not needed for the complete setup |
| `config.example.json` | Starting point for your own `data/muxcle-sessionizer/config.json` |
| `components/*`, this recipe, and manifest | Supporting references to keep in your vendor folder; no need to deploy into Herdr |

Use your existing dotfile manager to copy or link selected files. For a Stow-style setup, place managed paths beneath `.config/herdr-app/` in your dotfiles package; the archive itself is not a prearranged Stow package. With Home Manager or another manager, declare the destination paths explicitly.

**Do not symlink the entire extracted folder as your app home.** Keep runtime state, caches, shared data, terminals, and credentials outside the vendored pack. Manage only the intended static files and your selected Sessionizer config. Package-specific preflight scripts are for standalone manual installs and can reject linked containers; they are not dotfile-manager deployment commands.

The combined keymap contains Muxcle bindings only, not every Herdr default or your personal mappings. Adopting it as `keys.json` replaces whatever bindings your deployment previously supplied. Review terminal/layout precedence and existing shortcuts first. No automatic merge happens.

Do not edit Herdr's shipped layouts. `muxcle-pack.json` is a separate personal composition. You can modify it in your dotfiles or adapt your existing personal layout, but keep exactly one History observer and one Rotation/Sizing host while using their commands.

### 3. Configure and activate deliberately

1. Deploy the chosen mod folders and configuration through your dotfiles.
2. Configure absolute project roots in `data/muxcle-sessionizer/config.json`, using the bundled example. The pack assumes no personal project paths.
3. Check initial loading with `HERDR_APP_HOME="$APP_HOME" herdr-app check "$APP_HOME/mods/<mod-name>"` for each deployed mod. Set `APP_HOME` explicitly first. For read-only deployments, check a writable scratch copy; Herdr's check can generate local helper files.
4. Select the **`muxcle-pack`** layout through Herdr's layout picker when you want the complete composition. Merely deploying the file does not select it.
5. Try selected shortcuts with harmless terminals. Visit two tabs/spaces before testing History; configure roots before using Sessionizer. Confirm the intended core and focused tab before Rotation or Sizing.

Initial-load checks are not proof of keyboard dispatch or feature completion. Herdr's core remains shared unless you explicitly configure a separate core/session; changing app home alone does not isolate terminals.

### 4. Replace or customize it yourself

For an update, verify and extract the new archive separately. Compare it with your vendored copy and review runtime files, keys, layout, and component behavior changes. Then replace your owned vendor tree in a dotfiles commit and redeploy through your manager. Keep your previous version for rollback. Avoid copying a new tree over an old tree blindly: removed upstream files could remain behind.

Keep project roots and personal settings separate from replaceable upstream files. If you update individual components independently, their existing package ownership markers remain intact; keep the manifest as the upstream baseline, not proof that a customized deployment still matches every byte.

To stop using the pack, first select another personal layout and remove or replace its shortcuts. Remove only the paths your dotfiles manager owns. Keep project roots, settings, unrelated mods, and all runtime state unless you deliberately choose otherwise.

Nothing in this package copies files to your live setup or performs these changes for you.
