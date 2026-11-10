# Release Muxcle packages

This guide is for maintainers. Installing a capability? Choose [a recipe](../README.md#choose-a-recipe).

**Prepare locally → push a reviewed version tag → inspect the CI-created draft → publish explicitly.** Setting up this process does not create a tag or release.

## What ships

One shared stable `X.Y.Z` version from `package.json` produces **nine individual capability archives, one whole-pack archive, and ten SHA-256 files**. This process currently supports stable tags such as `v0.1.0`, not prerelease tags. `private: true` is intentional: these are native Herdr packages, not npm publications.

The package catalog in `scripts/package.mjs` drives both archive construction and the release plan. Do not maintain a separate hand-written release asset list. Each archive includes one root `RECIPE.md` covering behavior, use of the supplied implementation, setup, updates, and removal. There is no separate installation guide.

`muxcle-pack` is the optional complete distribution for user-managed dotfiles. The nine individual packages remain available. `herdr-muxcle` is only the original scaffold, not the complete pack.

## 1. Prepare a version

Work from the intended release commit on `main`. Review `git status --short`; do not accidentally include someone else's uncommitted changes.

`v0.1.0` is already published and predates the whole pack. Prepare a new version, such as `0.1.1`, for that addition; do not replace existing tags or assets. Update `package.json` and `package-lock.json` together, review the change, and commit it. For example, `npm version patch --no-git-tag-version --ignore-scripts` prepares a patch version without creating a Git tag. This bumps the shared package version, not just one capability.

Install locked development tools and preview the release:

```sh
npm ci --ignore-scripts
make release-plan
```

The preview lists the packages, tagged package recipes, archive downloads, and checksums. It does not create a release, tag, or installation, and it does not require a desktop window. The preview's download URLs work only after that version is published.

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

Commit the intended changes first. The following example assumes you have deliberately updated the shared version to `0.1.1`; always match `package.json`:

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
- All nine individual capability archive/checksum pairs and the whole-pack archive/checksum pair are attached; no developer files are included.
- Each archive has a complete standalone recipe suitable for Herdr's agent-assisted flow. Source links explain how to obtain compiled files; they must not imply TypeScript source folders are ready runtime payloads.
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

Verify the public release page and download links after publication. The main README helps users [choose a recipe](../README.md#choose-a-recipe); release notes link directly to the recipes at the matching tag.

## Failure and recovery

- **Tag mismatch:** correct the version before creating the tag; rerun `make release-tag TAG=v<version>`.
- **Audit or package failure:** fix the reported issue and rerun `make release-ci`. Do not bypass the release checks to upload files manually.
- **Native CLI unavailable:** hosted checks can still prepare a draft. Do not claim native validation you did not run.
- **Tag workflow failed:** inspect `gh run list --workflow release.yml --limit 5` and the failed run before retrying.
- **An existing or partial draft blocks retry:** inspect its tag and assets first. Do not overwrite a public release or delete one as automatic recovery. Review draft-only cleanup with the release owner before retrying.
- **User receives 404:** confirm the release is published, the tag matches, and the selected capability has both assets. A preview or draft is not a public download.

## Adding a capability later

Add its runtime source and standalone package recipes, register its package definition and release metadata in the shared catalog, and add behavioral packaging tests. The generated release table and asset list must then agree with what the packager actually builds. Update the README recipe table so users can identify the capability and its activation requirements.

Public Herdr gallery submission is a separate process. GitHub release publication does not submit a gallery listing or fabricate a preview image.
