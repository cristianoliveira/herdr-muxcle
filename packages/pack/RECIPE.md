# Muxcle whole pack

Use the supplied compiled implementation as your base. Read this recipe and the package files, then fit them to the person's Herdr version, layout, keys, and stated preferences. Preserve unrelated configuration and disclose helper execution, network access, and reads outside the mod folder. Ask before replacing files or bindings or activating a different layout. Rebuild from the design only if the supplied files cannot work or the person requests a different implementation.

## Behavior and design

An optional complete Muxcle composition for a user-owned setup. Recreate the component behaviors as one coherent collection while keeping each capability independently usable. The setup section below covers distribution and dotfiles deployment.

Includes Tmux keys, Rotation, Sizing, History, Agent attention inbox, Funzzy status, Numbered sidebars, Workspace chrome, Picker, Navigation repeat, Project popup, Keyboard copy mode, Tab tools, Sessionizer, Space closer, and the optional original scaffold. The individual packages remain available; installing them first is not required.

The combined keymap contains the component packages' existing bindings. It is a Muxcle preset, not a merge with your personal bindings. The `muxcle-pack` layout mounts one History observer and one command host each for Rotation, Sizing, and Tab tools, using Herdr's native Spaces/Tabs/pane views. Funzzy status is included as an optional component but is not mounted by the pack layout; add its 24 px observer block only when you want status polling. Workspace chrome is also included but not mounted: its bundled snippets cover pane headers, custom tabs/panels bars, a native combined bar, and axis-specific row/column clocks. See the snippet guide below and keep native workspace status unchanged. Remote monitoring remains off unless you deliberately set its `remote` prop to `true`. The Agent attention inbox remains an optional popup; add its observer block to your personal layout only when closed-popup capture is wanted. Navigation repeat, Project popup, and Keyboard copy mode open as native popups. Project popup is layout-free and waits for an explicit Run action; Keyboard copy mode captures the displayed terminal into a separate local viewer. The pack does not show the scaffold's static “no tmux bindings installed” message.

Requires Herdr 0.1.13, Python 3, and `hc` with versioned document support available on Herdr's PATH. Sessionizer project roots remain your choice. Project popup additionally needs POSIX `test` and `/bin/sh`, plus a user-provided executable `.tmp/popup` with a valid interpreter line in the focused project; that script is optional and is never started automatically. Keyboard copy mode additionally requires Herdr's shipped `peek` mod for its viewer header (do not copy or install `peek` separately), plus Neovim with its built-in OSC 52 clipboard helper. These helpers are required only when their feature is used; the standalone Tmux keys package remains helper-free. No Node.js, npm, compiler, Git, or repository checkout is required to use the released files.

## Included behavior and limits

