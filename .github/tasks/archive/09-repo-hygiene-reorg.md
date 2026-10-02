## Summary

- Reorganize the repository root so canonical source folders stay obvious and local runtime artifacts stop polluting `git status`
- Move ad hoc QA/screenshot helper scripts into stable script folders and define one canonical screenshot/reference location

## Scope

- Target: `infra`, `docs`
- Entry point: repository root, `.gitignore`, screenshot/reference asset layout
- Out of scope: feature work in `apps/api` or `apps/web`

## Findings

1. Root-level source structure is mostly fine (`apps`, `e2e`, `deploy`, `docs`, `infra`), but repository hygiene is weak at the root.
2. `.gitignore` only covers basic build/editor files and misses local runtime artifacts such as `.playwright-mcp/`, `.pnpm-store/`, `playwright-report/`, `test-results/`, `tmp/`, and backup files.
3. Generated Playwright artifacts are already tracked, so future ignore changes must be paired with index cleanup.
4. Root helper scripts `qa-test.mjs`, `qa-ui-gaps.mjs`, and `take-screenshots.mjs` are not referenced by package scripts or docs and should not remain at the root.
5. `docs/screenshots/` is the active documentation screenshot path, while `apps/web/docs/screenshots/` is tracked but currently unreferenced.
6. `reference/` looks like versioned design/reference input, but it is disconnected from the current docs structure.
7. `packages/` exists but is empty and not part of `pnpm-workspace.yaml`, which creates ambiguity about whether shared packages are supported.
8. A root file named `ec2-info` should be treated as local-only until it is explicitly sanitized and rehomed.

## Planned Fix

- Expand `.gitignore` to cover local runtime/cache/report/temp artifacts and editor backup files.
- Remove tracked runtime artifacts from the Git index after ignore rules land.
- Create stable script homes:
  - `scripts/qa/` for manual QA helpers
  - `scripts/docs/` for screenshot/documentation capture helpers
- Move or merge:
  - `qa-test.mjs` -> `scripts/qa/`
  - `qa-ui-gaps.mjs` -> `scripts/qa/`
  - `take-screenshots.mjs` -> `scripts/docs/` or merge into `scripts/capture-screenshots.mjs`
- Keep `docs/screenshots/` as the canonical committed screenshot path and decide whether `apps/web/docs/screenshots/` should be archived into `docs/screenshots/archive/` or removed.
- Move `reference/` under `docs/reference/` if it must stay versioned; otherwise document it as local-only and ignore it.
- Either delete empty `packages/` or add a small README explaining that it is intentionally reserved for future shared packages.
- Update `README.md` and `AGENTS.md` so the root layout, artifact policy, and screenshot/script conventions are explicit.

## Validation

- `git check-ignore -v .playwright-mcp .pnpm-store tmp test-results playwright-report`
- `git ls-files 'playwright-report/**' 'test-results/**' '.pnpm-store/**' '.playwright-mcp/**' 'tmp/**'`
- `rg -n "capture-screenshots|qa-test|qa-ui-gaps|take-screenshots|docs/screenshots|apps/web/docs/screenshots" -S .`
- `git status --short`

## Execution Update

- `.gitignore` expanded for local runtime/cache/report/temp artifacts and local operator notes.
- Root helper scripts were rehomed into:
  - `scripts/qa/manual-route-smoke.mjs`
  - `scripts/qa/manual-ui-gap-audit.mjs`
  - `scripts/docs/capture-overview-screenshots.mjs`
  - `scripts/docs/capture-app-screenshots.mjs`
- `apps/web/docs/screenshots/` was archived into `docs/screenshots/archive/web-rounds/`.
- `reference/` was rehomed into `docs/reference/`.
- Empty root `packages/` directory was removed from the working tree.
- Canonical policy fixed:
  - doc screenshots -> `docs/screenshots/`
  - versioned visual references -> `docs/reference/`
  - local runtime outputs -> ignore only

## Pipeline Status

- Current stage: `Completed`
- Branch: `main`
