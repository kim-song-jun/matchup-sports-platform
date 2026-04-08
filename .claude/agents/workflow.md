# Agent Team Workflow — Execution Guide

## Commands

- `@build` → Production team (backend-dev + frontend-dev + infra-dev)
- `@review` → Review team (backend/frontend/infra review)
- `@design` → Design team (design-main + ux-manager + ui-manager)
- `@plan` → Planning team (project-director + tech-planner)
- `@QA` → QA team (4 personas)
- `@all` → Full pipeline (plan → build → review → design → QA)

### Individual Agent
- `@backend-dev [task]` → Backend only
- `@frontend-dev [task]` → Frontend only
- `@qa-beginner [page/feature]` → Beginner QA only
- etc.

---

## Pipeline Patterns

### New Feature
```
1. @plan → project-director + tech-planner (direction + technical review)
   ↓ approved
2. @build → backend-dev + frontend-dev + infra-dev (parallel)
   ↓ complete
3. @review → backend-review + frontend-review + infra-review (parallel)
   ↓ fixes applied
4. @design → design-main + ux-manager + ui-manager (design review)
   ↓ fixes applied
5. @QA → qa-beginner + qa-regular + qa-power + qa-uiux (quality check)
   ↓ final fixes
6. Done
```

### Bug Fix
```
1. @build → relevant dev only (backend-dev or frontend-dev)
2. @review → relevant reviewer only
3. @QA → qa-regular + qa-uiux
```

### Design Refactoring
```
1. @design → design-main (current state audit)
2. @build → frontend-dev (fixes)
3. @design → ux-manager + ui-manager (re-review)
4. @QA → qa-beginner + qa-uiux
```

---

## Execution Rules

1. **Builders always parallel** — backend/frontend/infra work simultaneously if independent (task 문서의 Parallel Work Breakdown에 명시된 대로)
2. **Review after build** — never review incomplete code
3. **QA after review passes** — only enter QA when review OK (Critical=0, Warning=0)
4. **Planning produces task documents** — 비자명한 모든 변경은 `.github/tasks/{N}-{name}.md` 태스크 문서를 먼저 작성한다
5. **Tech debt is a blocker, not a follow-up** — 리뷰어는 범위 내 미해결 부채를 Critical로 표시
6. **Ambiguity escalates up, not sideways** — 빌더는 추측하지 않고 반드시 planners로 에스컬레이션
7. **Mock data sync** — schema 변경 시 같은 변경에서 inline mock 업데이트 필수
8. **Consolidated reports** — combine each agent's result into one summary
9. **No false affordance in user flows** — create/edit UI에 노출한 입력/업로드/직접입력 옵션은 실제 저장 경로와 반드시 일치해야 한다
10. **Keep journey-level visual continuity** — 같은 기능 여정 안에서는 create/list/detail/history가 공통 accent와 control language를 공유해야 한다

---

## Tech Debt Policy (Blocker, Not Follow-up)

기술 부채는 follow-up 티켓으로 미루지 않는다. 빌더가 작업 범위 안에서 TODO/hack/workaround/dead code를 만나면:

1. **같은 변경에서 수정한다** — 별도 커밋/PR/이슈로 분리하지 않는다.
2. 빌드 리포트의 "Tech Debt Resolved" 섹션에 정리한 항목을 기록한다.
3. 리뷰어는 범위 내 미해결 tech debt를 **Critical**로 표시한다 (Warning 아님).
4. 부득이 이연해야 하는 경우 (예: 범위를 크게 넘어감), `tech-planner`가 task 문서의 "Tech Debt Resolved" 섹션에 **명확한 follow-up 트리거**를 문서화한다. "나중에 처리" 같은 모호한 표현은 금지.

---

## Task Document Requirement

작은 버그 수정(한 파일, 비정상 동작 교정)을 제외한 모든 변경은 기획 단계에서 `.github/tasks/{N}-{task-name}.md`를 먼저 생성한다.

