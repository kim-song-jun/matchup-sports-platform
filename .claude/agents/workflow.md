# Agent Team Workflow — Execution Guide

## Commands

- `@build` → Production team (6 builders: backend-api-dev + backend-data-dev + frontend-ui-dev + frontend-data-dev + infra-devops-dev + infra-security-dev)
- `@backend` → Backend only (backend-api-dev + backend-data-dev)
- `@frontend` → Frontend only (frontend-ui-dev + frontend-data-dev)
- `@infra` → Infra only (infra-devops-dev + infra-security-dev)
- `@review` → Review team (backend-review + frontend-review + infra-review)
- `@design` → Design team (design-main + ux-manager + ui-manager)
- `@plan` → Planning team (project-director + tech-planner)
- `@QA` → QA team (4 personas)
- `@docs` → docs-writer
- `@all` → Full pipeline (plan → build → review → design → QA → docs)

### Individual Agent
- `@backend-api-dev [task]` → Backend API layer only
- `@backend-data-dev [task]` → Backend data layer only
- `@frontend-ui-dev [task]` → Frontend UI only
- `@frontend-data-dev [task]` → Frontend data layer only
- `@qa-beginner [page/feature]` → Beginner QA only
- etc.

---

## Pipeline Patterns

### New Feature
```
1. @plan → project-director + tech-planner (direction + technical review)
   ↓ task document created at .github/tasks/{N}-{name}.md
2. @build → 6 builders parallel (per ownership matrix)
   ↓ complete + tsc --noEmit pass
3. @review → backend-review + frontend-review + infra-review (parallel)
   ↓ Critical=0, Warning=0
4. @design → design-main + ux-manager + ui-manager (design review)
   ↓ fixes applied
5. @QA → qa-beginner + qa-regular + qa-power + qa-uiux (quality check)
   ↓ final fixes
6. @docs → docs-writer (documentation update)
7. Done
```

### Bug Fix
```
1. @build → relevant dev only (backend-api-dev or frontend-ui-dev etc.)
2. @review → relevant reviewer only
3. @QA → qa-regular + qa-uiux
4. @docs → docs-writer (if behavior changed)
```

### Design Refactoring
```
1. @design → design-main (current state audit)
2. @build → frontend-ui-dev (fixes)
3. @design → ux-manager + ui-manager (re-review)
4. @QA → qa-beginner + qa-uiux
5. @docs → docs-writer
```

---

## Execution Rules

