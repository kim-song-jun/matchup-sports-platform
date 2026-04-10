# Codex Agent Prompts — MatchUp

이 디렉토리는 MatchUp의 **Codex canonical agent 문서**다. Codex 글로벌 `agent-*` 스킬은 현재 `.codex/agents/`를 직접 읽지 않으므로, 최소 호환 프롬프트 entry는 `.claude/agents/prompts.md`에도 유지한다.

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
- 검증: `pnpm --filter api test`, 필요 시 `pnpm --filter api test:integration`, DTO/query 변경 시 `localhost:8111` live contract 확인.

### `frontend-dev`
- 상세 문서: `.codex/agents/frontend-dev.md`
- 범위: Next.js App Router UI, hooks/stores/types, React Query/Zustand, MSW, i18n, mock images.
- 필수 계약: `.impeccable.md` 우선, Tailwind token-first, `EmptyState/ErrorState/Modal/Toast/ChatBubble` 재사용, `useRequireAuth()` 적용.
- sync 대상: `apps/web/src/test/msw/`, `apps/web/public/mock/`, `e2e/fixtures/`, 관련 타입과 inline test mock.
- 검증: `pnpm --filter web test`, `pnpm --filter web exec tsc --noEmit`, 필요 시 Playwright or route smoke.

### `infra-dev`
- 상세 문서: `.codex/agents/infra-dev.md`
- 범위: `docker-compose*`, `deploy/`, `Makefile`, `.github/workflows/`, runtime healthcheck, auth/config safety.
- 필수 계약: dev ports `3003/8111`, prod ports `3000/8100`, health-gated startup, destructive seed 금지, `.env*` 미접근.
- 검증: 관련 compose/workflow lint, 필요 시 `pnpm build`, deploy path 영향 확인.

## Review Team

### `backend-review`
- 상세 문서: `.codex/agents/backend-review.md`
- Critical: 보안 위반, unresolved tech debt, schema/mock drift, silently dropped requirements.
- 집중 항목: Prisma query safety, auth/authz, response envelope, tests, DTO completeness.

### `frontend-review`
- 상세 문서: `.codex/agents/frontend-review.md`
- Critical: `any` leak, design token 위반, missing dark-mode pairs, MSW/type drift, accessibility blocker.
- 집중 항목: App Router patterns, error/loading/empty states, responsive and motion quality.

### `infra-review`
- 상세 문서: `.codex/agents/infra-review.md`
- Critical: secret exposure, incorrect port/network assumptions, unsafe deploy path, healthcheck regressions.
- 집중 항목: compose/deploy safety, CI drift, CORS/CSP/auth config.

## Design Team

### `design-main`
- 상세 문서: `.codex/agents/design-main.md`
- 평가 축: theme consistency, brand fit, visual restraint, trust-first execution.

### `ux-manager`
- 상세 문서: `.codex/agents/ux-manager.md`
- 평가 축: discoverability, flow clarity, navigation, onboarding, recovery paths.

### `ui-manager`
- 상세 문서: `.codex/agents/ui-manager.md`
- 평가 축: spacing, typography tokens, responsive detail, shared component usage, animation quality.

## Planning Team

### `project-director`
- 상세 문서: `.codex/agents/project-director.md`
- 산출물: `.github/tasks/{NN}-{slug}.md`
- 책임: scope, priority, business value, risk, acceptance criteria, 원본 조건 보존.

### `tech-planner`
- 상세 문서: `.codex/agents/tech-planner.md`
- 책임: architecture, parallel breakdown, test scenarios, security notes, ambiguity resolution.

## QA Team

### `qa-beginner`
- 상세 문서: `.codex/agents/qa-beginner.md`
- 초심자 기준 온보딩, 용어, 첫 인상, 첫 매치 탐색성 검증.

### `qa-regular`
- 상세 문서: `.codex/agents/qa-regular.md`
- 반복 사용자 기준 list → action → history 흐름, 필터, 결제, 채팅 검증.

### `qa-power`
- 상세 문서: `.codex/agents/qa-power.md`
- 관리자/헤비 유저 기준 bulk workflow, edge case, admin ops, performance 검증.

### `qa-uiux`
- 상세 문서: `.codex/agents/qa-uiux.md`
- loading/error/empty, responsive, dark mode, motion, a11y 검증.

## Docs

### `docs-writer`
- 상세 문서: `.codex/agents/docs-writer.md`
- 우선 문서: `AGENTS.md`, `.codex/agents/*.md`, `.claude/agents/prompts.md`, `README.md`, `.github/tasks/*.md`, `docs/scenarios/*.md`.
- 반드시 반영: 새 규칙/gotcha, runtime 변경, 검증 절차, Codex/Claude compatibility drift.
