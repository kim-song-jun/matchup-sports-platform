# Backend API Contract Consistency Matrix

Date: 2026-04-11
Scope: cross-cutting patterns in `apps/api` vs `docs/api/**`

## Purpose

이 문서는 route-by-route 감사 보고서가 아니라, 반복되는 contract inconsistency와 duplication을 한눈에 보기 위한 matrix다.

## Matrix

| Theme | Current State | Evidence | Problem | Target Standard | Priority |
|---|---|---|---|---|---|
| Capability gating | 일부 route는 summary/document intent와 guard가 어긋남 | `apps/api/src/badges/badges.controller.ts` | admin-only로 읽히는 mutation이 public으로 열려 있음 | controller summary, docs, actual guard가 1:1 일치 | P0 |
| Capability exposure | route는 존재하지만 기능은 미구현 | `apps/api/src/auth/auth.controller.ts`, `apps/api/src/auth/auth.service.ts` | frontend가 “지원되는 기능”으로 오해 가능 | implement-or-hide policy | P0 |
| Notifications pagination | query는 cursor/limit, response는 bare array | `apps/api/src/notifications/notifications.controller.ts`, `notifications.service.ts` | infinite scroll 계약 모호, invalid limit path 취약 | explicit DTO + explicit response metadata | P0 |
| Admin persistence | disputes는 in-memory, settlements는 Prisma | `apps/api/src/disputes/disputes.service.ts`, `apps/api/src/settlements/settlements.service.ts` | admin/support surface 신뢰도가 도메인마다 다름 | canonical admin surface는 persistent by default | P0 |
| Mutation typing | 여러 mutation이 raw body 또는 inline object | venues/reviews/disputes/settlements/badges controllers | `ValidationPipe`와 Swagger 품질이 약함 | DTO-first mutation policy | P1 |
| Query parsing | manual parse+clamp와 DTO validation 혼재 | teams/lessons/marketplace/notifications vs matches/mercenary/chat | 동일 입력이 endpoint마다 다르게 처리됨 | list query DTO + shared helper | P1 |
| List shape | `{ items, nextCursor }`, `{ data, nextCursor, hasMore }`, bare array 혼재 | service layer 전반 | frontend helper 재사용성 저하 | list taxonomy 확정 또는 점진 통일 | P1 |
| Optional auth | common guard와 mercenary-local guard 중복 | `apps/api/src/common/guards/optional-jwt-auth.guard.ts`, `apps/api/src/mercenary/guards/optional-jwt-auth.guard.ts` | behavior drift 가능성 | common guard single source | P2 |
| Error normalization | `message`가 string/string[]/object 혼재 | `http-exception.filter.ts` + domain-level exceptions | frontend common error parser 비용 증가 | `code/message/details` policy | P2 |
| Docs-to-code governance | caution은 문서화됐지만 fix backlog 연결이 약함 | `docs/api/**`, Task 49 | warning이 남아도 실행 순서가 흐려짐 | audit task + remediation wave 관리 | P2 |

## Recommended Standards

### Standard A — Mutation DTO First

- public/admin mutation은 DTO를 기본값으로 한다.
- raw body는 예외로만 허용하고, 예외 사유를 코드와 문서에 남긴다.

### Standard B — List Contract Taxonomy

- `CursorList<T>`: `{ items, nextCursor }`
- `CursorWindow<T>`: `{ data, nextCursor, hasMore }` only when chat-like ordering semantics가 필요할 때만 허용
- bare array는 non-paginated small reference list에만 허용

### Standard C — Capability Policy

- route가 열려 있으면 product적으로 지원되는 기능이어야 한다.
- 미구현 capability는 route를 숨기거나, docs/swagger/UI에서 unsupported로 명시한다.

### Standard D — Admin Surface Integrity

- admin/support surface는 persistence와 auditability가 기본 계약이다.
- demo/in-memory surface는 canonical admin namespace에 오래 남기지 않는다.

## Suggested Ownership

- Backend
  - DTO rollout
  - auth guard hardening
  - pagination helper/common query DTO
  - dispute persistence
- Frontend
  - response taxonomy helper alignment
  - unsupported capability UI gating
- Docs
  - caution removal/sync
  - task/report linkage

## Validation Checklist

- route summary와 actual guard가 일치하는가
- query invalid input 처리 방식이 문서와 일치하는가
- paginated endpoint가 cursor metadata를 실제로 제공하는가
- raw-body mutation이 DTO로 치환되었는가
- optional auth guard가 single source인지
- docs/api caution이 code change 후 stale 상태로 남아 있지 않은가
