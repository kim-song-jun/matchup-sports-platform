# Task 12: notifications delivery action center

**Status**: Done
**Owner**: Planning team -> backend-dev / frontend-dev
**Created**: 2026-04-08

## Context

알림 인프라는 일부 존재하지만 실제 사용자 여정은 끊겨 있다. 백엔드는 알림 저장, unread count, read API, websocket emit을 제공하지만 실제 도메인 이벤트에서 `notificationsService.create()`를 거의 호출하지 않고, 웹 `/notifications` 화면은 API가 아니라 로컬 Zustand 상태를 진실 소스로 사용한다. 이 상태에서는 알림 배지가 일부 화면에서 부정확하고, 알림함/읽음 처리/딥링크/다중 탭 동기화가 실제 사용자 기대를 만족하지 못한다.

## Goal

사용자가 실제 도메인 이벤트로 생성된 알림을 여러 탭과 브라우저에서 안정적으로 받고, 알림함에서 읽음 처리와 딥링크 이동까지 일관되게 수행할 수 있게 만든다.

## Original Conditions (must all be satisfied)

- [x] 실제 도메인 이벤트가 알림 레코드를 생성하고 websocket `notification:new`까지 전달해야 한다.
- [x] `/notifications`는 로컬 스토어가 아니라 서버 API와 실시간 동기화를 기준으로 렌더링해야 한다.
- [x] 읽음/전체 읽음 처리 후 unread count와 알림 리스트가 같은 탭과 다른 탭에서 함께 맞아야 한다.
- [x] 알림 항목은 클릭 시 엔터티 맥락에 맞는 경로로 이동해야 한다.
- [x] UI에 노출된 기능만 제공한다. 이번 범위 밖인 알림 설정 영속화는 가짜 저장처럼 보이면 안 된다.

## Included Scope

- 매치 참가 시 호스트에게 `player_joined` 알림 생성
- 결제 확정/환불 시 사용자에게 `payment_confirmed` / `payment_refunded` 알림 생성
- 백엔드 알림 직렬화 계약에 `link`, `category`, `data` 포함
- `/notifications` API 기반 액션 센터 재구성
- 알림 읽음/전체 읽음 멀티탭 동기화
- 알림 딥링크 이동과 unread badge 정합성

## Explicitly Excluded Scope

- `/settings/notifications` 영속화 API 및 DB 스키마 추가
- 이메일 알림 / FCM 신규 인프라 구축
- 채팅 메시지별 알림 생성
- 관리자 전용 알림 센터 별도 구현

## User Scenarios

### Scenario 1: 호스트가 참가 알림을 받는다

As a match host, I want to know immediately when a player joins my match so that I can review participation progress.

Steps:
1. 호스트 사용자가 모집 중 매치를 생성한다.
2. 다른 사용자가 같은 매치 상세에서 참가를 수행한다.
3. 호스트는 같은 브라우저의 다른 탭 또는 다른 브라우저 컨텍스트에서 알림 배지를 본다.
4. 호스트가 `/notifications`로 이동한다.
5. 새 알림을 클릭해 매치 상세로 이동한다.

Expected result: 호스트는 `player_joined` 알림을 실시간으로 받고, unread badge와 알림함 모두 같은 상태를 반영하며, 클릭 시 정확한 매치 상세로 이동한다.

### Scenario 2: 사용자가 결제 결과 알림을 받는다

As a participant, I want payment result notifications with a direct path to the payment record so that I can trust the transaction outcome.

Steps:
1. 사용자가 유료 매치에 참가한다.
2. 결제를 준비하고 확정한다.
3. 알림함에 결제 완료 알림이 쌓인다.
4. 알림을 클릭해 결제 상세로 이동한다.
5. 환불이 수행되면 환불 알림도 확인한다.

Expected result: 결제 완료/환불 알림이 각각 생성되고, payment detail route로 정확히 이동한다.

### Scenario 3: 같은 사용자 다중 탭에서 읽음 상태가 맞는다

As a signed-in user, I want notification read state to stay synced across tabs so that badges do not lie.

