# Automated CHANGELOG (release-please) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adopt release-please so that `CHANGELOG.md`, the `package.json` version, the GitHub Release, and the `vX.Y.Z` tag are produced automatically from conventional commits, while the existing build workflow only appends installer artifacts.

**Architecture:** A new `release-please.yml` workflow runs on pushes to `main`, opens/updates a "release PR" that bumps the version and maintains `CHANGELOG.md`, and on merge creates the GitHub Release + tag from the changelog. The existing `release.yml` (triggered by the `v*` tag) is changed only in its final `release` job: instead of creating a release with a hardcoded body, it now attaches built installers to the release that release-please already created.

**Tech Stack:** GitHub Actions, `googleapis/release-please-action@v4` (manifest mode), `softprops/action-gh-release@v2`, Node project (`package.json` `release-type: node`).

## Global Constraints

- Spec/plan documents are written in **English**.
- Repository: `astro-api/astro-ai-chat`; default branch `main` (not `master`).
- Package: `name: astro-ai-chat`, current `version: 1.0.1`.
- Pin the action to **`@v4`** (v5 changes Node runtime and warns when `release-type` is combined with `config-file`/`manifest-file`).
- **Manifest mode rule:** do NOT put `release-type` on the action's `with:` block — it must live only inside `release-please-config.json`. Setting it on the action switches release-please out of manifest mode.
- `include-v-in-tag: true` keeps tags as `vX.Y.Z`, matching the `release.yml` trigger `on: push: tags: ['v*']`.
- GitHub Release body = plain changelog only. Install instructions stay in the README.
- Workflow permissions for release-please: `contents: write` + `pull-requests: write`.
- Conventional commit prefixes are already in use (`feat:`, `fix:`, `docs:`, `chore:`, …).

---

## File Structure

| File | Responsibility |
|---|---|
| `release-please-config.json` | release-please v4 config: release-type, changelog sections, tag format. |
| `.release-please-manifest.json` | Pins the current released version (`"." : "1.0.1"`). |
| `.github/workflows/release-please.yml` | Runs release-please on `main`; owns version/CHANGELOG/release/tag. |
| `.github/workflows/release.yml` | Unchanged build jobs; the `release` job now appends artifacts to the existing release. |
| `CLAUDE.md` | Documents the new release flow for future contributors. |

---

## Task 1: Add release-please config and manifest

**Files:**
- Create: `release-please-config.json`
- Create: `.release-please-manifest.json`

**Interfaces:**
- Consumes: nothing (entry point).
- Produces: `release-please-config.json` (read by the action via `config-file`) and `.release-please-manifest.json` (read via `manifest-file`). The manifest path key `"."` maps the repo root to the current version. `release-type: node` makes release-please bump `package.json` `version` and `package-lock.json`.

- [ ] **Step 1: Create `release-please-config.json`**

Create `release-please-config.json` with exactly this content:

```json
{
  "$schema": "https://raw.githubusercontent.com/googleapis/release-please/main/schemas/config.json",
  "include-v-in-tag": true,
  "packages": {
    ".": {
      "release-type": "node",
      "package-name": "astro-ai-chat",
      "changelog-sections": [
        { "type": "feat", "section": "Features" },
        { "type": "fix", "section": "Bug Fixes" },
        { "type": "perf", "section": "Performance Improvements" },
        { "type": "refactor", "section": "Code Refactoring" },
        { "type": "docs", "section": "Documentation" },
        { "type": "chore", "section": "Miscellaneous", "hidden": true }
      ]
    }
  }
}
```

Notes for the implementer:
- `release-type` lives **inside** `"."`, NOT on the action — this is what keeps manifest mode working.
- `chore` uses `"hidden": true` so chores are tracked but kept out of the published changelog. Remove `"hidden": true` if you later want them visible.

- [ ] **Step 2: Create `.release-please-manifest.json`**

Create `.release-please-manifest.json` with exactly this content (must match `package.json` `version`):

```json
{
  ".": "1.0.1"
}
```

