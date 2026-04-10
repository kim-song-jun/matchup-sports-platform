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
- 추가 계약: production deploy는 DB/JWT 같은 truly required env만 fail-fast 검증하고, Toss 결제 시크릿은 없으면 mock mode로 둔다. GitHub repo secrets를 쓰는 경우 EC2 `deploy/.env`도 그 값으로 수렴시켜 stale host secret을 남기지 않는다. readiness는 process liveness가 아니라 `/api/v1/health` 기준으로 본다. Next.js production image는 `NEXT_PUBLIC_API_URL`과 `INTERNAL_API_ORIGIN` build-time 주입을 명시적으로 처리한다.

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

---
<!-- codex-init:delta version=1 timestamp=20260410_175045 -->

## Injected by codex-init

The sections below fill project-specific gaps while preserving curated content above.

### Normalized Codex Prompt Supplements

이 파일이 Codex built-in compatibility entry로 사용될 때는 위 매핑에 더해 아래 계약을 적용한다.

#### `backend-dev`
- owned surfaces: `apps/api/src/**`, `apps/api/prisma/**`, `apps/api/test/**`
- stack context: NestJS 11, Prisma 6, PostgreSQL 16, Redis 7, Jest/Supertest, dev API `localhost:8111`
- mandatory checks: auth/authz, DTO completeness, fixture/MSW/E2E sync, live contract check when DTO/query changes
- output: changed backend files, tests run, runtime contract verification, residual risks

#### `frontend-dev`
- owned surfaces: `apps/web/src/**`, `apps/web/public/mock/**`, `apps/web/messages/**`
- stack context: Next.js 15 App Router, React 19, Tailwind v4, TanStack Query 5, Zustand 5, next-intl, Playwright on `localhost:3003`
- mandatory checks: `.impeccable.md`, shared UI reuse, dark pair completeness, truthful trust signals, no false affordance
- output: changed routes/components/hooks, tests and typecheck, mock/image sync, UX regressions if any

#### `infra-dev`
- owned surfaces: `docker-compose*`, `deploy/**`, `Makefile`, `.github/workflows/**`, `infra/**`
- stack context: Docker Compose dev, EC2 deploy, prod `web=3000` / `api=8100`, dev `web=3003` / `api=8111`
- mandatory checks: health-gated startup, idempotent data sync, no `.env*` access, no destructive seed on deploy path
- output: changed infra files, validation steps, deploy/runtime impact, rollback considerations

#### `backend-review`
- owned scope: backend code, Prisma schema, backend tests, API contracts
- mandatory checks: security, auth/authz, response envelope, tech debt in scope, schema/mock drift
- output: `🔴/🟡/🟢/💡` review with file references and concrete fix direction

#### `frontend-review`
- owned scope: App Router UI, hooks/stores/types, MSW, responsive behavior, a11y
- mandatory checks: token usage, loading/error/empty states, dark mode parity, motion/accessibility, API/UI contract drift
- output: `🔴/🟡/🟢/💡` review with file references and user-visible regression framing

#### `infra-review`
- owned scope: compose/deploy/workflow/runtime config/security posture
- mandatory checks: secrets handling, port/network assumptions, healthcheck correctness, deploy safety, CI drift
- output: `🔴/🟡/🟢/💡` review with operational risk and validation gap notes

#### `design-main`
- owned scope: theme direction, brand consistency, trust-first visual language
- mandatory checks: `.impeccable.md` priority, restrained energy, non-template look, journey-level consistency
- output: design findings with page/flow references and clear pass/fail rationale

#### `ux-manager`
- owned scope: onboarding, navigation, key user journeys, recovery paths
- mandatory checks: discoverability, task clarity, friction removal, admin/public context separation
- output: flow findings, broken journeys, ambiguity points, proposed UX corrections

#### `ui-manager`
- owned scope: components, spacing, typography, responsive details, motion polish
- mandatory checks: token-first spacing/type, shared component reuse, 44x44 targets, dark pairs, animation restraint
- output: page-level UI issues with concrete component references

#### `project-director`
- owned scope: scope framing, priority, acceptance criteria, business value
- mandatory checks: preserve original request, confirm in/out of scope, require task doc for non-trivial work
- output: `.github/tasks/{NN}-{slug}.md` updates with context, goal, acceptance criteria, risks

#### `tech-planner`
- owned scope: architecture, sequencing, parallel breakdown, security/test strategy
- mandatory checks: smallest viable design, ambiguity logging, dependency ordering, validation plan
- output: implementation plan, parallel work breakdown, security notes, ambiguity resolutions

#### `qa-beginner`
- owned scope: first-use experience and terminology clarity
- mandatory checks: onboarding comprehension, empty state clarity, obvious next action, friendly failure states
- output: pass/fail scenarios, reproduction, confusion points

#### `qa-regular`
- owned scope: repeat-user workflows across match, team, lesson, marketplace, chat
- mandatory checks: filter/create/detail/history continuity, transaction recovery, notification/navigation reliability
- output: pass/fail scenarios, regressions, practical improvements

#### `qa-power`
- owned scope: admin and heavy-use workflows, edge cases, bulk states
- mandatory checks: permission boundaries, ops auditability, large dataset behavior, failure handling
- output: pass/fail scenarios, operational risks, stress-path improvements

#### `qa-uiux`
- owned scope: visual polish, responsive behavior, dark mode, motion, a11y
- mandatory checks: WCAG AA basics, focus states, reduced motion, modal/lightbox behavior, viewport-specific bugs
- output: pass/fail scenarios, visual defects, interaction polish recommendations

#### `docs-writer`
- owned surfaces: `AGENTS.md`, `.codex/agents/**`, `.claude/agents/prompts.md`, `README.md`, `.github/tasks/**`, `docs/scenarios/**`
- mandatory checks: new gotchas/rules captured, runtime and validation commands current, compatibility drift resolved
- output: updated file list, guidance summary, remaining drift or deferred follow-up

<!-- /codex-init:delta -->
