# Task 127 — Tournament parking info

## Scope

- Backend: `apps/v1_api`
- Frontend: `apps/v1_web`
- Docs: `docs/api/domains/supporting-domains.md`

## Request

대회 공개 상세의 현장 안내에서 장소 아래 고정된 주차 안내 문구를 대회별 데이터로 관리한다. 어드민 대회 정보 수정 폼의 장소 바로 아래에서 주차 안내를 수정할 수 있어야 한다.

## Responsibilities

- `V1Tournament.parkingInfo` nullable persisted field와 migration 추가
- admin tournament PATCH DTO/service/response 계약 동기화
- public tournament detail response 및 현장 안내 렌더링 연결
- admin 대회 정보 수정 폼에서 장소 아래 주차 안내 입력·초기화·저장
- API 문서와 관련 테스트 동기화

## Acceptance Criteria

- [x] 기존 대회는 현재 고정 문구를 기본 주차 안내로 유지한다.
- [x] 어드민이 장소 아래 주차 안내를 최대 500자로 수정하고 저장할 수 있다.
- [x] 빈 값 저장은 `null`이며 공개 상세에서 서브 텍스트를 숨긴다.
- [x] 공개 상세의 현장 안내 제목·장소명·지도 동작은 유지된다.
- [x] API/프론트 타입/테스트/문서가 새 필드와 동기화된다.

## Validation

- `pnpm v1:db:generate` — PASS
- `pnpm --filter v1_api exec jest src/tournaments/tournaments-admin.service.spec.ts src/tournaments/tournaments-read.service.spec.ts --runInBand` — PASS (66)
- `pnpm --filter v1_web exec vitest run tournament-venue-retention-sections.test.ts tournament-detail-campaign-tab.test.tsx tournament-detail-client.test.ts --pool=forks --maxWorkers=1` — PASS (66)
- Browser screenshot QA — not run: headed Playwright MCP is not connected in this session.
- Migration replay — PASS: all 81 v1 migrations applied to a temporary PostgreSQL 16 database and `prisma migrate diff --exit-code` reported zero drift.

## Progress Snapshot

- 2026-07-30: implementation, focused contract tests, backend type-check, frontend lint, and empty-DB migration replay complete. Visual runtime QA remains pending; dev push deploys to Alpha after CI.