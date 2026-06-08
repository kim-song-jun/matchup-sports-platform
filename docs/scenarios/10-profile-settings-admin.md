# Profile Settings Admin Scenarios

> Status: Partial
> `/admin`은 Task 103 이후 고객 운영 ERP다. Task 104부터 내부 Teameet 운영자 콘솔은 `/ops`로 분리되며, reports/disputes/payments/settlements/audit는 `/api/v1/admin/*`를 호출한다. Task 105는 `/admin`과 `/ops`를 같은 밝은 Teameet 운영 템플릿으로 맞추되 customer/admin 기능 플로우를 보존하는 focused redesign이다. profile/onboarding 전체 검증은 아직 비어 있다. `SET-001`은 server sync 구현과 unit/browserless 검증까지는 완료됐지만, live protected-route smoke는 현재 dev runtime instability 때문에 follow-up 상태다.

## Scenario Checklist

- [ ] PROFILE-001 프로필 편집 저장과 전역 반영
- [ ] SET-001 알림 설정 토글 저장 (server sync implemented, live smoke follow-up: current dev runtime instability)
- [ ] ONBOARD-001 첫 로그인 사용자 온보딩 완료
- [ ] ADMIN-001 고객 `/admin` 운영 ERP 데이터 렌더링 (Task 103 customer workspace verified; internal ops moved out)
- [ ] OPS-001 `/ops` active admin guard and forbidden state
- [ ] OPS-002 `/ops` reports/disputes/payments/settlements/audit queue rendering
- [ ] OPS-003 refund/payout provider failure remains visible
- [ ] OPS-004 `/admin` and `/ops` share the v1 bright operations template while preserving their functional flows

## PROFILE-001 프로필 편집 저장과 전역 반영

### Preconditions

- [ ] `시나로E2E` 로그인 상태다.

### Steps

- [ ] 프로필 수정 모달 또는 편집 화면을 연다.
- [ ] 닉네임/소개/선호 종목 등 수정 가능한 값을 바꾼다.
- [ ] 저장 후 프로필, 사이드바, 관련 카드에서 반영 여부를 확인한다.

### Expected

- [ ] 저장 직후 UI에 반영된다.
- [ ] 새 탭/새로고침 후에도 유지된다.

## SET-001 알림 설정 토글 저장

> 현재 상태: Partial. `/settings/notifications`는 `match/team/chat/payment` 4개 category를 서버와 동기화하고, 브라우저 권한/DND는 device-local 섹션으로 분리했다. 다만 live protected-route browser smoke는 현재 dev runtime instability 때문에 아직 재실행하지 못했다.

### Steps

- [ ] `/settings/notifications`에서 설정을 변경한다.
- [ ] 페이지를 벗어났다가 다시 들어온다.

### Expected

- [ ] 매치/팀/채팅/결제 category는 reload / 재로그인 후에도 유지된다.
- [ ] 브라우저 권한과 방해금지 시간은 device-local 항목으로 분리돼 보인다.
- [ ] 이메일/마케팅/전체 마스터 토글은 서버 저장인 것처럼 보이지 않는다.

## ONBOARD-001 첫 로그인 사용자 온보딩 완료

### Steps

- [ ] 신규 또는 온보딩 미완료 사용자로 로그인한다.
- [ ] `/onboarding` 플로우를 완료한다.
- [ ] 홈 또는 프로필 완성 상태로 이동하는지 확인한다.

### Expected

- [ ] 온보딩이 단절 없이 완료된다.
- [ ] 완료 후 재진입 정책이 일관된다.

## ADMIN-001 고객 `/admin` 운영 ERP 데이터 렌더링

### Steps

- [ ] 팀/매치 운영 권한이 있는 사용자로 `/admin`에 진입한다.
- [ ] `/admin/matches`, `/admin/team-matches`, `/admin/teams`, `/admin/reviews`, `/admin/notifications`, `/admin/audit`를 확인한다.

### Expected

- [ ] 고객 운영 워크스페이스만 렌더링된다.
- [ ] `/admin`은 `/api/v1/admin/me`, `/api/v1/admin/overview`, `/api/v1/admin/action-logs`, `/api/v1/admin/status-change-logs`를 호출하지 않는다.
- [ ] 내부 신고/분쟁/정산/지급 성공 처리 CTA가 `/admin`에 노출되지 않는다.

## OPS-001 `/ops` active admin guard and forbidden state

### Steps

- [ ] 비관리자 또는 inactive admin 응답으로 `/ops`에 진입한다.
- [ ] active admin 응답으로 `/ops`에 다시 진입한다.

