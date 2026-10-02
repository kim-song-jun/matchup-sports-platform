# Codex Agent Workflow — Teameet

## Canonical Paths

- canonical agent docs: `.codex/agents/*.md`
- canonical QA policy: `.codex/qa-rules.md`
- compatibility prompt entry: `.claude/agents/prompts.md`
- task docs: `.github/tasks/{NN}-{slug}.md`
- Playwright runbook: `docs/guides/playwright-e2e-runbook.md` (v1 E2E: `pnpm test:e2e:v1`)

## Commands

- `@build` → `backend-dev` + `frontend-dev` + `infra-dev`
- `@review` → `backend-review` + `frontend-review` + `infra-review`
- `@design` → `design-main` + `ux-manager` + `ui-manager`
- `@plan` → `project-director` + `tech-planner`
- `@QA` / `@test` → `qa-beginner` + `qa-regular` + `qa-power` + `qa-uiux`
- `@docs` → `docs-writer`
- `@all` → `@plan` → `@build` → `@review` ↔ fix loop → `@design` → `@QA` → `@docs`

## Pipeline Patterns

### New Feature
1. `@plan`
2. `.github/tasks/{NN}-{slug}.md` 작성 또는 업데이트
3. `@build`
4. `@review` ↔ fix loop
5. `@design`
6. `@QA`
7. `@docs`

### Bug Fix
1. 관련 builder 실행
2. 관련 reviewer 실행
3. `@QA`
4. `@docs`

### Design Refactor
1. `@design` audit
2. `@build` (`frontend-dev` 중심)
3. `@design` re-review
4. `@QA`
5. `@docs`

### Docs Only
1. 범위가 순수 문서인지 확인
2. `docs-writer`가 source-of-truth 문서를 먼저 갱신
3. compatibility entry drift 여부 확인

## Review / Fix Iteration

1. Reviewers가 `🔴 Critical` 또는 `🟡 Warning`을 리포트한다.
2. Builders가 **같은 이슈 집합만** 수정한다.
3. 같은 reviewers가 previous findings 해결 여부만 재확인한다.
4. `🔴 0` and `🟡 0`이 될 때까지 반복한다.
5. 3회 반복 후에도 unresolved이면 사용자 판단을 요청한다.

## Ambiguity Escalation

1. Builder가 task 문서, `CLAUDE.md`·`AGENTS.md`, `.codex/*.md`, `DESIGN.md`(시각 레퍼런스: Teameet Design HTML), 관련 v1 코드에서 답을 못 찾으면 중단한다.
2. `BLOCKED: {구체적 질문}` 형식으로 planners에 되돌린다.
3. Planners는 task 문서를 갱신하고 `Ambiguity Log`에 남긴다.
4. Builder는 갱신된 문서를 기준으로 재개한다.

## Quality Gates

0. Apply `.codex/qa-rules.md` before final response, especially No useless fallback, No fake tests, Minimal validation load, Host load preflight, Visual verification before completion, No scope retreat, Tech-Debt Grep, Committed-tree verification, and Shared-tree pathspec safety.
1. mock/fixture/MSW/E2E drift 없을 것
2. user-facing false affordance 없을 것
3. trust signal은 sample/estimated/verified를 명확히 구분할 것
4. 신청 확정·결과 확정·승인 등 확정형 플로우는 실패를 성공처럼 시뮬레이션하지 않을 것
5. live runtime contract가 바뀌면 통합 스펙(CI) 또는 머지 후 alpha 응답으로 확인할 것
6. 화면 검증은 로컬 next 서버가 아니라 alpha에서 수행할 것 — 절차는 `CLAUDE.md` "Alpha 실측 검증"과 `scripts/README-alpha-verify.md`
7. UI/design/admin surface changes require alpha screenshot evidence (`ego-browser`), before/after screenshot evidence when visible layout changed, console/network checks, and layout rebalance across relevant breakpoints; tests pass is not completion.
8. Shared dirty tree work must avoid `git add -A`; when a commit is explicitly requested, use `git commit -- <pathspec>` and verify diff scope with `git show --stat` and `git show --name-only`.
9. Run the narrowest changed-contract test once. Before any automated test/typecheck/build/lint, inspect host CPU/load, memory/swap, Node/browser counts, Docker, and target-service health. Heavy validation runs only once immediately before commit, serially with minimum workers; CI owns repeated repository-wide validation.

## Compatibility Rule

- Codex 글로벌 built-in `agent-*` 스킬은 현재 `.codex/agents/`를 직접 보지 않는다.
- 따라서 Codex roster, command alias, mandatory rule이 바뀌면 `.claude/agents/prompts.md` compatibility entry를 같은 변경에서 sync해야 한다.
