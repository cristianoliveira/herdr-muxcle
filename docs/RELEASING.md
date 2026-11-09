# Release Muxcle packages

This guide is for maintainers. Installing a capability? Use [Installation](../INSTALLATION.md).

**Prepare locally → push a reviewed version tag → inspect the CI-created draft → publish explicitly.** Setting up this process does not create a tag or release.

## What ships

One shared stable `X.Y.Z` version from `package.json` produces **eight optional archives and eight SHA-256 files**. This process currently supports stable tags such as `v0.1.0`, not prerelease tags. `private: true` is intentional: these are native Herdr packages, not npm publications.

The package catalog in `scripts/package.mjs` drives both archive construction and the release plan. Do not maintain a separate hand-written release asset list. Each archive includes the same standalone `install.py`, `RECIPE.md`, and root `INSTALLATION.md`; the scaffold also keeps its previous `docs/INSTALLATION.md` path.

`muxcle-pack` is the optional complete distribution for user-managed dotfiles. The seven individual packages remain available. `herdr-muxcle` is only the original scaffold, not the complete pack.

## 1. Prepare a version

Work from the intended release commit on `main`. Review `git status --short`; do not accidentally include someone else's uncommitted changes.

`v0.1.0` is already published and predates the whole pack and installer. Prepare a new version, such as `0.1.1`, for those additions; do not replace the existing tag or assets. Update `package.json` and `package-lock.json` together, review the change, and commit it. For example, `npm version patch --no-git-tag-version --ignore-scripts` prepares a patch version without creating a Git tag. This bumps the shared package version, not just one capability.

Install locked development tools and preview the release:

```sh
npm ci --ignore-scripts
make release-plan
```

The preview lists the packages, tagged installation guides, archive downloads, and checksums. It does not create a release, tag, or installation, and it does not require a desktop window. The preview's download URLs work only after that version is published.

For the CLI options or a machine-readable list of upload paths:

```sh
node scripts/release-plan.mjs --help
node scripts/release-plan.mjs --version 0.1.0 --format assets
```

These commands only print the plan; they do not upload the listed files.

## 2. Build and verify

```sh
make release-ci
```

This runs the normal gate, lockfile audit, and deterministic package build/verification. Inspect `dist/`: every package needs its `.tar.gz` and matching `.sha256`. End users install these archives, not `.build/`, `node_modules/`, or a repository checkout.

On a supported host with Herdr installed, also run:

```sh
make herdr-check
```

This checks packaged initial mod loading in a temporary app home, not your live configuration. `make release-check` runs both the release CI checks and this native check. Hosted release runners do not have Herdr, so record any native validation separately.

**GUI E2E tests are not a release prerequisite.** They remain optional and paused; do not add a desktop or VM dependency to this process. Unit tests and initial-load checks do not prove complete shortcut or UI behavior. Keep compatibility and validation claims precise.

## 3. Commit, tag, and push deliberately

Commit the intended changes first. The following example assumes the package version has been deliberately updated to `0.1.1`; always match the version from `package.json`:

```sh
TAG=v0.1.1
make release-tag TAG="$TAG"
git status --short
git log -1 --oneline

# Run only after reviewing the commit and checks.
git push origin main
git tag "$TAG"
git push origin "$TAG"
```

`make release-tag` validates the name only; it does not create or push the tag. The pushed tag must equal `v<package.json version>`.

Do not move an existing release tag or replace published artifacts. Prepare a new version for corrections.

## 4. Review the draft

The tag-triggered `.github/workflows/release.yml` validates the tag, runs release checks, and creates a **draft GitHub Release**. The draft contains installation/download links for each capability and the catalog's archive/checksum pairs. It is not a public release yet.

Inspect the run and draft using GitHub, or with `gh`:

```sh
gh run list --workflow release.yml --limit 5
gh release view "$TAG" --repo cristianoliveira/herdr-muxcle
```

Check:

- The tag points to the intended commit and matches the version.
- All eight archive/checksum pairs are attached; no developer files are included.
- Each archive has the same installer, readable standalone installation instructions, and a recipe. Verify preview/conflict behavior with a scratch target, not a live app home.
- Download, checksum, and tagged guide links use this release version.
- Notes describe changed behavior, prerequisites, compatibility limits, and any validation gaps. Add a short human summary of changes; generated installation notes are not a changelog.
- The complete `muxcle-pack` and optional `herdr-muxcle` scaffold are clearly distinguished. No notes imply automatic installation or replacement of personal files.

Do not announce draft download links as publicly available. Readers without repository access may not see drafts or their assets.

## 5. Publish explicitly

After reviewing the draft, publish through GitHub's release editor, or run:

```sh
gh release edit "$TAG" --repo cristianoliveira/herdr-muxcle --draft=false
```

This is the publication step. No local preview, archive build, or tag-validation command publishes a release.

Verify the public release page and download links after publication. The main README sends users to [Installation](../INSTALLATION.md), which explains package selection and activation; release notes link directly to guides at the matching tag.

## Failure and recovery

- **Tag mismatch:** correct the version before creating the tag; rerun `make release-tag TAG=v<version>`.
- **Audit or package failure:** fix the reported issue and rerun `make release-ci`. Do not bypass the release checks to upload files manually.
- **Native CLI unavailable:** hosted checks can still prepare a draft. Do not claim native validation you did not run.
- **Tag workflow failed:** inspect `gh run list --workflow release.yml --limit 5` and the failed run before retrying.
- **An existing or partial draft blocks retry:** inspect its tag and assets first. Do not overwrite a public release or delete one as automatic recovery. Review draft-only cleanup with the release owner before retrying.
- **User receives 404:** confirm the release is published, the tag matches, and the selected capability has both assets. A preview or draft is not a public download.

## Adding a capability later

Add its runtime source and standalone package instructions, register its package definition and release metadata in the shared catalog, and add behavioral packaging tests. The generated release table and asset list must then agree with what the packager actually builds. Update the installation choice table so users can identify the capability and its activation requirements.

Public Herdr gallery submission is a separate process. GitHub release publication does not submit a gallery listing or fabricate a preview image.