필수 섹션: Context / Goal / Original Conditions / User Scenarios / Test Scenarios / Parallel Work Breakdown / Acceptance Criteria / Tech Debt Resolved / Security Notes / Risks / Ambiguity Log

상세 템플릿은 `prompts.md`의 "Task Document Format" 섹션 참조.

빌더는 task 문서 없이 비자명한 변경을 시작하지 않는다. 태스크 없이 빌드 요청이 들어오면 오케스트레이터는 `@plan`을 먼저 호출한다.

---

## Review-Fix Iteration

```
Builders → Reviewers → [Critical/Warning found] → Builders fix → Reviewers re-check → ... → [Critical 0, Warning 0] → OK
```

- Max 3 iterations, then escalate to user
- Re-check verifies only previous findings (not full re-review)
- Suggestions are optional, don't block the pipeline

### Review Severity — What Counts as Critical

리뷰어는 아래 항목을 **Critical (🔴)** 로 판정한다:

- 보안 위반: 하드코딩 시크릿, auth bypass, SQL/XSS/CSRF 벡터, CORS/CSP 위반, 민감 정보 노출
- 범위 내 미해결 tech debt: TODO, hack, dead code, `any` leak, 임시 우회
- Schema ↔ mock 드리프트: Prisma 모델/DTO/API 타입 변경 후 inline mock (`*.spec.ts`, `*.test.tsx`) 미업데이트
- 디자인 토큰 위반 (frontend-review): 하드코딩 컬러/간격/폰트, 공유 컴포넌트 대신 인라인 마크업, class-naming 불일치
- 원본 요구사항의 조용한 드롭 (task 문서 Original Conditions 중 충족되지 않은 항목)
- 데이터 손실/손상 위험, 크래시 유발

Critical 1개라도 있으면 리뷰 통과 불가. Warning까지 0이 되어야 QA 단계 진입.

---

## Ambiguity Escalation Loop (Builder → Planner)

빌더 에이전트가 아래 소스에서 모호함을 해소할 수 없을 때:
- task 문서
- 기존 코드베이스
- CLAUDE.md
- 디자인 시스템 문서 (`.impeccable.md`)

...**작업을 중단하고 에스컬레이션한다**. 흐름:

```
Builder 모호함 발견
  ↓
Builder 작업 중단, 오케스트레이터에 "BLOCKED: {구체적 질문}" 보고
  ↓
오케스트레이터 @plan 재호출 (project-director + tech-planner)
  ↓
Planners가 원본 task 문서 + 빌더 질문을 읽음
  ↓
Planners 논의, task 문서 업데이트 (Ambiguity Log + 영향 섹션)
  ↓
오케스트레이터가 업데이트된 task 문서를 빌더에게 재핸드오프
  ↓
Builder가 명확해진 계획에서 작업 재개
```

**핵심 원칙**:
- 이 루프는 **실패가 아니라 올바른 경로**다. 요구사항이 불명확하면 반드시 이 경로를 탄다.
- 빌더는 루프를 피하기 위해 추측하고 진행해서는 **절대** 안 된다.
- 각 에스컬레이션은 task 문서의 Ambiguity Log에 반드시 기록한다 (date / raised by / question / resolution).
- **같은 모호함이 3회 이상** 에스컬레이션되면 오케스트레이터는 루프를 중단하고 사용자에게 직접 질문한다.
- 태스크당 최대 3회 에스컬레이션 후 휴먼 체크포인트.

---

## Report Formats

### Build Report
```
## Build Report
### Backend
- Changed files: [list]
- Tests: [results]
### Frontend
- Changed files: [list]
- Tests: [results]
### Infra
- Changed files: [list]
- Tests: [results]
```

### Review Report
```
## Code Review Report
Critical(N) / Warning(N) / Good(N) / Suggestion(N)

### Critical
- [file:line] description

### Warning
- [file:line] description
```

