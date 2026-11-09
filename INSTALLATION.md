# Install Muxcle capabilities

**Choose one capability, download its archive, then follow its included `INSTALLATION.md`.** Packages are independent. Start with **Tmux keys** if you only want familiar shortcuts.

You need Herdr, not a development environment. Released packages contain ready-to-use JavaScript and native files: no Git, repository clone, Node.js, npm, or TypeScript is required. Installation is agent-assisted or manual; no automatic installer replaces your configuration.

## 1. Choose a package

All packages are tested with **Herdr 0.1.13**. This is a tested version, not a promise of compatibility with every release.

| I want… | Archive name before the version | Additional setup | Full guide |
| --- | --- | --- | --- |
| Tmux-inspired shortcuts | `muxcle-tmux-keys` | Review and merge selected keys; no mod or layout | [Tmux keys](packages/tmux-keys/INSTALLATION.md) |
| Search existing spaces and tabs | `muxcle-picker` | Install a popup mod; optional shortcut | [Picker](packages/picker/INSTALLATION.md) |
| Open a project folder as a space | `muxcle-sessionizer` | Popup mod, Python 3, configured project roots | [Sessionizer](packages/sessionizer/INSTALLATION.md) |
| Toggle last tab or space | `muxcle-history` | Mod and one observer in a personal layout | [History](packages/history/INSTALLATION.md) |
| Rotate terminal panes | `muxcle-rotation` | Mod and one command host; 3+ panes also need Python 3 and `hc` | [Rotation](packages/rotation/INSTALLATION.md) |
| Equalize or resize splits | `muxcle-sizing` | Mod, one command host, Python 3 and `hc` | [Sizing](packages/sizing/INSTALLATION.md) |
| A starter window layout | `herdr-muxcle` | Select the optional scaffold layout after installation | [Scaffold](docs/INSTALLATION.md) |

**`herdr-muxcle` is not an all-in-one bundle.** It supplies a starter layout and static status row, not the other capabilities. None of the packages requires it, and none requires Tmux keys.

### What “additional setup” means

- **Keys:** `keys.json` is a snippet to merge, never a replacement for your full key map. A package's Ctrl-a sequences do not depend on a separate prefix mod.
- **Popup:** copy the mod, check it, then open it through Herdr. No custom layout is required for Picker or Sessionizer.
- **Observer / command host:** History, Rotation, and Sizing need one small block from `observer.json` or `host.json` mounted in your personal layout. **Copying the mod alone is not enough.** The block must remain shown for tracking or command delivery; opening a temporary popup is not a substitute.
- **Python / core:** helpers must be on Herdr's `PATH`, not only your terminal's. `hc` is Herdr's core CLI and must reach the same core/session as the app. Keep `HC_SESSION` consistent when using a custom session.

Do not edit shipped layouts: Herdr can replace them on startup. Adapt an existing personal layout, or ask before creating and selecting a personal copy.

## 2. Get a verified archive

Open [GitHub Releases](https://github.com/cristianoliveira/herdr-muxcle/releases). Choose a **published** version and download both your package's `.tar.gz` and matching `.tar.gz.sha256`. If there is no published release, there is no release download yet; contributors can [build local archives](DEVELOPMENT.md).

For example, after `v0.1.0` is published:

```sh
# Change these two values to the package and published tag you selected.
PACKAGE=muxcle-tmux-keys
VERSION=v0.1.0

WORK_DIR="$(mktemp -d)"
RELEASE_URL="https://github.com/cristianoliveira/herdr-muxcle/releases/download/$VERSION"
ARCHIVE="$PACKAGE-$VERSION.tar.gz"

# Stop if any download or checksum check fails.
curl -fL "$RELEASE_URL/$ARCHIVE" -o "$WORK_DIR/$ARCHIVE" &&
  curl -fL "$RELEASE_URL/$ARCHIVE.sha256" -o "$WORK_DIR/$ARCHIVE.sha256" &&
  (cd "$WORK_DIR" && shasum -a 256 -c "$ARCHIVE.sha256") &&
  tar -xzf "$WORK_DIR/$ARCHIVE" -C "$WORK_DIR" &&
  printf 'Verified package folder: %s\n' "$WORK_DIR/$PACKAGE-$VERSION"
```

On Linux, `sha256sum -c` can replace `shasum -a 256 -c`. Checksums detect damaged or mismatched downloads; they are not an independent publisher signature. Download only from the project's release page.

Keep the printed folder until installation is complete. Its `RECIPE.md` explains behavior; its `INSTALLATION.md` covers installation, activation, update, and removal.

## 3. Install only what you chose

### With your Herdr agent

Give your agent the **printed absolute package-folder path** and this request. If you want the agent to handle downloading too, give it the package name and published tag instead: ask it to fetch the archive and checksum from this project's release, verify before extracting, and stop if that release is unavailable—not clone or build the repository by default.

> Read `RECIPE.md`, `INSTALLATION.md`, and the files in this verified package folder. Explain the required changes, then install only this capability into my intended Herdr app home. Preserve unrelated mods, settings, layouts, keys, and runtime state. Run the included destination preflight where present. Ask before replacing files or bindings, creating or selecting a personal layout, or changing project roots. If a host or observer is required, mount exactly one in the intended personal layout. Do not install the scaffold or other packages unless I ask. Confirm activation separately from copying files; do not run terminal-changing commands without my confirmation.

Herdr mods are trusted code, not sandboxed extensions. Review the package and changes even when an agent performs the installation.

### Manually

Follow the extracted package's `INSTALLATION.md`. Most mod packages provide `check-install-targets.sh` to refuse conflicting or linked destinations before copying. Tmux keys has no mod files: review and merge only its selected bindings.

Confirm your app home before changing files. Guides default to `${HERDR_APP_HOME:-$HOME/.config/herdr-app}` unless they explicitly ask you to set it. Back up existing files; do not extract an archive directly over your app home.

## 4. Confirm activation

`herdr-app check` validates initial mod loading. It does **not** prove that a host is mounted, a shortcut dispatches, or a feature completed an asynchronous operation.

Use the package's guide to finish setup and try its documented behavior with harmless terminals:

- **Keys:** review higher-priority terminal/layout bindings, then try a selected shortcut.
- **Picker:** open `mod.open:muxcle-picker` in the intended running app.
- **Sessionizer:** configure roots, then open `mod.open:muxcle-sessionizer`.
- **History:** mount the observer and visit two targets before testing a toggle.
- **Rotation / Sizing:** mount the host and confirm the focused tab/core before running a pane-changing command.
- **Scaffold:** select the layout only when you intend to replace the current window composition.

If commands are missing, first check the package's host/observer requirement and active layout. If helpers cannot start, check Herdr's `PATH` and core/session—not just the shell used to download the archive.

## Update or uninstall

Use the same package's guide. Back up local edits, review differences, and update only package-owned paths. Remove only bindings and layout blocks that still belong to that package. Do not remove the whole app home, shared settings, or runtime state.

Maintaining releases instead of installing? See [Release process](docs/RELEASING.md).
