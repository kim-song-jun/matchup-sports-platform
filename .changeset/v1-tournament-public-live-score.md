---
"v1_api": patch
"v1_web": patch
---

**대회 상세에서 진행 중인 경기의 실시간 스코어가 전혀 보이지 않던 문제를 고쳤다.** 알파에서 실제로 확인된 사고: 운영 콘솔에는 "알파 그린 FC 2:0, 기록된 이벤트 5건"이 정상 표시됐지만, 같은 시각 관전자용 대회 화면(`/tournaments/[id]`)에는 진행 중인 그 경기의 점수가 아예 노출되지 않았다.

근본 원인: 대회 경기(`TOURNAMENT_FIXTURE`) 게임은 `GamesService.deriveTournamentRevision`이 게임이 `ENDED`로 전환되는 그 순간에만 결과 리비전을 만든다. 공개 API(`GET /tournaments/:id/schedule`, `GET /tournaments/:id/matches/:fixtureId`)는 그 리비전(`currentOfficialRevision`)만 읽고 있었기 때문에, 경기가 실제로 진행 중인 동안에는 계속 `score: null`(`- : -`)로 내려갔다 — 운영 콘솔은 자기가 기록한 이벤트 목록을 직접 읽어 점수를 계산하므로 이 결함의 영향을 받지 않아 증상이 한쪽에서만 보였다.

- (`v1_api`) `PublicTournamentRecordsService`가 공식 리비전이 아직 없고 경기가 진행 중(`LIVE`/`PAUSED`)이면 `V1GameEvent`의 GOAL 이벤트를 직접 집계해 실시간 스코어를 계산한다(`tallyLiveScore`, `public-live-score.ts`). 공개 시각화 등급(`hidden`/`status_only`/`live`/`official_only`)은 그대로 유지 — `live` 등급에서만 노출되고 `official_only`/`status_only`는 기존과 동일하게 공식 확정 전 숫자 스코어를 보여주지 않는다. 목록 조회는 페이지당 한 번의 배치 쿼리로 처리해(진행 중인 경기당 N+1 아님) 부하가 관전자 수가 아니라 동시 진행 경기 수에만 비례한다.
- (`v1_api`) 새 `clock` 필드(`{ periodNumber, elapsedMs, isPaused }`)로 현재 피리어드와 일시정지 반영 경과 시간을 함께 내려준다(`resolveLiveClock`, `public-clock.ts`) — 운영 콘솔의 일시정지 누적 로직(`V1GamePeriod.pausedTotalMs`/`pausedAt`)과 동일한 계산을 공개 읽기 경로에도 적용했다.
- (`v1_web`) 대회 일정 목록과 경기 상세 화면에 LIVE 배지(피리어드 · 경과 시간, 일시정지 시 별도 표시)를 추가했다.
- (`v1_web`) 진행 중인 경기가 화면에 있을 때만 8초 간격으로 폴링한다(`usePublicTournamentSchedule`/`usePublicMatch`) — 운영 콘솔의 인증된 실시간 소켓 채널을 그대로 재사용하지 않고, 수백 명일 수 있는 익명 관전자에게 맞는 낮은 비용의 갱신 방식을 별도로 선택했다(근거는 `docs/api/domains/public-records.md` "Lane 1 addition" 참고).
