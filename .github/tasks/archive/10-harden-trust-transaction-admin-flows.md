# 10. Harden Trust, Transaction, And Admin Flows

## Context

- 2026-04-08 디자인 리뷰 Batch F/G에서 `sample vs real trust signal`, `transactional failure masking`, `admin action auditability`, `admin shell continuity`가 반복 지적되었다.
- 현재 일부 사용자 화면은 mock fallback을 실제 데이터처럼 렌더링하고, 일부 거래형 흐름은 실패를 성공처럼 시뮬레이션한다.
- 관리자 화면은 mock 기반 운영 surface, local-only 처리, public surface 이탈 링크가 섞여 있다.

## Goal

다음 세 축을 같은 변경에서 정리한다.

1. `trust-signal-and-route-binding-hardening`
2. `transactional-flow-context-and-failure-recovery`
3. `admin-ops-auditability-and-shell-continuity`

## Original Conditions

- 사용자 신뢰 신호는 `verified`, `estimated`, `sample` 상태를 명확히 구분해야 한다.
- route detail / manage 화면은 현재 route entity를 기준으로 hydrate되어야 한다.
- 거래형 액션은 API 실패를 성공처럼 시뮬레이션하면 안 된다.
- checkout/refund/approval 진입은 실제 컨텍스트를 함께 전달해야 한다.
- 관리자 flow는 admin shell 안에 머물러야 하고, 운영 액션은 감사 가능해야 한다.

## User Scenarios

### User-facing

- 사용자는 결제 내역 화면에서 실제 결제 데이터가 없는 경우 mock 카드가 아니라 빈 상태 또는 에러 상태를 본다.
- 사용자는 결제 상세/환불 화면에서 현재 route id에 해당하는 실제 결제 정보만 본다.
- 사용자는 아직 실데이터가 없는 리뷰/배지 화면에서 `샘플 데이터`임을 명확히 인지한다.
- 사용자는 지원되지 않는 결제 흐름에 진입했을 때 가짜 성공이 아니라 “왜 진행되지 않는지”와 복귀 CTA를 본다.

### Admin-facing

- 운영자는 사용자 제재/분쟁 처리/정산 처리 시 처리 사유와 결과를 남기고 확인할 수 있다.
- 운영자는 admin list/detail/action 흐름 안에서 public surface로 튀지 않는다.
- 운영자는 mock/demo surface와 실제 운영 surface를 혼동하지 않는다.

## Test Scenarios

1. `/payments`는 로딩/에러/빈 상태를 분리하고 mock fallback 없이 동작한다.
2. `/payments/[id]`는 존재하지 않는 id에서 다른 샘플 결제로 fallback하지 않는다.
3. `/payments/[id]/refund`는 실결제 조회 실패 시 환불 요청 버튼 대신 실패/복귀 UI를 노출한다.
4. `/payments/checkout`는 필수 결제 컨텍스트 누락 시 dead-end가 아니라 명시적 안내를 보여준다.
5. `marketplace/[id]` 구매 CTA는 결제 컨텍스트를 담아 이동하거나, 지원 불가를 명확히 설명한다.
6. `/my/reviews-received`, `/badges`는 sample label을 노출한다.
7. `admin/users/[id]` 제재 액션은 실제 API 응답과 action history를 반영한다.
8. `admin/disputes/[id]` 처리 액션은 setTimeout/local-only 완료 대신 API와 audit log를 사용한다.
9. `admin/settlements` bulk action은 부분 성공/실패를 구분해 보여준다.
10. `admin/team-matches` 상세 진입은 admin shell 안에서 이뤄진다.

## Parallel Work Breakdown

### Backend

- `payments`: detail 조회와 richer relation payload 제공
- `admin`: user detail / sanction endpoints 추가
- `settlements`, `disputes`: action metadata/history 추가

### Frontend

- 공통 trust/provenance notice 도입
- payments / checkout / refund / badges / reviews-received 재구성
- admin user / dispute / settlement / team-match 흐름 재구성

### Docs