1. **Builders always parallel** — 6 builders work simultaneously when ownership is independent (per task document's Parallel Work Breakdown)
2. **Review after build** — never review incomplete code
3. **QA after review passes** — only enter QA when `Critical=0, Warning=0`
4. **Planning produces task documents** — 비자명한 모든 변경은 `.github/tasks/{N}-{name}.md` 먼저 작성
5. **Tech debt is a blocker, not a follow-up** — 리뷰어는 범위 내 미해결 부채를 Critical로 표시
6. **Ambiguity escalates up, not sideways** — 빌더는 추측하지 않고 반드시 planners로 에스컬레이션
7. **Mock data sync** — schema 변경 시 같은 변경에서 inline mock, fixtures, MSW handlers 업데이트 필수
8. **Consolidated reports** — combine each agent's result into one summary
9. **No false affordance in user flows** — create/edit UI의 입력/업로드 옵션은 실제 저장 경로와 일치
10. **Keep journey-level visual continuity** — 같은 기능 여정 안에서 create/list/detail/history가 공통 accent 공유
11. **Trust signals must be truthful** — 배지, 평점, 전적은 verified/sample/estimated 상태 명확히 구분
12. **No silent capability narrowing** — list/create/edit/detail 하위 플로우는 서비스 범위를 축소하면 안 됨
13. **Edit screens must bind to the routed entity** — manage/edit surface가 다른 seed/mock 엔티티로 fallback 금지
14. **Transactional flows must not fake success** — 결제/환불/신청 확정은 API 실패를 성공으로 덮으면 안 됨
15. **Transactional entrypoints need real context** — checkout/refund/approval CTA는 필수 컨텍스트를 실제 서버 바인딩 기준으로 전달
16. **Admin flows must stay in admin context** — 관리자 흐름은 admin shell 안에서 맥락 유지
17. **Operational actions need auditability** — 제재/정산/분쟁 처리는 처리 주체, 사유, 결과 추적 가능
18. **Runtime image fallback is mandatory** — 사용자-facing 이미지가 원격 URL을 받으면 로컬 mock으로 degrade
19. **Deploy-safe data sync must be idempotent** — 운영 배포는 destructive seed 대신 idempotent backfill
20. **URL-synced filter UIs must merge against pending local state** — stale searchParams 재사용 금지
21. **Live runtime contract must be verified on the real port** — DTO/query 변경은 `localhost:8111` 응답 재확인

---

## Tech Debt Policy (Blocker, Not Follow-up)

기술 부채는 follow-up 티켓으로 미루지 않는다:

1. **같은 변경에서 수정** — 별도 커밋/PR/이슈로 분리하지 않음
2. 빌드 리포트 "Tech Debt Resolved" 섹션에 기록
3. 리뷰어는 범위 내 미해결 tech debt를 **Critical**로 표시
4. 부득이 이연 시 `tech-planner`가 **명확한 follow-up 트리거** 문서화. "나중에 처리" 금지.

---

## Task Document Requirement

작은 버그 수정을 제외한 모든 변경은 `.github/tasks/{N}-{task-name}.md`를 먼저 생성.

필수 섹션: Context / Goal / Original Conditions / User Scenarios / Test Scenarios / Parallel Work Breakdown / Acceptance Criteria / Tech Debt Resolved / Security Notes / Risks / Ambiguity Log

빌더는 task 문서 없이 비자명한 변경을 시작하지 않는다. 태스크 없이 빌드 요청 → 오케스트레이터가 `@plan` 먼저 호출.

---

## Review-Fix Iteration

```
Builders → Reviewers → [Critical/Warning found] → Builders fix → Reviewers re-check → ... → [Critical 0, Warning 0] → OK
```

- Max 3 iterations, then escalate to user
- Re-check verifies only previous findings (not full re-review)
- Suggestions are optional, don't block the pipeline

### Review Severity — What Counts as Critical

- 보안 위반: 하드코딩 시크릿, auth bypass, SQL/XSS/CSRF 벡터, CORS/CSP 위반
- 범위 내 미해결 tech debt: TODO, hack, dead code, `any` leak
- Schema ↔ mock 드리프트: Prisma 모델/DTO/API 변경 후 mock 미업데이트
- 디자인 토큰 위반 (frontend-review): 하드코딩 컬러/간격, 공유 컴포넌트 미사용
- 원본 요구사항의 조용한 드롭

Critical ≥ 1 → 리뷰 통과 불가. Warning까지 0 → QA 진입.

---

## Ambiguity Escalation Loop (Builder → Planner)

빌더가 아래 소스에서 모호함을 해소할 수 없을 때:
- task 문서, 기존 코드, CLAUDE.md, `.impeccable.md`

→ **작업 중단하고 에스컬레이션**:

```
Builder 모호함 발견
  ↓
Builder 작업 중단, "BLOCKED: {구체적 질문}" 보고
  ↓
오케스트레이터 @plan 재호출
  ↓
Planners가 task 문서 + 빌더 질문 읽음
  ↓
Planners 논의, task 문서 업데이트 (Ambiguity Log + 영향 섹션)
  ↓
업데이트된 task 문서를 빌더에게 재핸드오프
  ↓
Builder 작업 재개
```

- 이 루프는 **실패가 아니라 올바른 경로**
- 빌더는 추측하고 진행 **절대 금지**
- 각 에스컬레이션 → Ambiguity Log 기록
- **같은 모호함 3회 이상** → 사용자에게 직접 질문
- 태스크당 최대 3회 에스컬레이션 후 휴먼 체크포인트

---

## Current Repo Runtime Notes

- `make dev`, `make up`, `make dev-local` for local development
- Dev ports: web=3003, api=8111, Swagger=`http://localhost:8111/docs`
- Prod ports: web=3000, api=8100
- Production EC2: `ec2-user`, may have standalone `docker-compose`
- Dev Docker: glibc Node image, `nocopy` bootstrap, `bcryptjs` override
- Postgres/Redis: internal Docker network, `web` gated on API healthcheck
- Nest validation: strict (`whitelist + forbidNonWhitelisted`)

---

## Validation Commands

| Scope | Command |
|-------|---------|
| Frontend type check | `cd apps/web && npx tsc --noEmit` |
| Frontend unit | `make test-web` or `pnpm --filter web test` |
| Backend unit | `make test-api` or `pnpm --filter api test` |
| Backend integration | `make test-integration` or `pnpm --filter api test:integration` |
| E2E | `make test-e2e` or `pnpm exec playwright test --config=e2e/playwright.config.ts` |
| Full build | `pnpm build` |
| Full lint | `pnpm lint` |

---

## Fixture / Mock Sync Gate

Review is not complete if a change touches schema, DTOs, API responses, or seeded content without syncing:
- `apps/api/test/fixtures/`
- `apps/web/src/test/msw/`
- `apps/web/public/mock/`
- `e2e/fixtures/`
- Affected inline mocks in `*.spec.ts` / `*.test.tsx`

---

## Report Formats

### Build Report
```
## Build Report
### Backend (API + Data)
- Changed files: [list]
- Tests: [results]
### Frontend (UI + Data)
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

### Docs Report
```
## Docs Report
Updated: [files]
Summary: [what changed and why]
Open gaps: [remaining drift or follow-up]
```

---
<!-- codex-init:delta version=1 timestamp=20260410_175045 -->

## Injected by codex-init

The sections below fill project-specific gaps while preserving curated content above.

### Codex Normalized Alias Overlay

- Codex built-in orchestration에서는 `backend-dev`, `frontend-dev`, `infra-dev` 3-builder 구성을 기본으로 본다.
- 이 저장소에서는 각각 `backend-api-dev + backend-data-dev`, `frontend-ui-dev + frontend-data-dev`, `infra-devops-dev + infra-security-dev`로 압축 해석한다.

### Docs-Only Pipeline

1. 요청 범위가 순수 문서 변경인지 확인한다.
2. `docs-writer`가 source-of-truth 문서를 먼저 갱신한다.
3. 코드/런타임/검증 명령이 변경됐다면 `AGENTS.md`, `.codex/agents/*`, `.claude/agents/prompts.md` compatibility entry까지 함께 sync한다.
4. code diff가 생기지 않았는지 확인한 뒤 종료한다.

### Compatibility Sync Rule

- `.codex/agents/`는 Codex canonical workflow source다.
- `.claude/agents/workflow.md`는 저장소 운영 문서로 유지하되, Codex roster, alias, review-fix gate, docs-last rule이 바뀌면 `.codex/agents/workflow.md`와 drift 없이 같은 변경에서 갱신한다.

<!-- /codex-init:delta -->
