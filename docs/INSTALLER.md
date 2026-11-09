# Install any Muxcle package with one script

Use the same installer for **one individual capability or the whole pack**. It installs only the package you select. This is a Muxcle tool, not a new `herdr-app install` subcommand.

Requires Python 3.11+ and POSIX no-follow directory-descriptor operations, as provided on macOS/Linux. Unsupported platforms are refused; this is not a Windows installer. No Node.js, npm, compiler, or running Herdr connection is needed. Run as your normal user, not with `sudo`.

## Download, verify, and extract

Choose a package from [Installation](../INSTALLATION.md) and get its archive and matching SHA-256 file from [GitHub Releases](https://github.com/cristianoliveira/herdr-muxcle/releases). Follow that package's download/verification steps before extracting it into a scratch directory—not over your app home.

The installer does **not** fetch URLs or extract archives. It reads a selected extracted package folder containing `manifest.json`. Checksums detect damaged or mismatched downloads, not an independent publisher compromise. Download only from sources you trust; mods are trusted code.

**Release availability:** published `v0.1.0` predates the bundled installer and whole pack. Use a newer release for root `install.py`. The current checkout's installer can also deploy an already verified/extracted older individual package; keep the installer separate and pass `--source` rather than adding files to the older archive's manifest. There is no public `muxcle-pack-v0.1.0` asset.

## Preview, then apply

New archives include the same `install.py` at their root. For example, after extracting the Picker package:

```sh
BUNDLE="/absolute/path/to/extracted-muxcle-picker"
TARGET="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"

python3 "$BUNDLE/install.py" --target "$TARGET"
```

This previews changes without modifying the target. The default source is beside the script, not the current working directory.

Review the plan, then apply it explicitly:

```sh
python3 "$BUNDLE/install.py" --target "$TARGET" --apply
```

Choose a different package folder to install that capability instead. You do not need the whole pack, scaffold, or another Muxcle package first.

## Use one installer with another package

The shared installer accepts an explicit extracted source directory:

```sh
python3 scripts/install.py \
  --source /absolute/path/to/extracted-muxcle-sizing \
  --target "$TARGET"
```

The same command with `--apply` installs the reviewed plan. This checkout example does not require a build or Node.js. You can also use `install.py` from one archive with `--source` pointing at another supported Muxcle package.

To stage files for your dotfile manager, set `--target` to an **app-home-shaped directory in your dotfiles**. Create its parent directory first; the script can create the target directory itself. It does not infer a destination inside a dotfiles repository automatically. Review and deploy that directory through your own manager.

## Existing files and shortcuts

- Identical files and already-equal bindings are left unchanged.
- Key snippets merge into `keys.json`; unrelated bindings, sections, and settings are preserved.
- Conflicting files or bindings stop installation before writes unless replacement is explicitly authorized.
- Higher-priority terminal/layout bindings can shadow global keys. Resolve reported precedence conflicts yourself, or leave keys untouched with `--skip-keys`. These checks do not prove real keyboard dispatch or every prefix/focus interaction.
- `--replace` permits supported replacements and creates backups before changes. Review the plan before combining it with `--apply`; it is not permission to delete unrelated files or runtime state.

For example, preview an update without touching keys:

```sh
python3 scripts/install.py --source "$BUNDLE" --target "$TARGET" --skip-keys --replace
```

When the reviewed plan is correct, repeat with `--apply`. Keep the reported backups until you confirm the result. Updates do not prune obsolete files or remove bindings absent from the new snippet; review those removals yourself. Writes are not a promise of an all-or-nothing multi-file transaction; if installation fails, read the error and backup location before retrying.

The installer refuses unsafe source/target paths and linked destinations rather than following them silently. If your live files are managed through symlinks, install into a regular staging directory in your dotfiles, review it, and deploy through your manager. Do not edit source or target files concurrently with installation.

## Finish activation

The script installs files and selected keys, **not an active Herdr session**. It does not launch commands, create terminals, choose project roots, or switch layouts.

- **Tmux keys:** review the resulting bindings and their active contexts.
- **Picker:** open its popup when ready.
- **Sessionizer:** configure `data/muxcle-sessionizer/config.json` yourself, then open its popup.
- **History / Rotation / Sizing:** mount one observer or command host in your chosen personal layout. File deployment alone does not mount it.
- **Scaffold / whole pack:** select the supplied layout only when you intend to change the window composition.

Use the selected package's included `INSTALLATION.md` for remaining setup and behavior limits. Initial mod checks are separate from interactive validation. Keep Python/helpers and `hc` available on Herdr's PATH where the capability requires them.

## Scope

Only the selected package's runtime paths, supplied personal layout, and reviewed key changes are deployed. Recipes, component references, scaffold alternatives inside the full pack, config examples, settings, shared state, caches, and credentials are not copied into the target automatically.

The script never runs package helpers, loads package JavaScript, or invokes Herdr/core commands. Installation does not sandbox what Herdr runs later. A running Herdr may reload deployed modules or keys. Use a staging target for review; close the app before updating a live app home if you want to avoid loading a partially updated set of files. The installer does not close it for you.

For exact flags and recovery examples:

```sh
python3 scripts/install.py --help
```