### QA Report
```
## QA Report
Pass: N/M scenarios
Fail: [failed scenarios + reproduction steps]
Improvements: [list]
```

---
<!-- codex-init:delta version=1 timestamp=20260407_130704 -->

## Injected by codex-init

The sections below fill project-specific gaps while preserving curated content above.

## Corrected Pipeline Order

### New Feature

`@plan -> @build -> @review/fix loop -> @design -> @test -> @docs`

### Bug Fix

`@build -> @review/fix loop -> @test -> @docs`

### Design Refactor

`@design audit -> @build -> @design review/fix -> @test -> @docs`

### Docs Only

`@docs` after confirming no code, schema, runtime, or test changes are required

## Current Repo Runtime Notes

- Use `make dev`, `make up`, or `make dev-local` as the default execution entrypoints.
- Dev source-of-truth ports are `web=3003` and `api=8111`.
- Production compose uses `web=3000` and `api=8100`.
- Swagger lives at `http://localhost:8111/docs` in dev.
- Production EC2 access is `ec2-user`, and the bootstrap path may leave the host with standalone `docker-compose` instead of the `docker compose` plugin. Infra work must not assume only one form exists.
- Keep the dev Docker runtime on a glibc-based Node image, resync dev `node_modules` volumes from the image via a `nocopy` bootstrap service on each startup, and point `pg_isready` at the configured database name.
- Keep production hashing on native `bcrypt`, but allow dev compose to override the hash driver to `bcryptjs` when native addons are not reliably loadable in the mounted workspace runtime.
- Keep Postgres and Redis on the internal Docker network in dev, and gate `web` startup on the API healthcheck instead of `service_started`.

## Current Repo Validation Notes

- Frontend unit: `make test-web` or `pnpm --filter web test`
- Backend unit: `make test-api` or `pnpm --filter api test`
- Backend integration: `make test-integration` or `pnpm --filter api test:integration`
- E2E: `make test-e2e` or `pnpm exec playwright test --config=e2e/playwright.config.ts`
- Local Playwright defaults should stay conservative for Next dev: `workers=1`, `fullyParallel=false`, `navigationTimeout=60_000`, `line` reporter. Override with env vars only when intentionally load-testing the dev server.
- Nest API validation is strict (`whitelist + forbidNonWhitelisted`). Frontend forms with UI-only fields must sanitize submit payloads before POST/PATCH.
- Guarded-route E2E helpers should wait for an authenticated home-state signal before navigating deeper, or auth-wall false negatives can appear during hydration.
- Cross-cutting: `pnpm build`, `pnpm lint`

## Fixture / Mock Sync Gate

Review is not complete if a change touches schema, DTOs, API responses, or seeded/demo content without syncing the relevant test and mock surfaces:

- `apps/api/test/fixtures/`
- `apps/web/src/test/msw/`
- `apps/web/public/mock/`
- `apps/web/public/mock/photoreal/ATTRIBUTION.md`
- `e2e/fixtures/`
- affected inline mocks in `*.spec.ts` / `*.test.tsx`

When the change adds or replaces photoreal mock images, review must also confirm that:

- the consuming catalog/helper points at local photo assets rather than remote URLs
- attribution metadata (source URL, creator, license) is recorded alongside the asset set
- explicit photoreal slots do not continue to mix SVG or generated art inside the same active fallback catalog
- empty upload states on user-facing create/edit surfaces do not regress to generic gray placeholders when the product already uses a photoreal helper strategy

## Docs Last Rule

`docs-writer` runs after the code path is stable and records:

- what changed
- which commands/ports/instructions were affected
- whether `AGENTS.md` or `.claude/agents/*` required updates
- any remaining documentation drift

### Docs Report

```
## Docs Report
Updated: [files]
Summary: [what changed and why]
Open gaps: [remaining drift or follow-up]
```

<!-- /codex-init:delta -->
