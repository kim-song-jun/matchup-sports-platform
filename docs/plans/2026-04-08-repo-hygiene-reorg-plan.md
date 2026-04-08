# MatchUp Repo Hygiene Reorganization Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 루트 구조를 정리해 제품 코드, 문서 자산, 로컬 실행 산출물이 섞이지 않도록 하고 폴더 이동 기준을 고정한다.

**Architecture:** 앱 코드 구조(`apps/`, `e2e/`, `deploy/`, `infra/`)는 유지하고, 이번 정리는 루트 위생과 문서/보조 스크립트 배치만 다룬다. 따라서 `분류 -> ignore 강화 -> 스크립트 이동 -> 문서 자산 통합 -> 문서 갱신` 순서로 진행한다.

**Tech Stack:** pnpm workspaces, Turborepo, Next.js 15, NestJS 11, Playwright, Markdown docs

---

## Current Classification

- Keep as canonical product folders:
  - `apps/`
  - `e2e/`
  - `deploy/`
  - `infra/`
  - `docs/`
  - `scripts/`
- Move out of the root:
  - `qa-test.mjs`
  - `qa-ui-gaps.mjs`
  - `take-screenshots.mjs`
- Ignore as local runtime/cache/output:
  - `.playwright-mcp/`
  - `.pnpm-store/`
  - `playwright-report/`
  - `test-results/`
  - `tmp/`
  - `.claude/agents/*.bak.*`
- Resolve by policy:
  - `apps/web/docs/screenshots/`
  - `reference/`
  - `packages/`
  - `ec2-info`

### Task 1: Freeze the baseline and confirm path ownership

**Files:**
- Inspect: `.gitignore`
- Inspect: `README.md`
- Inspect: `AGENTS.md`
- Inspect: `qa-test.mjs`
- Inspect: `qa-ui-gaps.mjs`
- Inspect: `take-screenshots.mjs`
- Inspect: `scripts/capture-screenshots.mjs`
- Inspect: `apps/web/docs/screenshots/**`
- Inspect: `docs/screenshots/**`

**Steps:**

1. Record which root paths are `canonical`, `move`, `ignore`, or `delete-later`.
2. Search the repo for references before moving anything.
3. Keep a mapping table in `.github/tasks/09-repo-hygiene-reorg.md`.

**Commands:**

```bash
git status --short
rg -n "qa-test|qa-ui-gaps|take-screenshots|capture-screenshots|docs/screenshots|apps/web/docs/screenshots|reference/" -S .
git ls-files 'playwright-report/**' 'test-results/**' '.pnpm-store/**' '.playwright-mcp/**' 'tmp/**'
```

**Expected outcome:**

- Every root path has an owner and target location before any move starts.

### Task 2: Strengthen ignore rules before moving files

**Files:**
- Modify: `.gitignore`
- Modify: `.dockerignore` only if ignore policy should stay aligned for local-only artifacts

**Steps:**

1. Add missing local-only artifact patterns:
   - `.playwright-mcp/`
   - `.pnpm-store/`
   - `playwright-report/`
   - `test-results/`
   - `tmp/`
   - `.claude/agents/*.bak.*`
   - `*.log`
   - `ec2-info` if it is personal/local
2. Keep committed documentation assets out of ignore rules:
   - `docs/screenshots/`
   - `docs/reference/` if adopted
3. Re-run ignore checks before index cleanup.

**Commands:**

```bash
git check-ignore -v .playwright-mcp .pnpm-store tmp test-results playwright-report
git status --short
```

**Expected outcome:**

- New local artifacts stop appearing as untracked files.

### Task 3: Rehome root helper scripts into canonical script folders

**Files:**
- Create: `scripts/qa/`
- Create: `scripts/docs/`
- Move: `qa-test.mjs`
- Move: `qa-ui-gaps.mjs`
- Move or merge: `take-screenshots.mjs`
- Modify: `package.json` only if script aliases are worth exposing
- Modify: `README.md`

**Steps:**

