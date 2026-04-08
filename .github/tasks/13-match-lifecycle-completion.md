# Task 13: match lifecycle completion

**Status**: In Progress
**Owner**: Planning team -> backend-dev / frontend-dev
**Created**: 2026-04-08

## Context

`MATCH-001`과 `MATCH-002`는 실제 생성/참가 흐름까지 검증됐지만, 호스트가 본인 매치를 수정하고 모집 상태를 마감하거나 취소/완료하는 흐름은 구조적으로 비어 있다. 프론트는 이미 `/matches/:id/edit`와 `/my/matches` 취소 버튼에서 `PATCH /matches/:id`를 기대하지만 backend `matches` controller/service에는 해당 route가 없어서 실제 저장이 보장되지 않는다. 이 상태는 호스트 액션이 보여도 저장되지 않거나, 화면마다 상태 표현이 달라지는 false affordance를 만든다.

## Goal

호스트가 본인 매치를 실제로 수정하고, 모집 상태를 명확하게 전환하며, 취소/완료 결과가 상세/목록/내 매치에 일관되게 반영되도록 만든다.

## Original Conditions (must all be satisfied)

- [ ] `PATCH /matches/:id`가 실제로 존재하고, 호스트만 사용할 수 있어야 한다.
- [ ] 수정 화면에서 보이는 저장 항목은 backend DTO와 정확히 일치해야 한다.
- [ ] 호스트는 모집 중 또는 마감 상태 매치를 취소하거나 완료할 수 있어야 한다.
- [ ] 모집 재개/마감은 현재 참가 인원과 정원 기준으로 거짓 상태를 만들면 안 된다.
- [ ] 결과는 `/matches/:id`, `/matches`, `/my/matches?tab=created`에 모두 반영되어야 한다.
- [ ] 취소/완료처럼 참가자에게 중요한 상태 변화는 실제 알림 기록을 생성해야 한다.

## Included Scope

- `UpdateMatchDto`와 `PATCH /matches/:id` route 추가
- 호스트 전용 수정/상태전환 권한 검증
- `maxPlayers`, `status` 정합성 보정
- 참가자 대상 취소/완료 알림 생성
- `/matches/:id/edit`, `/matches/:id`, `/my/matches`의 host lifecycle UX 정리
- `MATCH-003` Playwright 자동화 추가

## Explicitly Excluded Scope

- venue 직접 입력 스키마 추가
- match room realtime push 동기화
- match 결과 입력, 점수 기록, 리뷰 자동 생성
- 새로운 notification enum / Prisma migration

## Product Decisions

### Host actions and lifecycle states

- `recruiting`: 기본 모집 상태. 호스트는 수정, 모집 마감, 취소, 완료 가능
- `full`: 정원이 찼거나 호스트가 수동 마감한 상태. 호스트는 수정, 모집 재개, 취소, 완료 가능
- `completed`: 종료 상태. 더 이상 수정/취소/재모집 불가
- `cancelled`: 취소 상태. 더 이상 수정/재모집/완료 불가

### State transition rules

- 호스트만 lifecycle 변경 가능
- `completed -> *`, `cancelled -> *` 전이는 금지
- `maxPlayers < currentPlayers` 수정은 금지
- `status = recruiting`은 `currentPlayers < maxPlayers`일 때만 허용
- `status = full`은 언제든 허용되지만, 저장 시 `currentPlayers >= maxPlayers`이거나 호스트 의도로 간주한다
- 정원 증가로 `currentPlayers < maxPlayers`가 되면 기존 `full`은 `recruiting`으로 자동 복구될 수 있다

## User Scenarios

### Scenario 1: 호스트가 매치 내용을 수정한다

1. 호스트가 `/matches/:id/edit`에 진입한다.
2. 제목/설명/일정/시설/정원/참가비를 수정한다.
3. 저장 후 상세 페이지로 돌아간다.
4. `/matches`, `/my/matches?tab=created`에서 같은 매치를 다시 본다.

Expected result: 수정된 값이 상세와 목록에 모두 반영되고, 새로고침 후에도 유지된다.

### Scenario 2: 호스트가 모집을 마감하고 다시 연다

1. 호스트가 아직 정원이 남은 매치 상세를 연다.
2. 모집 마감 액션을 실행한다.
3. 일반 사용자 컨텍스트에서 같은 상세를 연다.
4. 호스트가 다시 모집 재개를 실행한다.

Expected result: 일반 사용자는 마감 중에는 참가할 수 없고, 재개 후에는 다시 참가 가능 상태를 본다.

### Scenario 3: 호스트가 매치를 취소하거나 완료한다

1. 호스트가 생성한 매치 상세 또는 내 매치에서 취소 또는 완료를 실행한다.
2. 상태 배지와 CTA가 즉시 바뀌는지 확인한다.
3. 참가자 계정으로 알림함을 확인한다.

