# Codex Compatibility Prompts — MatchUp

이 파일은 **Codex 글로벌 `agent-*` 스킬 compatibility entry**다. Codex canonical 문서는 `.codex/agents/`가 source of truth이며, 이 파일은 현재 Codex built-in skill이 자동 탐색하는 `.claude/agents/prompts.md` 경로를 채우기 위해 유지한다.

## Canonical Source

- canonical prompts: `.codex/agents/prompts.md`
- canonical team config: `.codex/agents/team-config.md`
- canonical workflow: `.codex/agents/workflow.md`
- detailed agent docs: `.codex/agents/*.md`

## Roster Mapping

| Codex agent | Claude source |
|-------------|---------------|
| `backend-dev` | `backend-api-dev` + `backend-data-dev` |
| `frontend-dev` | `frontend-ui-dev` + `frontend-data-dev` |
| `infra-dev` | `infra-devops-dev` + `infra-security-dev` |
| `backend-review` | direct carry-over |
| `frontend-review` | direct carry-over |
| `infra-review` | direct carry-over |
| `design-main` | direct carry-over |
| `ux-manager` | direct carry-over |
| `ui-manager` | direct carry-over |
| `project-director` | direct carry-over |
| `tech-planner` | direct carry-over |
| `qa-beginner` | direct carry-over |
| `qa-regular` | direct carry-over |
| `qa-power` | direct carry-over |
| `qa-uiux` | direct carry-over |
| `docs-writer` | direct carry-over |

## Production Team

### `backend-dev`
- 상세 문서: `.codex/agents/backend-dev.md`
- 범위: NestJS controller/service/module/DTO, Prisma schema/seed, fixtures, integration tests.
- 필수 계약: `/api/v1`, `TransformInterceptor`, strict `ValidationPipe`, `JwtAuthGuard`, `AdminGuard`, `TeamMembershipService.assertRole(...)`.
- sync 대상: `apps/api/test/fixtures/`, `apps/web/src/test/msw/`, `e2e/fixtures/`, inline mocks.

### `frontend-dev`
- 상세 문서: `.codex/agents/frontend-dev.md`
- 범위: Next.js App Router UI, hooks/stores/types, React Query/Zustand, MSW, i18n, mock images.
- 필수 계약: `.impeccable.md` 우선, Tailwind token-first, shared UI reuse, `useRequireAuth()` 적용.
- sync 대상: `apps/web/src/test/msw/`, `apps/web/public/mock/`, `e2e/fixtures/`, 관련 타입과 inline test mock.

### `infra-dev`
- 상세 문서: `.codex/agents/infra-dev.md`
- 범위: compose/deploy/Makefile/workflows, runtime healthcheck, auth/config safety.
- 필수 계약: dev `3003/8111`, prod `3000/8100`, destructive seed 금지, `.env*` 미접근.

## Review Team

### `backend-review`
- 상세 문서: `.codex/agents/backend-review.md`
- Critical: 보안 위반, unresolved tech debt, schema/mock drift, silently dropped requirements.

### `frontend-review`
- 상세 문서: `.codex/agents/frontend-review.md`
- Critical: `any` leak, design token 위반, missing dark-mode pairs, MSW/type drift, accessibility blocker.

### `infra-review`
- 상세 문서: `.codex/agents/infra-review.md`
- Critical: secret exposure, unsafe deploy path, healthcheck regressions.

## Design Team

### `design-main`
- 상세 문서: `.codex/agents/design-main.md`

### `ux-manager`
- 상세 문서: `.codex/agents/ux-manager.md`

### `ui-manager`
- 상세 문서: `.codex/agents/ui-manager.md`

## Planning Team

### `project-director`
- 상세 문서: `.codex/agents/project-director.md`
- 산출물: `.github/tasks/{NN}-{slug}.md`

### `tech-planner`
- 상세 문서: `.codex/agents/tech-planner.md`
- 책임: architecture, parallel breakdown, tests, security, ambiguity resolution.

## QA Team

### `qa-beginner`
- 상세 문서: `.codex/agents/qa-beginner.md`

### `qa-regular`
- 상세 문서: `.codex/agents/qa-regular.md`

### `qa-power`
- 상세 문서: `.codex/agents/qa-power.md`

### `qa-uiux`
- 상세 문서: `.codex/agents/qa-uiux.md`

## Docs

### `docs-writer`
- 상세 문서: `.codex/agents/docs-writer.md`
- compatibility drift가 생기면 `.codex/agents/*`와 이 파일을 같은 변경에서 sync한다.
