# Task 52 — Backend API Contract Implementation Audit Plan

Owner: project-director + tech-planner -> backend-dev + frontend-dev + infra-dev + docs-writer
Date drafted: 2026-04-11
Status: Completed
Priority: P0

## Context

Task 49에서 `docs/api/**`를 frontend integration의 canonical contract로 정리했다. 이후 Task 51은 그 문서를 기준으로 frontend hook/type drift 일부를 정리했다.

하지만 문서가 정리됐다고 해서 실제 backend implementation이 같은 수준으로 일관되고 안전해진 것은 아니다. 현재 코드베이스에는 다음처럼 contract correctness와 maintainability를 동시에 해치는 신호가 남아 있다.

- 문서상/summary상 admin-only로 보이는 mutation이 실제 controller guard 없이 열려 있는 경우가 있다.
- controller마다 query parse, pagination shape, DTO 사용 여부가 제각각이라 frontend가 domain별 예외를 계속 기억해야 한다.
- 일부 admin/support surface는 아직 in-memory 또는 weakly typed body에 의존한다.
- 일부 route는 문서상 caution으로 표기되어 있지만, remediation 우선순위와 ownership이 backlog 문서로 정리되어 있지 않다.

이번 작업은 코드를 바로 고치는 단계가 아니라, `docs/api/**` 기준으로 실제 backend implementation을 감사하고 remediation roadmap을 문서화하는 단계다.

## Goal

- `docs/api/**`를 기준으로 backend implementation의 contract drift, security gap, duplication, consistency debt를 감사한다.
- 감사 결과를 severity와 remediation wave가 있는 실행 문서로 남긴다.
- 후속 구현 task가 바로 이어질 수 있도록 owner, priority, validation 전략을 정리한다.

## Original Conditions

- [x] `docs/api/**`를 기준으로 실제 API 구현이 올바른지 검수해야 한다.
- [x] 중복되거나 개선할 수 있는 부분을 충분히 식별해야 한다.
- [x] 이번 턴의 산출물은 코드 수정이 아니라 audit + remediation plan 문서다.
- [x] backend/api 중심이지만 frontend consumer impact도 같이 다뤄야 한다.
- [x] 결과는 repo 문서로 남아 다음 구현 wave의 실행 계약이 되어야 한다.

## Evidence

- `docs/api/**`
- `.github/tasks/49-backend-api-integration-contract-docs.md`
- `.github/tasks/51-frontend-api-contract-audit-remediation.md`
- `apps/api/src/**/*controller.ts`
- `apps/api/src/**/*.service.ts`
- `apps/api/src/**/dto/*.ts`
- `apps/api/test/integration/*.e2e-spec.ts`
- `apps/api/src/**/*.spec.ts`
- `apps/web/src/hooks/use-api.ts`
- `apps/web/src/types/api.ts`

## Deliverables

- `.github/tasks/52-backend-api-contract-implementation-audit-plan.md`
- `docs/plans/2026-04-11-backend-api-implementation-audit-remediation-plan.md`
- `docs/plans/2026-04-11-backend-api-contract-consistency-matrix.md`

## User Scenarios

### US-001 프론트 통합 신뢰 회복

- 프론트 개발자가 `docs/api/**`를 기준으로 기능을 붙였을 때, backend가 같은 contract를 실제로 지키는지 알고 싶다.
- 감사 문서에서 high-risk mismatch를 우선순위별로 확인하고, 어느 surface를 조심해야 하는지 바로 알 수 있다.

### US-002 backend 정리 우선순위 수립

- backend 개발자가 weakly typed body, pagination inconsistency, auth gap, in-memory admin surface 중 무엇을 먼저 고쳐야 하는지 알고 싶다.
- remediation roadmap에서 `Wave 1/2/3`와 validation 전략을 바로 볼 수 있다.

### US-003 운영/관리 surface 안전성 점검

- 운영자는 admin/support API가 실제로 보호되고 영속화되는지 확인하고 싶다.
- 문서에서 security/persistence gap이 분리 정리되어 있어 배포 전 위험을 파악할 수 있다.

## Test Scenarios

### Happy

- `docs/api/**` 기준으로 controller/service/test를 대조한 audit 문서가 존재한다.
- finding은 category, impact, evidence, recommended action, priority가 함께 적힌다.
- remediation roadmap이 실제 task 분해 가능한 수준으로 구체적이다.

### Edge

- docs와 코드가 완전히 불일치하지는 않지만, weakly typed/raw-body/caution surface 같은 회색지대도 누락 없이 적는다.
- 이미 Task 51에서 정리된 frontend drift와 이번 backend audit의 범위를 혼동하지 않는다.
- user-facing issue와 maintainability issue를 한 문장으로 뭉개지 않고 분리한다.

