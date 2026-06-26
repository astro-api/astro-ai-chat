# Design: Automated CHANGELOG via release-please

**Date:** 2026-06-26
**Status:** approved for implementation

## Problem

The project currently has no automated changelog:

- There is no `CHANGELOG.md` file.
- The `package.json` version is bumped manually with a commit like `1.0.1`.
- The `vX.Y.Z` tag is created manually; pushing it triggers `.github/workflows/release.yml`.
- The GitHub Release body is a **hardcoded static template** in `release.yml` (install table + API-key links), identical for every release. The list of changes between versions is never shown.

Commits are already written as conventional commits (`feat:`, `fix:`, `docs:`, …), but that information is never aggregated.

## Goal

Adopt **release-please** (`googleapis/release-please-action@v4`), which:

- aggregates conventional commits and maintains `CHANGELOG.md` in the repository;
- automatically bumps the version in `package.json`;
- creates a GitHub Release with a body sourced from CHANGELOG, plus a `vX.Y.Z` tag.

The existing `release.yml` remains the "artifact builder": it triggers on the ready tag and **appends** installer files to the already-created release.

## Architecture and flow

```
PR with conventional commits → merge into main
        │
        ▼
[release-please.yml]  ← new workflow, on: push to main
        │  aggregates feat/fix/... since the last release
        │  opens/updates a "release PR" (bumps version in package.json + CHANGELOG.md)
        ▼
   merge the release PR
        │  release-please creates a GitHub Release + tag vX.Y.Z, writes the body from CHANGELOG
        ▼
[release.yml]  ← existing, on: push tag 'v*' — build logic is NOT touched
        │  builds .pkg/.dmg/.exe/.AppImage/.deb
        ▼
   appends artifacts to the already-created release (same tag)
```

Key idea: **release-please owns the version, CHANGELOG.md, the release, and the tag.** `release.yml` owns only the build and artifact attachment. Manual `package.json` bumps and manual tagging are no longer needed.

## Components

| File | Action | Purpose |
|---|---|---|
| `.github/workflows/release-please.yml` | create | `on: push: branches: [main]`. Runs `googleapis/release-please-action@v4`. Owns the version, CHANGELOG.md, the release, and the tag. |
| `release-please-config.json` | create | `release-type: node`, CHANGELOG sections, `include-v-in-tag: true` → tag `vX.Y.Z`. |
| `.release-please-manifest.json` | create | `{ ".": "1.0.1" }` — pins the current version as the starting point so the next release is `1.0.2`/`1.1.0`. |
| `.github/workflows/release.yml` | modify | Only the `release` job: switch `action-gh-release` to "append artifacts to the existing release" mode. Build jobs (mac/win/linux) — unchanged. |
| `CLAUDE.md` | modify | Short note about the new release flow. |

`CHANGELOG.md` is **not** created manually — release-please creates and maintains it in the first release PR.

### release-please-config.json

- `release-type: node` — reads and writes `version` in `package.json`.
- `include-v-in-tag: true` — tag format `vX.Y.Z` (compatible with the `release.yml` trigger `on: push: tags: ['v*']`).
- Changelog sections (visible): `feat` → Features, `fix` → Bug Fixes, `perf` → Performance, `refactor` → Refactors, `docs` → Documentation, `chore` → Miscellaneous. (`docs`/`chore`/`refactor`/`perf` are included as separate sections — useful for a desktop project.)
- GitHub Release body = **plain changelog**. No post-processing/footer. Install instructions stay in the README.

### .github/workflows/release-please.yml

```yaml
name: release-please
on:
  push:
    branches: [main]
permissions:
  contents: write
  pull-requests: write
jobs:
  release-please:
    runs-on: ubuntu-latest
    steps:
      - uses: googleapis/release-please-action@v4
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          config-file: release-please-config.json
          manifest-file: .release-please-manifest.json
```

### release.yml change (job `release`)

The current step creates the release with a static body. Switch it to attach to the already-existing release:

```yaml
- name: Attach installers to release
  uses: softprops/action-gh-release@v2
  with:
    files: artifacts/**/*
    fail_on_unmatched_files: false
    # name/body/draft/prerelease REMOVED — the release and its body are already created by release-please from CHANGELOG
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

Remove: `name:`, the entire `body:` block (install/API-keys table), `draft:`, `prerelease:`. `softprops/action-gh-release@v2` matches the existing release by tag and appends `files` without touching the body when no `body` is passed. The build jobs (`build-mac`, `build-windows`, `build-linux`) are unchanged.

## Risks and edge cases

1. **Default branch.** Config files and the worktree are currently on a `claude/...` branch, while release-please listens on `main`. The changes must land on `main` (via PR), otherwise nothing triggers.
2. **Starting version.** `.release-please-manifest.json` = `1.0.1`. The first merged release PR yields `1.0.2` (fix only) or `1.1.0` (a feat is present). release-please does **not** retroactively recompute past commits — the changelog starts from changes made after adoption. Expected.
3. **Two-workflow race.** release-please creates the release + tag → the tag push triggers `release.yml` → artifacts are appended to the already-existing release. `action-gh-release` without `body` does not overwrite the notes (matches by tag, merges files).
4. **prerelease.** The `prerelease: contains(ref_name, '-')` logic goes away. release-please marks prereleases by version (`1.0.0-rc.1`) itself. Acceptable for this project — there are no prereleases.
5. **Token permissions (repository precondition).** Requires `contents: write` + `pull-requests: write`. In repo Settings → Actions → General, "Allow GitHub Actions to create and approve pull requests" must be enabled, otherwise release-please cannot open the release PR. This is a repo setting, not code.

## Testing

- YAML lint both workflows.
- Validate the JSON shape of `release-please-config.json` and `.release-please-manifest.json` (correct `release-type`, the `"."` entry is present).
- The `release.yml` diff touches only the `release` job — build jobs unchanged.
- Real flow verification — only after merging into `main`: a release PR should be created. Manual step for the repo owner.

## Out of scope

- Moving install instructions from README into the release body (decided: they stay in the README).
- Signed/notarized builds.
- Monorepo/multiple packages (the project is a single package).