1. Move QA-only helpers into `scripts/qa/` with clearer names.
2. Decide whether `take-screenshots.mjs` stays separate or merges with `scripts/capture-screenshots.mjs`.
3. Update every internal reference after moves.
4. Optionally add npm scripts only if the commands are expected to be reused.

**Suggested target paths:**

- `scripts/qa/manual-route-smoke.mjs`
- `scripts/qa/manual-ui-gap-audit.mjs`
- `scripts/docs/capture-app-screenshots.mjs`

**Commands:**

```bash
rg -n "qa-test|qa-ui-gaps|take-screenshots|capture-screenshots" -S .
node scripts/docs/capture-app-screenshots.mjs
```

**Expected outcome:**

- The repository root no longer contains ad hoc execution scripts.

### Task 4: Consolidate screenshot and reference asset policy

**Files:**
- Modify: `docs/PROJECT_OVERVIEW.md`
- Move or archive: `apps/web/docs/screenshots/**`
- Move: `reference/**` -> `docs/reference/**` if kept
- Modify: `AGENTS.md`

**Steps:**

1. Keep `docs/screenshots/` as the single canonical screenshot location because it is already referenced by docs.
2. Decide one of two policies for `apps/web/docs/screenshots/`:
   - archive under `docs/screenshots/archive/web-rounds/`
   - remove after verifying there are no external consumers
3. Rehome `reference/` under `docs/reference/` only if the images are intended to stay versioned for design/doc work.
4. If `reference/` is personal scratch material, stop versioning it and ignore it instead.

**Commands:**

```bash
rg -n "screenshots/v4_intro|screenshots/v3_20260325|apps/web/docs/screenshots|reference/" -S docs README.md AGENTS.md .
find docs/screenshots -maxdepth 2 -type f | wc -l
find apps/web/docs/screenshots -maxdepth 2 -type f | wc -l
```

**Expected outcome:**

- Screenshot/reference assets have one documented home each.

### Task 5: Resolve ambiguous root leftovers

**Files:**
- Delete or document: `packages/`
- Move or ignore: `ec2-info`
- Modify: `README.md`

**Steps:**

1. Remove empty `packages/` if shared packages are not planned in the short term.
2. If `packages/` is intentionally reserved, add a short README explaining that it is a future workspace location.
3. Treat `ec2-info` as local-only until its contents are reviewed and sanitized.
4. Do not keep unnamed personal or environment-specific files at the root.

**Commands:**

```bash
find packages -maxdepth 2 -print
git status --short
```

**Expected outcome:**

- Every remaining root item is either canonical or explicitly explained.

### Task 6: Clean the Git index and document the new rules

**Files:**
- Modify: `.gitignore`
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `.github/tasks/09-repo-hygiene-reorg.md`

**Steps:**

1. Remove newly ignored runtime artifacts from the Git index without deleting local working copies.
2. Update the root structure section in `README.md`.
3. Add repo hygiene rules to `AGENTS.md` so future ad hoc files do not return to the root.
4. Capture the final mapping of canonical folders and local-only folders in the task doc.

**Commands:**

```bash
git rm -r --cached playwright-report test-results .playwright-mcp .pnpm-store tmp
git status --short
rg -n "scripts/qa|scripts/docs|docs/reference|docs/screenshots" README.md AGENTS.md .github/tasks/09-repo-hygiene-reorg.md
```

**Expected outcome:**

- The root stays stable after `git status`, and the policy is documented for the next contributor.

## Recommended Execution Order

1. Task 1
2. Task 2
3. Task 3
4. Task 4
5. Task 5
6. Task 6

## Notes Before Execution

- 현재 작업 트리가 이미 많이 더럽기 때문에 실제 이동 작업은 별도 커밋 범위로 분리하는 편이 안전하다.
- 특히 `playwright-report/`, `test-results/`, `tmp/`는 ignore 추가만으로 끝나지 않고 index cleanup이 필요하다.
- `docs/screenshots/`는 이미 문서에서 참조 중이므로 canonical path를 바꾸지 않는 편이 비용이 낮다.
- `apps/web/docs/screenshots/`는 현재 참조가 보이지 않으므로 정리 우선순위가 높다.
