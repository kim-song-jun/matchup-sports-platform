---
"v1_api": patch
---

alpha QA 대회 시드를 **삭제-후-재생성에서 멱등 upsert 로 전환**한다(Part 2 — append-only 데드락 근본 해소).

#297 은 append-only `v1_operation_audits`(또는 픽스처의 `V1Game` Restrict FK)가 못박은 대회를 대회별
SAVEPOINT 로 건너뛰는 우회였다 — 그 대회(예: `aa…004`)는 매 배포 stale 로 남았다. Part 2 는 우회가 아니라
구조를 바꾼다:

- **대회·그룹·픽스처는 절대 삭제하지 않고 upsert** 한다 — 대회는 고정 id 로, 그룹은 자연키
  `(tournamentId, name)`, 픽스처는 자연키 `(tournamentId, round, fixtureNumber, legNumber)`(#304 에서 추가한
  unique). 픽스처 결과는 `fixtureId(@unique)` 로 upsert(V1TournamentFixtureGoal 이 Cascade 로 참조하므로).
- **V1Game 은 만들지도 지우지도 않는다**(fixture-game-backfill 같은 ops 소유). 픽스처를 안 지우니
  `v1_games_tournament_fixture_id_fkey`(Restrict)·operation_audit 참조가 걸릴 일이 없다.
- **leaf 행만 tournament scope 로 삭제-재생성**한다(등록·명단·순위·영상·시상·후기·스폰서·공지·캠페인).
  이들은 어떤 append-only 트리거·Restrict FK 의 대상도 아니라(schema 실측) 항상 안전하다.

결과: `teardownGamesForTournaments`·`resetAlphaTournamentScenarios`·`AlphaTournamentResetSummary`·
SAVEPOINT/skip 로직이 통째로 제거됐고, 매 배포에서 **전 시나리오가 예외 없이** 재시드된다.

통합 테스트(`seed-alpha-tournament-qa-upsert.integration-spec.ts`)가 실 Postgres 로 ① 2회 재시드 멱등성
(중복 0) ② 대회+픽스처를 못박은 append-only operation_audit 를 뚫고 재시드 성공 + audit·대회 row 생존
(같은 createdAt = update, not recreate) ③ 픽스처에 붙은 V1Game 생존 + 픽스처 id 안정 을 검증한다.
