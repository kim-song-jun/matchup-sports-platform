# Profile Settings Admin Scenarios

> Status: Partial
> admin smoke는 존재하고, 2026-04-11 Task 37로 dashboard/users/payments/reviews의 honest-data contract가 실제 런타임에서 재검증됐다. profile/onboarding 전체 검증은 아직 비어 있다. `SET-001`은 server sync 구현과 unit/browserless 검증까지는 완료됐지만, live protected-route smoke는 현재 dev runtime instability 때문에 follow-up 상태다.

## Scenario Checklist

- [ ] PROFILE-001 프로필 편집 저장과 전역 반영
- [ ] SET-001 알림 설정 토글 저장 (server sync implemented, live smoke follow-up: current dev runtime instability)
- [ ] ONBOARD-001 첫 로그인 사용자 온보딩 완료
- [ ] ADMIN-001 관리자 대시보드 데이터 렌더링 (`dashboard/users/payments/reviews` subset verified on 2026-04-11, disputes/settlements pending)
- [ ] ADMIN-002 분쟁 처리 후 사용자 측 상태 변화

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

## ADMIN-001 관리자 대시보드 데이터 렌더링

### Steps

- [ ] `관리자E2E`로 `/admin/dashboard`에 진입한다.
- [ ] `/admin/users`, `/admin/payments`, `/admin/disputes`, `/admin/settlements`도 확인한다.

### Expected

- [ ] 주요 관리자 화면이 깨지지 않고 렌더링된다.

## ADMIN-002 분쟁 처리 후 사용자 측 상태 변화

### Steps

- [ ] 분쟁이 생성된 상태를 준비한다.
- [ ] 관리자가 분쟁 상태를 갱신한다.
- [ ] 관련 사용자 화면과 알림을 확인한다.

### Expected

- [ ] 관리자의 조치가 사용자 도메인 상태에 반영된다.

## Notes

- 이 파일은 사용자 설정과 관리자 기능을 한 묶음으로 유지하되, 실제 자동화 시에는 별도 spec으로 분리하는 것이 좋다.
- 2026-04-11: Task 39에서 `/settings/notifications`를 server-synced category와 device-local 항목으로 분리했고, `useNotificationPreferences()`는 mount/focus 시점 refetch로 freshness를 보강했다.
- 2026-04-11: live browser smoke는 stale API process의 `dev-login` `500`과 이후 web restart의 `@swc/helpers` 누락이 연속으로 겹치며 차단됐다. `SET-001` 최종 검증은 dev runtime 안정화 후 재실행이 필요하다.
- 2026-04-11: Task 37로 `admin/payments`, `admin/reviews`, `admin/mercenary`, `admin/statistics`, `admin/teams/[id]`, `admin/venues/[id]`의 mock/sample fallback을 제거했다. browser smoke는 `/admin/dashboard`, `/admin/users/:id`, `/admin/reviews`, `/admin/payments`까지 확인했고, Docker dev API restart smoke에서 `warn -> suspend -> api restart -> detail refetch -> reactivate`도 통과했다. payments/reviews/user moderation을 포함한 별도 Playwright spec은 follow-up이다.