- [ ] **Step 3: Validate both files are well-formed JSON**

Run:
```bash
node -e "JSON.parse(require('fs').readFileSync('release-please-config.json','utf8')); JSON.parse(require('fs').readFileSync('.release-please-manifest.json','utf8')); console.log('JSON OK')"
```
Expected output: `JSON OK`

- [ ] **Step 4: Verify the manifest version matches package.json**

Run:
```bash
node -e "const p=require('./package.json').version, m=require('./.release-please-manifest.json')['.']; if(p!==m) throw new Error('mismatch '+p+' vs '+m); console.log('version match:', p)"
```
Expected output: `version match: 1.0.1`

- [ ] **Step 5: Commit**

```bash
git add release-please-config.json .release-please-manifest.json
git commit -m "build: add release-please config and manifest"
```

---

## Task 2: Add the release-please workflow

**Files:**
- Create: `.github/workflows/release-please.yml`

**Interfaces:**
- Consumes: `release-please-config.json` and `.release-please-manifest.json` from Task 1, via the `config-file` and `manifest-file` inputs.
- Produces: on push to `main`, a release PR; on merge of that PR, a GitHub Release and a `vX.Y.Z` tag. The tag is what Task 3's `release.yml` reacts to. The action exposes outputs such as `releases_created` and `tag_name` (not consumed here, but available).

- [ ] **Step 1: Create `.github/workflows/release-please.yml`**

Create `.github/workflows/release-please.yml` with exactly this content:

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

Notes for the implementer:
- Do NOT add a `release-type:` input here — it belongs in the config file (manifest mode).
- `secrets.GITHUB_TOKEN` is the built-in token; no PAT needed for this setup.

- [ ] **Step 2: Validate the workflow YAML parses**

Run:
```bash
node -e "const fs=require('fs');const s=fs.readFileSync('.github/workflows/release-please.yml','utf8');if(!/release-please-action@v4/.test(s))throw new Error('action ref missing');if(/release-type:/.test(s))throw new Error('release-type must NOT be on the action');console.log('release-please.yml OK')"
```
Expected output: `release-please.yml OK`

- [ ] **Step 3: Validate YAML syntax with a parser (if available)**

Run:
```bash
python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/release-please.yml')); print('YAML valid')"
```
Expected output: `YAML valid`
(If `python3`/`yaml` is unavailable, the Step 2 check is sufficient — skip this step.)

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/release-please.yml
git commit -m "ci: add release-please workflow for automated changelog and releases"
```

---

## Task 3: Switch release.yml to append artifacts to the existing release

**Files:**
- Modify: `.github/workflows/release.yml:122-147` (the `Create GitHub Release` step inside the `release` job)

**Interfaces:**
- Consumes: the GitHub Release + `vX.Y.Z` tag created by Task 2's workflow. The tag push triggers this workflow (`on: push: tags: ['v*']`, unchanged).
- Produces: installer files attached to the already-existing release. No body/name is set, so release-please's changelog body is preserved.

- [ ] **Step 1: Replace the release step**

In `.github/workflows/release.yml`, replace the entire `Create GitHub Release` step (currently lines 122-147, the step that sets `name:`, the multi-line `body:`, `files:`, `fail_on_unmatched_files:`, `draft:`, `prerelease:`) with exactly this:

```yaml
      - name: Attach installers to release
        uses: softprops/action-gh-release@v2
        with:
          files: artifacts/**/*
          fail_on_unmatched_files: false
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

Notes for the implementer:
- Remove `name:`, the whole `body:` block, `draft:`, and `prerelease:`. When `body` is omitted, `action-gh-release` matches the existing release by tag and appends `files` without overwriting the changelog body release-please wrote.
- Leave the `build-mac`, `build-windows`, `build-linux` jobs and the `release` job's `needs:`/`permissions:`/`checkout`/`download-artifact` steps untouched.

- [ ] **Step 2: Verify the static body and obsolete inputs are gone**

