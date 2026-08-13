---
"v1_api": minor
"v1_web": minor
---

스태프가 자기 담당 대회 운영 화면으로 들어가는 진입점을 추가한다.

접근 권한 자체는 이미 열려 있었다(`tournament-ops/layout.tsx`는 role-agnostic `RequireAuth`만
적용하고, 실제 스코프 인가는 `TournamentStaffAccessService`가 라우트별로 담당). 진짜 문제는
자기 담당 대회를 찾을 수단이 없어 실질적으로 진입이 불가능했다는 것이다.

- `GET /me/tournament-staff` (v1_api): 로그인 사용자의 **유효한**(만료·해제되지 않은) 스태프
  배정을 대회 단위로 묶어 반환한다. `TournamentOperationsStaffService.myAssignments()` — 자기
  자신의 배정을 보는 self-scoped read라 `TournamentStaffAccessService.assertAccess()`를 거치지
  않는다(`MyMatchesController`/`MyScheduleController`와 동일한 `me` 프리픽스 관례). 진행 중인
  대회를 먼저 보여주도록 정렬하고, 한 대회에 여러 배정(예: 필드 담당자로 두 구장)이 있으면
  대회 하나로 묶어 중복 없이 표현한다.
- 마이페이지(`/my`)에 "대회 운영" 섹션을 조건부로 추가한다 — 유효한 배정이 하나도 없는
  사용자(대부분)에게는 보이지 않는다. 진입하면 `/my/tournament-staff`에서 담당 대회 목록을
  보고 각 대회의 운영 화면(`/tournament-ops/tournaments/:id/operations`)으로 이동할 수 있다.
  배정이 있었으나 전부 만료/해제된 경우에는 빈 상태 안내를 보여준다.