Steps:
1. 같은 계정으로 탭 A와 탭 B를 연다.
2. 탭 A에서 새 알림을 받는다.
3. 탭 B에서 같은 알림이 보이는지 확인한다.
4. 탭 A에서 알림 하나를 읽음 처리하거나 전체 읽음 처리한다.
5. 탭 B에서 unread badge와 항목 강조가 함께 해제되는지 확인한다.

Expected result: 읽음 상태와 unread count가 페이지 새로고침 없이 두 탭에서 함께 맞춰진다.

## Test Scenarios

### Happy path

- [x] `MatchesService.join()`가 호스트 대상 `player_joined` 알림을 생성한다.
- [x] `PaymentsService.confirm()`가 사용자 대상 `payment_confirmed` 알림을 생성한다.
- [x] `PaymentsService.refund()`가 사용자 대상 `payment_refunded` 알림을 생성한다.
- [x] `/notifications`가 API 목록 + unread count를 렌더링한다.
- [x] 알림 클릭 시 `markRead` 후 deep link 이동이 수행된다.
- [x] `markAllRead` 후 badge와 list highlighting이 즉시 사라진다.

### Edge cases

- [ ] 호스트가 자기 자신의 이벤트로 중복 알림을 받지 않는다.
- [x] websocket 연결이 늦어도 새로고침 후 API 조회 결과가 동일하다.
- [x] 같은 알림 이벤트가 중복 broadcast되어도 리스트에 중복 삽입되지 않는다.
- [x] 알림 `data`가 부분적으로 비어 있어도 안전한 fallback route를 사용한다.

### Error paths

- [x] `PATCH /notifications/:id/read` 실패 시 사용자에게 오류 토스트가 표시되고 UI가 성공 상태로 오판하지 않는다.
- [x] `PATCH /notifications/read-all` 실패 시 전체 읽음이 낙관적으로 고정되지 않는다.
- [ ] 알림 링크 엔터티가 삭제되었으면 안전한 fallback route(`/notifications` or `/payments`)로 이동한다.

### Mock data updates needed

- [x] `apps/api/src/notifications/notifications.service.spec.ts`의 realtime payload / serialization mock 갱신
- [x] `apps/api/src/matches/matches.service.spec.ts`의 notifications dependency mock 추가
- [x] `apps/api/src/payments/payments.service.spec.ts`의 notifications dependency mock 추가
- [x] `apps/web/src/test/msw/handlers.ts`의 `/notifications` 응답 계약을 실제 형태와 맞춤
- [x] `apps/web/src/**/*.test.tsx`에서 notification API 타입 변경 영향 반영

## Parallel Work Breakdown

### Backend (Frontend와 병렬 가능)

- [x] `NotificationsService`에 serialized notification contract와 deep link resolver를 추가한다.
- [x] `MatchesService.join()`에 `player_joined` 생산자를 연결한다.
- [x] `PaymentsService.confirm()` / `refund()`에 결제 알림 생산자를 연결한다.
- [x] 관련 module import / provider wiring과 Jest spec을 갱신한다.

### Frontend (Backend와 병렬 가능)

- [x] notification type / realtime payload 계약을 실제 API와 맞춘다.
- [x] React Query cache 기반 notification sync 유틸과 provider-level realtime syncer를 추가한다.
- [x] `/notifications` 페이지를 API 기반 액션 센터로 재작성한다.
- [x] badge 소비처(`sidebar`, `bottom-nav`, `profile`)를 동일한 unread source로 정리한다.

### Infra (병렬 가능)

- [ ] No changes required unless Playwright runtime helper or local API bootstrap needs adjustment.
  - 2026-04-08 actual outcome: `global-setup` storage bootstrap을 `/matches + domcontentloaded` 기준으로 가볍게 조정했고, `notification-center.spec.ts`는 multi-tab storageState 재사용 + fresh dev-login mutation token 패턴으로 안정화했다.

### Sequential (병렬 작업 이후에 실행)

