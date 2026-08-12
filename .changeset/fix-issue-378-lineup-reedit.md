---
"v1_api": patch
"v1_web": patch
---

대회 경기(tournament fixture) 라인업을 한 번 제출(SUBMITTED)하면 다시는 고칠 수 없던
결함(#378)을 고쳤다.

**증상**: `lineup-client.tsx`의 `editable`이 `lineupState === null || 'DRAFT'`로만
계산돼 SUBMITTED 이후 영구히 false가 됐고, 저장/제출 버튼이 든 고정 CTA 바 전체가
`{editable ? (...) : null}`로 렌더링에서 통째로 빠졌다. 재편집으로 돌아갈 진입점이 파일
전체 어디에도 없어, 오타 하나를 고치려 해도 다시 제출할 방법이 없었다.

**프론트**: 경기가 아직 시작 전(`gameQuery.data.state === 'SCHEDULED'`)이면 SUBMITTED
카드 아래 CTA 바에 "다시 편집하기" 단독 버튼을 새로 노출한다. 실수로 바로 편집에
들어가지 않도록 순수 로컬 플래그(`reopened`)로 게이팅해 명시적으로 눌러야만 편집 UI가
열리고, 열리는 즉시 "저장하면 제출했던 라인업이 새 내용으로 바뀐다"는 안내를 보여준다.
다시 제출하면 재편집 세션은 자동으로 닫힌다. 경기가 시작되면 이 진입점은 물론 기존
편집 UI 전체가 함께 사라진다(`editable`이 `gameStarted`를 최우선으로 검사하도록 정리).

**백엔드**: 대응하는 서버 가드가 전혀 없어 화면만 고치면 API를 직접 호출해 경기 중에도
라인업을 덮어쓸 수 있는 구멍이 남았다. `GamesService.saveLineup`의 TOURNAMENT_FIXTURE
경로에 `game.state !== SCHEDULED`면 거부하는 가드를 추가했다 — 팀 매치 쪽
(`team-match-lineup.service.ts`)의 동일 성격 마감 가드와 같은 코드
(`LINEUP_DEADLINE_PASSED`)를 재사용했다. LIVE/PAUSED/ENDED뿐 아니라 CANCELLED도
막는다 — 취소된 경기는 준비할 다음 킥오프 자체가 없어 저장할 이유가 없다.
