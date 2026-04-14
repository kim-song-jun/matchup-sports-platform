# Codex Agent Workflow — Teameet

## Canonical Paths

- canonical agent docs: `.codex/agents/*.md`
- compatibility prompt entry: `.claude/agents/prompts.md`
- task docs: `.github/tasks/{NN}-{slug}.md`
- Playwright runbook: `docs/PLAYWRIGHT_E2E_RUNBOOK.md`

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

1. Builder가 task 문서, `AGENTS.md`, `CLAUDE.md`, `.impeccable.md`, 관련 코드에서 답을 못 찾으면 중단한다.
2. `BLOCKED: {구체적 질문}` 형식으로 planners에 되돌린다.
3. Planners는 task 문서를 갱신하고 `Ambiguity Log`에 남긴다.
4. Builder는 갱신된 문서를 기준으로 재개한다.

## Quality Gates

1. mock/fixture/MSW/E2E drift 없을 것
2. user-facing false affordance 없을 것
3. trust signal은 sample/estimated/verified를 명확히 구분할 것
4. payment/refund/approval 등 거래 플로우는 실패를 성공처럼 시뮬레이션하지 않을 것
5. live runtime contract가 바뀌면 실제 dev port에서 확인할 것
6. concurrent local Playwright runner는 shared `make dev`가 아니라 isolated compose targets로만 검증할 것
7. shared dev stack과 isolated web runtime 모두 stack-local `.next` volume을 유지해 Next dev artifact cross-talk를 막을 것
8. feature screenshot-set analysis는 `scripts/qa/run-e2e-analyzer.mjs`로 수행하고, interrupted job recovery는 `ultraplan/runs/e2e-analyzer*` 디스크 큐 기준으로 재개할 것

## Compatibility Rule

- Codex 글로벌 built-in `agent-*` 스킬은 현재 `.codex/agents/`를 직접 보지 않는다.
- 따라서 Codex roster, command alias, mandatory rule이 바뀌면 `.claude/agents/prompts.md` compatibility entry를 같은 변경에서 sync해야 한다.