Expected result: 취소/완료 상태가 상세와 목록에 일관되게 반영되고, 참가자에게 상태 변화 알림이 생성된다.

## Test Scenarios

### Happy path

- [ ] 호스트가 `PATCH /matches/:id`로 일정/설명을 수정할 수 있다.
- [ ] 호스트가 `status=full`로 모집 마감을 수행할 수 있다.
- [ ] 호스트가 `status=recruiting`으로 모집 재개를 수행할 수 있다.
- [ ] 호스트가 `status=cancelled` 또는 `status=completed`로 상태를 전환할 수 있다.
- [ ] 취소/완료 후 상세/목록/내 매치에서 같은 상태를 본다.

### Edge cases

- [ ] 비호스트는 수정/상태전환 시 `Forbidden`을 받는다.
- [ ] `maxPlayers`를 현재 인원보다 낮게 내리면 실패한다.
- [ ] 이미 `completed` 또는 `cancelled`인 매치는 다시 수정할 수 없다.
- [ ] `currentPlayers >= maxPlayers`인 매치는 `recruiting`으로 열 수 없다.

### Error paths

- [ ] 저장 실패 시 edit UI가 성공 토스트로 오판하지 않는다.
- [ ] 취소/완료 실패 시 detail/my matches 상태가 optimistic success로 고정되지 않는다.

### Mock data updates needed

- [ ] `apps/api/src/matches/matches.service.spec.ts`의 update/cancel/complete mock 추가
- [ ] `apps/web/src/**/*.test.tsx` 또는 E2E의 상태 라벨 drift 정리
- [ ] `e2e/tests/match-join-flow.spec.ts`에 `MATCH-003` 시나리오 추가

## Parallel Work Breakdown

### Backend (Frontend와 병렬 가능)

- [ ] `UpdateMatchDto`와 `PATCH /matches/:id` route 추가
- [ ] host-only update/cancel/complete rules 구현
- [ ] 취소/완료 시 참가자 notification 생성
- [ ] service spec 확장

### Frontend (Backend와 병렬 가능)

- [ ] edit page submit payload를 DTO 기준으로 sanitize
- [ ] match detail host lifecycle CTA 추가
- [ ] my matches 취소 액션을 shared mutation 기반으로 정리
- [ ] status label을 API enum과 정확히 맞춤

### Infra (병렬 가능)

- [ ] No changes required unless E2E runtime helper adjustment is needed.

### Sequential (병렬 작업 이후에 실행)

- [ ] `MATCH-003` Playwright 추가 및 실행
- [ ] 시나리오/백로그/작업 문서 업데이트

## Acceptance Criteria

- [ ] Original Conditions 전부 충족
- [ ] 호스트 action UI와 backend capability 사이에 false affordance가 없다.
- [ ] lifecycle 상태가 query cache와 새로고침 후 모두 일관된다.
- [ ] 취소/완료 알림이 실제 참가자에게 생성된다.
- [ ] touched file 범위에 TODO/hack/workaround가 남지 않는다.

## Tech Debt Resolved

- [ ] frontend가 기대하던 `PATCH /matches/:id` contract 공백 해소
- [ ] match status label의 `open` vs `recruiting` drift 제거
- [ ] raw `api.patch` 분산 호출을 공통 mutation으로 정리

## Security Notes

- route는 `JwtAuthGuard` 보호
- 호스트 소유권 검증 필수
- 허용된 필드만 patch 가능하며 UI-only 필드는 whitelist 밖으로 보내지 않는다
- 참가자 알림은 해당 매치 참여자 중 호스트를 제외한 사용자만 대상

## Risks

- 기존 dev runtime stale API가 남아 있으면 patch contract 검증이 어긋날 수 있다.
- `my matches`가 개발 환경 mock fallback을 섞고 있어 상태 검증 시 drift가 생길 수 있다.
- 새 notification type을 추가하지 않으므로 cancel/open lifecycle notice는 기존 category로 표현해야 한다.

## Ambiguity Log

- 2026-04-08 — 취소/완료 알림을 위한 신규 enum/migration을 추가할지 검토함. 결정: 이번 범위에서는 기존 notification type을 재사용하고 title/body/data로 상태를 명시한다. 이유: 제품 기능 완결이 우선이고, enum migration 없이도 사용자 여정과 deep link를 충분히 만족시킬 수 있다.
- 2026-04-08 — 모집 마감 상태를 `full`로 표현할 때 "정원이 찼음"과 "호스트가 수동 마감"이 동일 enum을 공유하는 점을 허용하기로 함. 이유: 현재 schema 한계 내에서는 사용자 액션 가능 여부가 더 중요하고, UI 문구로 마감 상태를 명확히 표현할 수 있다.
