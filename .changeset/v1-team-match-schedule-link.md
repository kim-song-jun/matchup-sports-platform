---
"v1_api": minor
---

팀매치(V1TeamMatch)와 팀일정(V1TeamSchedule)을 생명주기 전체에서 연동한다 — "매치가 곧 팀일정"이라는 전제로, 매치를 만들면 호스트 팀 캘린더에 가확정(상대팀 모집 중) 스케줄이 즉시 생기고, 신청이 승인되면 상대팀에도 확정 스케줄이 생긴다. 매치를 취소하면 연결된 스케줄이(삭제되지 않고) CANCELLED로, 결과가 제출되면 COMPLETED로 함께 전이되며, recruiting 단계의 매치 수정은 호스트 스케줄의 제목·시간과 동기화된다. `V1TeamSchedule`에 `@@unique([teamId, teamMatchId])`를 추가해 시스템이 같은 팀·같은 매치에 스케줄을 중복 생성하는 것을 DB 레벨에서도 막는다. 스케줄 조회 응답에는 파생 필드 `matchConfirmed`가 추가된다(MATCH 타입일 때만 유효 — 상대팀 확정 여부를 매 조회 시점 TeamMatch에서 계산). 스케줄을 직접 만드는 공개 API(`POST .../schedules`)는 `type: MATCH`를 더 이상 받지 않는다(`SCHEDULE_MATCH_TYPE_SYSTEM_ONLY`) — MATCH 스케줄은 이제 팀매치 생명주기에서만 시스템이 만든다. `teamMatchId` 필드도 그 DTO에서 함께 제거했다(도달 불가능해진 입력 경로 정리).
