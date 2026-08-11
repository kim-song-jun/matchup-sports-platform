---
"v1_api": patch
---

대회 스태프(감독·현장 담당·조회 전용)가 경기 시작 전 라인업을 제출하지 못하던 문제를 고쳤다. `submitLineup`(`POST /games/:id/lineups/:lineupId/submit`)은 대회 픽스처 스태프에게 항상 인계 토큰(`takeoverToken`)을 요구했지만, 라인업 화면(`lineup-client.tsx`)은 토큰을 발급받거나 전송하는 경로가 없어 `TAKEOVER_TOKEN_EXPIRED`로 구조적으로 막혀 있었다. 이제 경기가 아직 시작되지 않았으면(`game.state === SCHEDULED`) 스태프도 토큰 없이 라인업을 제출할 수 있다. 경기가 라이브로 전환된 이후(LIVE/PAUSED/ENDED/CANCELLED)에는 기존대로 인계 토큰을 요구해, 두 운영자가 라이브 중 라인업을 놓고 충돌하는 것은 그대로 막는다. 팀 매니저/오너는 이전부터 항상 면제였고 변경 없음. `event_append`/`event_reverse`/`game_start` 등 다른 라이브 커맨드의 토큰 요구는 이번 변경과 무관하며 그대로 유지된다.