- **Keys:** Ctrl-a then `c` creates a tab; `n` goes to the previous tab and `p` to the next; digits select tabs. `w`/`_` splits down, `v`/`|` splits right, Ctrl-h/j/k/l navigates panes, and `z`/Ctrl-f zooms. Ctrl-a Shift-r enters the optional navigation-repeat mode; `n`/`p` repeat tab movement and `h/j/k/l` or Ctrl-h/j/k/l move pane focus for up to 1.5 seconds of inactivity. Ctrl-a Ctrl-a sends U+0001 in terminal context. These are explicit sequences, not a transparent tmux repeat table. Existing layout/terminal bindings may take precedence.
- **Picker:** Ctrl-a Ctrl-b opens fuzzy search over existing spaces/tabs, including quiet work, by machine, label, and associated agent `program.name`/reported `app` names (not terminal titles). `local` is the stable alias for this computer. Search associates agent metadata by exact native space/tab IDs, not names. Native order is the default; `components/muxcle-picker/config.example.json` can be copied deliberately to opt into recent order. Recent mode uses the optional History observer's bounded live-tab MRU only when the current layout snapshot contains its visible block; otherwise missing/invalid state falls back to native order. This is configuration evidence, not proof the observer is healthy, so persisted visits may be stale. Arrows or Ctrl-j/k move; Enter/click selects; Escape cancels. Creation and selected-tab close are disabled by default; merge `management: true` into the picker config to add a separate action section and explicit close review. Remote tab/space actions need the additional `remoteSpaces: true` setting; only then does the picker query `hc machine ls --json`, and it rechecks connectivity before dispatch. It never discovers or connects peers. These commands are queued native requests, not execution acknowledgements; close review preserves native confirmation. The Picker does no project scan or program execution. Project popup separately executes only the focused project's script after explicit confirmation; that project code may access files or network resources available to Herdr.
- **Navigation repeat:** Ctrl-a Shift-r opens the native popup. It runs only allowlisted `tab.prev`, `tab.next`, and `pane.go` actions; Ctrl-n/p are not repeat aliases. Escape, Exit, timeout, and unsupported keys close it, and unmount cancels the timer. Unsupported keys are consumed; terminal passthrough is not promised.
- **Project popup:** Ctrl-a Space opens a launcher for the focused local project's `.tmp/popup`. It does not inspect or run the script until you choose **Run**. The script runs with your user permissions in a dedicated Herdr terminal overlay. The created terminal's core, address, argv, cwd, and ownership label are verified before display. Launch uncertainty blocks automatic retries. The package does not install a project script or require a mounted block/layout. It uses Herdr 0.1.13's shipped `peek` mod for keep-as-tab, go-to, and close controls; do not copy or install `peek` separately. Closing `peek` only dismisses the overlay and leaves the terminal running. Herdr 0.1.13 has no atomic ownership-guarded stop operation, so the mod never issues an automatic kill. Inspect and stop the terminal manually if desired; the unresolved receipt blocks duplicate launches until the terminal is gone.
- **Keyboard copy mode:** Ctrl-a `[` opens an explicit launcher; Enter starts capture. It reads up to 10,000 lines from Native's visible terminal (including qualified remote targets) into an 8 MiB-bounded snapshot. A timed-out history read can fall back once to the current screen, which is labelled. The separate local Neovim viewer uses Herdr's shipped `peek` header (do not copy/install it separately), disables user config, plugins, modelines, editing, and automatic clipboard integration; `q`/Esc exits and only explicit `y` writes the selection through local OSC 52, capped at 1 MiB. Undo history is disabled. The source terminal keeps running and receives no viewer input. The temporary file is private and removed on normal exit; a forced kill/crash can leave it behind. This config is not an editor sandbox, and Herdr cannot guarantee cleanup after a crash.
- **Tab tools:** Ctrl-a Alt-h/l moves the active tab left/right without wrapping; Alt-m prompts for a checked, zero-based position and revalidates the captured tab/space before converting to Herdr's one-based index. Escape cancels. Alt-r names the focused tab from its focused terminal's known cwd, including machine-qualified tabs, without local filesystem lookup. These use native `tab.move`/`tab.rename`; the existing manual `tab.rename` shortcut remains in the Tmux keys snippet. Herdr trims leading/trailing whitespace from native rename names.
- **Sessionizer:** Ctrl-a Ctrl-p searches immediate non-hidden directories under configured absolute roots. Local-only remains the default. Optional `remoteRoots` use exact configured Herdr machine names and native `hc exec` transport; the bundled scanner arrives over isolated stdin, and selection reuses or creates a space only on the same Core identity. Remote scan failures never fall back to local execution. Python is required locally and on opted-in remote machines; `hc` is needed only for remote roots. Results cache per permanent machine identity for 60 seconds and stale disconnected results cannot be opened. No project files or configuration are written.
- **Numbered sidebars:** The optional `muxcle-numbered-sidebars` component is included but not mounted by the pack layout. Its `components/muxcle-numbered-sidebars/layout-snippets.json` contains separate 40 px `spaces` and `agents` blocks; add either or both as siblings in your existing layout. Keep the native expanded `spaces` and `agents` blocks mounted for full management. Labels follow native snapshot order, not expanded priority/pin or next/prev navigation order; this component never calls `setAgentOrder`, changes sidebar width, adds keys, or writes settings.
- **Workspace chrome:** The optional `muxcle-workspace-chrome` component is included but not mounted. Its bundled `components/muxcle-workspace-chrome/layout-snippets.json` provides a pane-header branch fragment, custom `tabs-only-row` and `panels-only-row` bars, a `combined-native-tabs-row`, a custom combined bar that omits window controls, and local-clock row/column fragments. The native combined bar uses Herdr's standard panel IDs (`panel`, `panel-body`, `files`, `changes`) and leaves panel-preference persistence with Herdr's native `tabs` mod. Custom bars support configured panel IDs and add no second restoration controller; they follow `window().buttons` by default unless the custom combined fragment explicitly omits controls. The clock's 24 px size is height only under a column parent; the row fragment's weight is width only under a row parent. Preserve existing IDs, settings, native workspace status, and unrelated content. When reusing a node, back up its original fields and restore them on removal; merge only the selected snippet fields. The component adds no shortcut or observer and does not replace native pane controls.
- **Space closer:** Opens a review dialog for selected local or remote spaces. It freezes exact space, machine/Core, tab, and pane details, revalidates them before dispatch, and refuses stale or unavailable targets. Only the explicit confirmation button dispatches native `space.close`; terminal shutdown is asynchronous and completion remains unknown. It sends no automatic retry or rollback and installs no shortcut by default.
- **History:** Ctrl-a Shift-L toggles last space; Ctrl-a Ctrl-r or Tab toggles last tab per space. The shown observer tracks toggles and a separate bounded MRU of up to 256 live tab targets. It stores IDs under `muxcle-history.v1` and `muxcle-history.recent-tabs.v1`; the MRU is only consumed when Picker recency is explicitly enabled. It prunes missing targets and does not launch programs or access the network.
- **Agent attention inbox:** Ctrl-a Shift-I opens the popup. It keeps up to 100 unread done/blocked events and 1,000 bounded status/label records under its separate `muxcle-agent-intray.state.v1` key. Search and status filters do not read events. Enter queues focus to an exact live address and keeps the event unread; Ctrl-D dismisses one, while bulk dismissal requires a reviewed-ID confirmation. The pack layout does not mount its optional observer. Its bundle asset is `components/muxcle-agent-intray/observer.json`; add that one-pixel block to a personal layout for closed-popup capture. Without it, events are observed only while the popup is open; earlier transitions are not replayed. It does not read terminal contents, infer errors, or use tmux behavior.
- **Funzzy status:** The optional `components/muxcle-funzzy-status/observer.json` adds a 24 px row that polls existing local watchers and, only after opt-in, connected remote watchers. It requires control schema 1 and only calls `capabilities`/`status`; it never starts or controls jobs. It shows state, generation, and failure count for at most 64 monitored projects, and notifies once for each newly observed passed or failed generation with a bounded machine/project label; cancelled is display-only. Commands, output, failure details, and credentials are not shown or persisted. Initial and restart observations are silent; cursor metadata is bounded to 64 project identities. Local pane hints inspect at most 32 pane targets per refresh; a truncated scan disables unique focus. Clicking the row focuses only one exact local foreground match; multiple matches remain ambiguous. The pack layout deliberately does not mount it.
- **Rotation:** Ctrl-a Ctrl-o maps `[A,B,C]` to `[C,A,B]` while preserving slot sizes. Two panes use native swaps; 3–64 use Python and one versioned core-document update. Unsupported/mod/zoomed panes and stale snapshots refuse. Focus restoration depends on unchanged context. No retry after conflict or uncertain acknowledgement; an in-flight write can finish after navigation.
- **Sizing:** Ctrl-a `=` recursively equalizes flexible sibling shares, not all terminal pixel areas. `muxcle-sizing.grow-width`, `shrink-width`, `grow-height`, and `shrink-height` multiply/divide the containing branch's nearest-axis weight by 1.1. The separate `muxcle-sizing.strip-height` converts a supported tab to a vertical stack with the focused pane at 4% weighted height (maximum 25 panes); it does not replace `shrink-height`. Custom min/max/resizable constraints refuse. If a strip starts zoomed, Muxcle requests unzoom only after rechecking the original pane and tab are still selected and zoomed. Commands use at most one versioned core write and are not retried; no focus command is issued. `muxcle-sizing.help` explains commands. Inspect the result before repeating an uncertain operation.