### Error

- live runtime verification이 없는 영역은 추정으로 단정하지 않고 “spot-check based” 또는 “follow-up validation required”로 적는다.
- dirty worktree의 unrelated change를 이번 audit finding으로 오인하지 않는다.

### Mock / docs sync

- mock/in-memory surface는 canonical contract인지 transitional contract인지 문서에서 분명히 구분한다.
- remediation plan은 Task 49/51과 충돌하지 않게 후속 관계를 명시한다.

## Parallel Work Breakdown

### Backend (병렬 가능)

- controller/service/DTO/test 기준 contract correctness 감사
- security/persistence/validation gap 추출

### Frontend (병렬 가능)

- frontend consumer impact와 현재 `docs/api/**` usability 기준으로 drift 영향 정리
- domain별 “frontend가 가장 많이 틀릴 지점” 분류

### Infra / Cross-cutting (병렬 가능)

- auth gating, mock-vs-real semantics, in-memory admin/support surface, duplicated helpers, consistency debt 정리

### Sequential

- findings severity 통합
- remediation wave / owner / validation 계획 합성
- task/report 문서 상태를 `Completed`로 마감

## Acceptance Criteria

- 새로운 audit/remediation 문서가 backend implementation gap을 category별로 정리한다.
- 최소 한 문서에서 concrete findings, evidence, recommended action, priority가 같이 보인다.
- duplication / inconsistency / security / persistence / weak typing / pagination / auth capability gating이 audit 범위에 포함된다.
- 후속 구현자가 바로 쪼개서 실행할 수 있는 remediation wave가 존재한다.
- 이번 문서는 코드 수정 없이도 다음 구현 라운드의 single source 역할을 한다.

## Tech Debt Resolved

- `docs/api/**` 생성 이후 남아 있던 “문서와 구현 사이의 남은 갭”을 backlog-less 상태로 방치하지 않게 됐다.
- contract 문제와 단순 frontend usage drift를 분리해 후속 작업 단위를 명확히 했다.
- 중복 패턴(query parse, list shape, optional auth guard, raw body mutation)을 기술부채 항목으로 명시화했다.

## Security Notes

- `POST /badges/team/:teamId`는 summary가 “관리자”인데 실제 guard가 없어 우선 감사 대상이다.
- admin/support mutation 중 DTO-less raw body surface는 validation 누락과 privilege misuse 위험이 크다.
- in-memory admin/support surface는 운영감사 흔적과 재시작 내구성을 해친다.
- 미구현 capability를 route로 노출한 상태(`auth/apple`)는 frontend confusion과 auth abuse surface를 만든다.

## Risks & Dependencies

- dirty worktree에 unrelated backend/frontend 변경이 많아 audit claim은 현재 읽은 코드 기준으로만 적어야 한다.
- 일부 surface는 live runtime smoke 없이 code/test/doc spot-check로만 판단했다.
- Task 51에서 이미 정리된 frontend drift는 이번 task의 primary scope가 아니므로 중복 실행하지 않는다.

## Ambiguity Log

- dispute creation이 장기적으로 user-facing self-service가 될지 admin intake 전용일지는 별도 product 결정이 필요하다.
- pagination shape를 전면 통일할지, domain별 variance를 문서화 + helper 추상화로 둘지는 구현 단계에서 선택이 필요하다.

## Execution Report (2026-04-11)

### Summary

- `docs/api/**`를 기준으로 backend implementation 감사 범위를 정의하고, concrete findings와 remediation wave를 문서화했다.
- 이번 턴에서는 코드를 수정하지 않고 감사/계획 문서만 작성했다.

### Files Updated

- `.github/tasks/52-backend-api-contract-implementation-audit-plan.md`
- `docs/plans/2026-04-11-backend-api-implementation-audit-remediation-plan.md`
- `docs/plans/2026-04-11-backend-api-contract-consistency-matrix.md`

### Validation

- backend/controller/service/doc spot-check
- `rg` 기반 cross-cutting pattern inventory (`pagination`, `raw body`, `OptionalJwtAuthGuard`, `AdminGuard`, `parseInt`, `nextCursor`)
- `git diff --check -- .github/tasks/52-backend-api-contract-implementation-audit-plan.md docs/plans/2026-04-11-backend-api-implementation-audit-remediation-plan.md docs/plans/2026-04-11-backend-api-contract-consistency-matrix.md`

### Follow-up

- next implementation wave should open remediation tasks from `Wave 1` first:
  - badge award auth hardening
  - notifications pagination/limit contract normalization
  - apple auth capability gating
  - dispute/admin persistence and DTO policy clarification
