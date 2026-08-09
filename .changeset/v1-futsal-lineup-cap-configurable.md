---
"v1_api": patch
---

풋살 팀매치의 라인업 상한(`futsal-v1` 경기 설정의 `lineup.maxPlayers`)을 5에서 6으로 올려, 이미 선택 가능했던 '6:6' 경기방식 프리셋(`team-match-conditions.constants.ts`)으로 만든 매치에서도 6명 선발 라인업을 저장할 수 있게 한다. 지금까지는 6:6으로 매치를 만들어도 라인업 저장이 항상 `LINEUP_SIZE_INVALID`로 거부됐다.

이 상한은 코드에 새로 하드코딩한 것이 아니다 — `V1CompetitionConfigVersion.lineup.maxPlayers`가 이미 검증(`team-match-lineup.service.ts`/`games.service.ts`)의 유일한 출처였고, 이번 변경은 그 값 자체(그리고 이미 존재하던 `FUTSAL_FORMATIONS`의 `outfield: 5` 대형 — 2-2-1/1-3-1/3-1-1)만 바꾼 것이다. 관리자가 이후 다른 인원수로 조정하고 싶다면 이미 있는 `POST /admin/competition-configs/:configId/versions`로 새 버전을 발행하면 된다(새로 만든 버전은 스키마 기본값으로 즉시 ACTIVE라 team-match는 자동으로 따라가고, tournament는 `PATCH /admin/tournaments/:id/competition-config`로 특정 버전에 pin할 수 있다) — 다만 이 API를 호출할 관리자 화면은 아직 없다.