Run:
```bash
node -e "const s=require('fs').readFileSync('.github/workflows/release.yml','utf8');for(const bad of ['### Installation','API Keys required','prerelease:','body:']){if(s.includes(bad))throw new Error('still present: '+bad)};if(!s.includes('Attach installers to release'))throw new Error('new step missing');console.log('release.yml updated OK')"
```
Expected output: `release.yml updated OK`

- [ ] **Step 3: Verify the build jobs are untouched**

Run:
```bash
node -e "const s=require('fs').readFileSync('.github/workflows/release.yml','utf8');for(const must of ['build-mac:','build-windows:','build-linux:','on:','tags:']){if(!s.includes(must))throw new Error('missing: '+must)};console.log('build jobs intact')"
```
Expected output: `build jobs intact`

- [ ] **Step 4: Validate YAML syntax (if available)**

Run:
```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/release.yml')); print('YAML valid')"
```
Expected output: `YAML valid`
(Skip if `python3`/`yaml` unavailable.)

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: attach installers to release-please-created release instead of creating it"
```

---

## Task 4: Document the new release flow

**Files:**
- Modify: `CLAUDE.md` (add a short "Release flow" note)

**Interfaces:**
- Consumes: nothing.
- Produces: documentation only.

- [ ] **Step 1: Add a Release flow section to `CLAUDE.md`**

Append the following section to `CLAUDE.md` (after the `### Build Output` section):

```markdown
### Release flow

Releases are automated via **release-please** (`.github/workflows/release-please.yml`):

1. Merge conventional-commit PRs (`feat:`, `fix:`, …) into `main`.
2. release-please opens/updates a **release PR** that bumps `package.json` and maintains `CHANGELOG.md`. Config lives in `release-please-config.json` + `.release-please-manifest.json`.
3. Merging the release PR creates a GitHub Release (body = changelog) and a `vX.Y.Z` tag.
4. The tag triggers `.github/workflows/release.yml`, which builds installers and **attaches** them to that release.

Do **not** bump the version or create tags by hand — release-please owns both. Repo setting: Settings → Actions → General → "Allow GitHub Actions to create and approve pull requests" must be enabled.
```

- [ ] **Step 2: Verify the section landed**

Run:
```bash
node -e "const s=require('fs').readFileSync('CLAUDE.md','utf8');if(!s.includes('### Release flow'))throw new Error('section missing');console.log('CLAUDE.md updated')"
```
Expected output: `CLAUDE.md updated`

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document release-please release flow in CLAUDE.md"
```

---

## Manual verification (repo owner, after merge to main)

These cannot be automated from a feature branch — they require the changes on `main`:

1. **Repo precondition:** Settings → Actions → General → enable "Allow GitHub Actions to create and approve pull requests". Without it, release-please cannot open the release PR.
2. After merging this work into `main`, confirm the `release-please` workflow runs and opens a **release PR** titled like `chore(main): release astro-ai-chat 1.0.2` (or `1.1.0` if a `feat` landed) containing a generated `CHANGELOG.md`.
3. Merge that release PR. Confirm a GitHub Release + `vX.Y.Z` tag are created with the changelog body.
4. Confirm the existing `release.yml` runs on the new tag and the `.pkg/.dmg/.exe/.AppImage/.deb` files are attached to that same release, with the changelog body intact (not overwritten).

---

## Self-Review

- **Spec coverage:** config+manifest (Task 1) ✅, release-please workflow (Task 2) ✅, release.yml append mode (Task 3) ✅, CLAUDE.md note (Task 4) ✅, repo precondition + starting version + two-workflow race + prerelease handling captured in Global Constraints / Manual verification ✅.
- **Placeholder scan:** no TBD/TODO; every file shows complete content; every check has an exact command and expected output.
- **Type/name consistency:** config keys (`release-type`, `include-v-in-tag`, `changelog-sections`, `package-name`), action inputs (`config-file`, `manifest-file`, `token`), tag format `vX.Y.Z`, and the manifest key `"."` are used identically across all tasks and match the verified release-please v4 schema.