### Expected

- [ ] 첫 진입은 명시적 접근 권한 없음/error state를 보여준다.
- [ ] active admin 진입은 `/api/v1/admin/me` 이후 queue API를 호출한다.

## OPS-002 `/ops` queue rendering

### Steps

- [ ] active admin으로 `/ops`, `/ops/reports`, `/ops/disputes`, `/ops/payments`, `/ops/settlements`, `/ops/audit`에 진입한다.
- [ ] desktop `1440x960`, `1920x1080`, `2048x900`에서 테이블을 확인한다.

### Expected

- [ ] 신고/분쟁/결제/환불/정산/지급 실패 counts가 overview에 표시된다.
- [ ] 각 queue table은 가로 overflow 없이 대상, 상태, 메타, 금액/우선순위를 스캔할 수 있다.
- [ ] action panel은 reason 입력 없이는 mutation을 호출하지 않는다.

## OPS-003 provider failure visibility

### Steps

- [ ] `/ops/payments`에서 refund provider failure 응답을 확인한다.
- [ ] `/ops/settlements`에서 payout contract/JWE 미준비 응답을 확인한다.

### Expected

- [ ] refund는 `failed`와 provider error code/message를 보여준다.
- [ ] payout은 `TOSS_PAYOUT_CONTRACT_REQUIRED` 또는 provider-confirmed 상태 전까지 success로 표시되지 않는다.

## OPS-004 admin/ops template redesign with flow preservation

### Steps

- [ ] `/admin`과 `/ops`에 active admin/customer 세션으로 진입한다.
- [ ] `/admin`, `/admin/matches`, `/admin/team-matches`, `/admin/teams`, `/admin/reviews`, `/admin/notifications`, `/admin/audit`의 고객 route 링크를 확인한다.
- [ ] `/ops`, `/ops/reports`, `/ops/disputes`, `/ops/payments`, `/ops/settlements`, `/ops/audit`의 queue/action 상태를 확인한다.
- [ ] desktop/tablet/mobile과 `/ops` wide `1440/1920/2048`에서 밝은 operations shell, no overflow, no dark console residue를 확인한다.

### Expected

- [ ] `/admin`과 `/ops`는 같은 밝은 Teameet 운영 템플릿을 쓴다.
- [ ] `/admin`은 고객 매치/팀/팀매치/리뷰/알림/업무 이력 플로우만 유지한다.
- [ ] `/ops`는 `/api/v1/admin/me` guard, support read-only, 신고/분쟁/결제/환불/정산/지급/감사 플로우를 유지한다.
- [ ] refund/payout provider failure는 danger/warning state로 남고 success처럼 보이지 않는다.

## Notes

- 이 파일은 사용자 설정과 관리자 기능을 한 묶음으로 유지하되, 실제 자동화 시에는 별도 spec으로 분리하는 것이 좋다.
- 2026-04-11: Task 39에서 `/settings/notifications`를 server-synced category와 device-local 항목으로 분리했고, `useNotificationPreferences()`는 mount/focus 시점 refetch로 freshness를 보강했다.
- 2026-04-11: live browser smoke는 stale API process의 `dev-login` `500`과 이후 web restart의 `@swc/helpers` 누락이 연속으로 겹치며 차단됐다. `SET-001` 최종 검증은 dev runtime 안정화 후 재실행이 필요하다.
- 2026-04-11: Task 37로 `admin/payments`, `admin/reviews`, `admin/mercenary`, `admin/statistics`, `admin/teams/[id]`, `admin/venues/[id]`의 mock/sample fallback을 제거했다. browser smoke는 `/admin/dashboard`, `/admin/users/:id`, `/admin/reviews`, `/admin/payments`까지 확인했고, Docker dev API restart smoke에서 `warn -> suspend -> api restart -> detail refetch -> reactivate`도 통과했다. payments/reviews/user moderation을 포함한 별도 Playwright spec은 follow-up이다.
- 2026-06-08: Task 104 added `/ops` internal console routes and v1 ops API contracts. `/admin` remains customer ERP from Task 103; legacy `/admin/dashboard`, `/admin/users`, `/admin/payments`, `/admin/disputes`, `/admin/settlements` are not v1 runtime routes unless separately reintroduced.
- 2026-06-08: Task 105 aligns `/admin` and `/ops` to the shared bright Teameet operations template while preserving the functional customer and operator flows. Evidence path: `output/playwright/task105-admin-ops-template-redesign/`.
