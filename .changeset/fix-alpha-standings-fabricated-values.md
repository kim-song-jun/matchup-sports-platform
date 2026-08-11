---
"v1_api": patch
---

alpha 공개 대회 일정의 조별 순위(standings)가 실제 경기 결과와 모순되던 문제를 고쳤다. `seed-alpha-tournament-qa.ts`가 대회 상태와 팀 배열 인덱스만으로 승점·승무패·득실을 하드코딩해 온 탓에(2:0으로 이긴 팀이 패배로 표시되거나, 존재하지 않는 무승부가 순위에 섞이는 등) 실제 픽스처 스코어와 무관한 값이 매 alpha 배포마다 노출됐다. 이제 시드는 순위 행을 만들지 않는다 — `fixture-game-backfill` 직후 배포 파이프라인에 새로 추가된 `tournament-standings-recalculation.cli.js`가 관리자 "순위 재계산" 라우트와 동일한 `recalculateAndUpsertGroupStandings()` 경로로 실제 픽스처 결과로부터 그룹별 순위를 다시 계산해 채운다. 순위가 아직 계산되지 않은 순간에는 기존에 이미 있던 "순위 집계 전이에요" 빈 상태가 그대로 뜬다(회귀 아님). 경기 규칙(config)이 없거나 유효하지 않은 대회는 격리(quarantine)만 하고 배포를 막지 않는다.