Rotation/Sizing helpers communicate with the intended core and preserve unrelated document fields. Pending commands are ignored; unmounting a host does not cancel an already-started helper. No component runs an agent fleet or reads account credentials. The optional scaffold is a separate static alternative, not an extra functional capability.

## Recreate the composition

Use native Spaces, Tabs, and terminal pane views. Use the supplied active mods, combined keymap, and composed layout as the base. This root recipe is the pack's single guide; `components/` contains supporting snippets and blocks, not additional guides. The repository's sibling recipes provide optional deeper component design detail. Keep their command names, key actions, helper boundaries, and failure behavior. Preserve component ownership and keep the original scaffold separate from the active complete layout.

The pack has no personal settings, project paths, terminals, credentials, or updater. Project discovery runs only for user-configured roots; pane helpers address the intended core. Recreating it must not change live configuration or runtime state. The Tab tools package requires its one-pixel, non-focusable command host to remain shown in the selected layout.

## Done when

- All component behaviors match their recipes and remain independently usable.
- The complete layout contains exactly one History observer and one host each for Rotation, Sizing, and Tab tools, with no scaffold status row.
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

Choose a published tag from [GitHub Releases](https://github.com/cristianoliveira/herdr-muxcle/releases). A tag includes its leading `v`; for example, `v0.2.0` is only the local candidate name and is downloadable only if that exact tag is published. Download `muxcle-pack-<tag>.tar.gz` and its matching `.sha256`. If no release exists yet, contributors can build with `make package` and use the archive in `dist/`.

The public `v0.1.0` release predates the whole pack. For example, after a newer `v0.2.0` release includes it, place both files in the current directory:

```sh
shasum -a 256 -c muxcle-pack-v0.2.0.tar.gz.sha256
tar -xzf muxcle-pack-v0.2.0.tar.gz
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
| `components/muxcle-picker/config.example.json` | Optional opt-in for `data/muxcle-picker/config.json`; do not copy unless choosing recent order |
| `components/muxcle-funzzy-status/observer.json` | Optional 24 px status row; merge into a personal layout only when wanted, with remote monitoring off by default |
| `components/*`, this recipe, and manifest | Supporting references to keep in your vendor folder; no need to deploy into Herdr |

Use your existing dotfile manager to copy or link selected files. For a Stow-style setup, place managed paths beneath `.config/herdr-app/` in your dotfiles package; the archive itself is not a prearranged Stow package. With Home Manager or another manager, declare the destination paths explicitly.

**Do not symlink the entire extracted folder as your app home.** Keep runtime state, caches, shared data, terminals, and credentials outside the vendored pack. Manage only the intended static files and your selected Sessionizer config. Package-specific preflight scripts are for standalone manual installs and can reject linked containers; they are not dotfile-manager deployment commands.

The combined keymap contains Muxcle bindings only, not every Herdr default or your personal mappings. Adopting it as `keys.json` replaces whatever bindings your deployment previously supplied. Review terminal/layout precedence and existing shortcuts first. No automatic merge happens.

Do not edit Herdr's shipped layouts. `muxcle-pack.json` is a separate personal composition. You can modify it in your dotfiles or adapt your existing personal layout, but keep exactly one History observer and one host each for Rotation, Sizing, and Tab tools while using their commands.

### 3. Configure and activate deliberately

1. Deploy the chosen mod folders and configuration through your dotfiles.
2. Configure absolute project roots in `data/muxcle-sessionizer/config.json`, using the bundled example. Local roots are optional when remote roots are configured. Add a `remoteRoots` object only if you opt in; keys must be exact names from `hc machine ls`, and paths are interpreted on that remote machine. The pack assumes no personal project paths.
3. Optionally copy `components/muxcle-picker/config.example.json` to `data/muxcle-picker/config.json` if you want recent ordering; this is never enabled automatically. The History observer must remain shown to collect new visits. Picker checks the active layout's visible block, not whether the observer process is healthy. Management is a separate opt-in. Remote mutations also require `remoteSpaces: true` and a unique native machine `id`/`name` match in a fresh listing; only connected, non-temporary document-backed peers are supported. Herdr 0.1.13's native document commands omit temporary machines and reject them rather than creating a document. Missing, ambiguous, changed, disconnected, or newly temporary identity blocks dispatch. A native close of the last tab also removes its parent space and may show Herdr's own confirmation; the Picker does not bypass it.
4. Optionally check initial loading from private copies of the pack's runtime mods. This example iterates only the actual directories under `mods/`; the original scaffold under `scaffold/mods/` is intentionally excluded. It never reads or checks a mod from the installed app home or mutates the vendor copy:

   ```sh
   set -eu
   umask 077
   : "${BUNDLE:?Set BUNDLE to the extracted muxcle-pack directory}"

   for source_mod in "$BUNDLE"/mods/muxcle-*; do
     [ -d "$source_mod" ] || continue
     mod_name=${source_mod##*/}
     scratch_home=$(mktemp -d)
     trap 'rm -rf "$scratch_home"' EXIT HUP INT TERM
     mkdir -p "$scratch_home/mods" "$scratch_home/home" "$scratch_home/tmp" \
       "$scratch_home/xdg/config" "$scratch_home/xdg/data" \
       "$scratch_home/xdg/cache" "$scratch_home/xdg/state" "$scratch_home/xdg/runtime"
     chmod 700 "$scratch_home/xdg/runtime"
     cp -R "$source_mod" "$scratch_home/mods/"

     HC_SESSION="muxcle-load-check-${mod_name}-${scratch_home##*/}" \
       HOME="$scratch_home/home" \
       HERDR_APP_HOME="$scratch_home" \
       TMPDIR="$scratch_home/tmp" \
       XDG_CONFIG_HOME="$scratch_home/xdg/config" \
       XDG_DATA_HOME="$scratch_home/xdg/data" \
       XDG_CACHE_HOME="$scratch_home/xdg/cache" \
       XDG_STATE_HOME="$scratch_home/xdg/state" \
       XDG_RUNTIME_DIR="$scratch_home/xdg/runtime" \
       herdr-app check "$scratch_home/mods/$mod_name"

     rm -rf "$scratch_home"
   done
   trap - EXIT HUP INT TERM
   ```

   Each target mod, app home, user home, temporary directory, XDG path, and session is private to that iteration. This limits those targets; it is not a claim that the native checker cannot affect shared Core state. Do not use a caller/default session. Initial-load checks do not prove keyboard dispatch or feature completion.
5. Select the **`muxcle-pack`** layout through Herdr's layout picker when you want the complete composition. Merely deploying the file does not select it.
6. Try selected shortcuts with harmless terminals. Visit two tabs/spaces before testing History; configure roots before using Sessionizer. Confirm the intended core and focused tab before Rotation, Sizing, Navigation repeat, or Tab tools.

Initial-load checks are not proof of keyboard dispatch or feature completion. Herdr's core remains shared unless you explicitly configure a separate core/session; changing app home alone does not isolate terminals.

### 4. Replace or customize it yourself

For an update, verify and extract the new archive separately. Compare it with your vendored copy and review runtime files, keys, layout, and component behavior changes. Then replace your owned vendor tree in a dotfiles commit and redeploy through your manager. Keep your previous version for rollback. Avoid copying a new tree over an old tree blindly: removed upstream files could remain behind.

Keep project roots and personal settings separate from replaceable upstream files. If you update individual components independently, their existing package ownership markers remain intact; keep the manifest as the upstream baseline, not proof that a customized deployment still matches every byte.

To stop using the pack, first select another personal layout and remove or replace its shortcuts. Remove only the paths your dotfiles manager owns. Keep project roots, settings, unrelated mods, and all runtime state unless you deliberately choose otherwise.

Nothing in this package copies files to your live setup or performs these changes for you.