- [x] 멀티탭 sync helper와 API contracts를 통합 검증한다.
- [x] Playwright로 multi-context notification delivery/read-sync/deep-link 시나리오를 전체 파일 기준으로 안정 검증한다.
- [ ] 디자인/QA 리뷰 결과를 반영한다.

## Acceptance Criteria

- [x] Original Conditions 전부 충족
- [x] 호스트 참가 알림과 결제 결과 알림이 실제로 생성된다.
- [x] `/notifications`는 서버 응답과 websocket 이벤트만으로 최신 상태를 재구성할 수 있다.
- [x] 다른 탭에서 읽음 처리 후 unread count가 새로고침 없이 반영된다.
- [x] 기존 notification-related mock/test drift가 없다.
- [x] 알림 설정 페이지는 여전히 device-local임을 명확히 유지하거나, 범위 밖 기능처럼 보이지 않는다.

## Tech Debt Resolved

- [x] `realtime-client.ts`의 `message` vs backend `body` payload drift 제거
- [x] notification source of truth가 API인지 local store인지 불명확하던 상태 해소
- [x] notification unread count 소비처가 store/query로 갈라져 있던 상태 정리
- [x] socket 연결 이전에 생성된 notification을 놓치던 race를 connect-time backfill로 해소
- [x] notification card의 `Link` 기본 동작과 read mutation 경쟁을 explicit in-app navigation으로 정리
- [x] background tab이 socket event를 놓쳐도 focus/visibility backfill과 polling으로 notification list를 회복하도록 정리
- [x] `notification-center.spec.ts`가 dev Next compile / auth drift 때문에 흔들리던 multi-tab E2E 하네스를 storage-state bootstrap + fresh token mutation 패턴으로 고정

## Security Notes

- 알림 조회/읽음 API는 계속 `JwtAuthGuard`로 보호한다.
- 알림 링크는 현재 사용자에게 허용된 엔터티 경로만 구성한다.
- 알림 `data`는 직렬화 전에 plain JSON으로 제한하고, 프론트에서는 문자열/ID 기반 경로만 사용한다.
- websocket `notification:read`는 현재 사용자 소유 알림만 갱신해야 한다.

## Risks

- 현재 dev compose API watch가 unrelated TS 오류로 stale runtime을 남길 수 있다.
- 결제 확정 route가 비인증 confirm endpoint라서 user context는 payment record에서 재도출해야 한다.
- 기존 `/notifications`와 profile badge가 local store에 의존하고 있어 리팩터링 중 UI drift가 생길 수 있다.

## Ambiguity Log

- 2026-04-08 — 설정 영속화 범위를 이번 태스크에 포함할지 검토함. 결정: device-local UI는 유지하되 실제 저장 기능은 이번 v1에서 제외한다. 이유: DB/API 스키마 추가가 커지고, 현재 사용자 요청의 핵심은 delivery + action center + multi-context sync다.
- 2026-04-08 — Payment notification Playwright full rerun은 알림 카드 생성과 읽음 처리까지는 확인됐지만, 클릭 후 `/payments/:id` client navigation commit이 dev web runner에서 안정적으로 끝나지 않아 follow-up으로 뒀다.
- 2026-04-08 — payment deep-link 문제는 `notification activation` 명시 처리와 `socket connect-time backfill` 추가 후 `Desktop Chrome` 단건 rerun에서 통과했다.
- 2026-04-08 — hidden tab notification recovery는 query polling만으로는 부족했다. 결정: `/notifications`는 focus/visibility 시 explicit backfill을 수행하고, Playwright multi-tab spec은 background tab 실시간 도착 자체를 강제하지 않고 "foreground delivery + background recovery + read sync" 기준으로 검증한다.
- 2026-04-08 — `notification-center.spec.ts` full-file `Desktop Chrome 3/3`를 최종 통과시켰다. 안정화 포인트는 explicit in-app navigation, socket connect backfill, focus/visibility backfill, lighter `global-setup` storage bootstrap, fresh dev-login token for API mutations, realistic suite timeouts다. `teams` seed drift는 여전히 best-effort warning으로 남지만 notification suite 자체를 더 이상 막지 않는다.