- AGENTS / workflow 신규 규칙 반영
- remediation 문서와 task 상태 동기화

## Acceptance Criteria

- Given 사용자가 실데이터가 없는 화면에 들어오면
  When 화면이 렌더링되면
  Then `sample` 또는 `error` 상태가 분명히 보이고 실제 데이터처럼 보이지 않는다

- Given 사용자가 존재하지 않는 결제 상세 페이지에 들어가면
  When 페이지가 로드되면
  Then 다른 mock 결제로 fallback하지 않는다

- Given 거래 API가 실패하면
  When checkout/refund/sanction action을 수행하면
  Then 성공 토스트나 mock 완료 상태 대신 실패 사유와 재시도 경로가 보인다

- Given 운영자가 admin list에서 상세로 이동하면
  When 상세 화면에 들어가면
  Then admin shell 안에서 맥락을 유지한다

- Given 운영자가 제재/분쟁/정산 액션을 수행하면
  When 액션이 완료되면
  Then 결과와 최소 action history가 화면에 남는다

## Implementation Status

- [x] `trust-signal-and-route-binding-hardening`
  - `payments`, `payments/[id]`, `payments/[id]/refund`에서 mock fallback 제거
  - `my/reviews-received`, `badges`에 sample/mixed-data trust signal 배너 추가
  - `payments/:id` backend detail endpoint와 owner-bound 조회 추가
- [x] `transactional-flow-context-and-failure-recovery`
  - `CheckoutModal`을 `participantId` 기반 실제 `prepare -> confirm` 흐름으로 교체
  - 유료 매치 참가를 `join -> participant 생성 -> payment` 순서로 정렬
  - `payments/checkout`은 컨텍스트 없는 진입을 명시적으로 차단
  - `marketplace/[id]`, `lessons/[id]`는 미지원 결제를 fake success 없이 차단
- [x] `admin-ops-auditability-and-shell-continuity`
  - `admin/users/:id` 상세/경고/정지/활성화 endpoint와 audit log 추가
  - `admin/disputes` / `admin/disputes/:id`를 실제 data + history 기반으로 전환
  - `admin/settlements` bulk approval을 partial failure aware flow로 전환
  - `admin/team-matches/:id` route를 추가해 admin shell continuity 확보

## Verification

- `pnpm --filter api test -- payments.service.spec.ts admin.service.spec.ts disputes.service.spec.ts settlements.service.spec.ts`
- `pnpm --filter web exec tsc --noEmit`

## Remaining Gaps

- lesson / marketplace 실제 commerce backend는 아직 미구현이다. 현재는 미지원 상태를 명시하고 진입을 차단한다.
- admin payments list는 이번 작업의 핵심 범위는 아니어서 audit enrich는 backend에 반영됐지만, list UI는 후속 polish 여지가 있다.

## Tech Debt Resolved

- 결제 화면의 mock fallback 의존
- checkout page의 fake success fallback
- admin user detail의 public profile 의존
- admin flow의 public route leakage
- local-only 운영 액션 처리

## Security Notes

- admin endpoints는 기존 `JwtAuthGuard + AdminGuard` 보호를 유지한다.
- 사용자-facing payment detail/refund는 현재 사용자 소유 결제만 조회 가능해야 한다.
- 운영 액션 payload에는 arbitrary HTML/unsafe text를 저장하지 않는다.

## Risks

- 기존 mock-driven admin pages와 실제 API shape 차이로 타입 수정 범위가 넓을 수 있다.
- lesson/marketplace 결제는 아직 완전한 backend 지원이 없어, 이번 변경에서는 “명시적 미지원/복구”가 포함된다.
- admin action history는 일부 surface에서 in-memory backing일 수 있어 장기 persistence와는 별개로 다뤄야 한다.

## Ambiguity Log

- 2026-04-08: lesson/marketplace commerce backend가 완결되어 있지 않음. 이번 변경에서는 “가짜 성공 제거 + 명시적 컨텍스트/복구”까지를 우선 범위로 둔다.
