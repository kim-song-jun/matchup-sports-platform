---
"v1_api": patch
---

alpha 대회 공개 일정이 항상 비어 보이던 결함을 고쳤다. Game 도메인이 배포되기 전에 만들어진
`v1_tournament_fixtures` 행에는 대응하는 `V1Game`이 없어, 공개 일정 API가
`fixture.game?.visibilityPolicy?.mode ?? 'HIDDEN'`으로 읽어 전부 hidden 처리되고 있었다.
운영용 백필(`apps/v1_api/src/games/migration/fixture-game-backfill.{ts,cli.ts}`)을 추가해
`scheduled`/`in_progress` 픽스처에는 `GamesService.createFromSourceInTransaction()`을 그대로
미러링한 Game(사이드·라인업·참가자·피리어드·공개 정책)을 생성하고, `completed` 픽스처는 Task 10
백필(`game-result-backfill.ts`)이 만든 Game에 그 백필이 쓰지 않는 피리어드/공개 정책만 보강한다 —
같은 픽스처에 Game이 두 번 생기지 않고, Task 10과의 실행 순서와도 무관하다. dry-run/apply가 같은
후보 조회 함수를 공유하며, 재실행 시 아무것도 새로 만들지 않는다(멱등). 마이그레이션 파일에는 DML을
넣지 않았다 — expand-contract 게이트가 이를 거부하므로 Task 10/D-21과 같은 방식으로 CLI로 분리했다.
사용자에게 보이는 API 계약 변경은 없다.
