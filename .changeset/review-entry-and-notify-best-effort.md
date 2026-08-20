---
"v1_api": patch
"v1_web": patch
---

팀매치 후기 진입점을 서버 정책과 맞추고, 대회 완료 알림을 best-effort 로 되돌린다.

- **후기 진입점이 두 사람에게만 보이던 문제.** 팀매치 상세의 "후기 남기기" 게이트가
  `canManageHostTeam || viewerState === 'approved'` 였는데, 서버 `getViewerState()` 는
  host 팀 owner/manager 에게만 `host_team` 을, **신청서를 낸 한 사람**에게만 `approved` 를
  준다. 그래서 양 팀 일반 팀원 전원과 (매니저가 신청한 경우) 신청팀 owner 까지 진입점을
  잃었다 — 정작 서버(`resolveReviewerTeams`)는 두 팀의 active 멤버 전원에게 후기를 허용한다.
  역할을 가리지 않는 `viewer.participantMember` 를 새로 내려주고 화면은 그걸로 판정한다.
  (마이페이지 "남은 후기" 목록은 원래부터 역할 필터가 없어 도달은 가능했다 — 진입점만 어긋나
  있었다.)
- **대회 완료 알림 실패가 완료 처리를 실패로 보이게 하던 문제.** `requestTournamentReviews()`
  는 주석대로 "발송 실패가 상태 전이를 되돌리면 안 되는" 부수 효과인데 `await` 만 하고
  감싸지 않아, 수신자 조회(DB 일시 오류)나 발송이 넘어지면 이미 커밋된 completed 전이가
  API 에서는 500 으로 나갔다. 운영자는 "완료 처리 실패"로 읽고 재시도하게 되고 두 번째
  호출은 `alreadyInStatus` 로 돌아와 더 헷갈린다. try/catch + 에러 로깅으로 계약을 지킨다.
