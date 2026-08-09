---
"v1_api": patch
---

대회 그룹·픽스처에 자연키 unique 를 추가한다 — QA 시드를 삭제-재생성 대신 upsert 로 전환하기
위한 전제(append-only audit 데드락의 구조적 해소 Part 2).

- `v1_tournament_groups(tournament_id, name)` unique
- `v1_tournament_fixtures(tournament_id, round, fixture_number, leg_number)` unique
  (기존 `(tournament_id, id)` 는 랜덤 id 기반이라 upsert 키로 못 씀)

두 unique 는 기존 컬럼에 걸리는 non-additive 라 expand-contract 게이트가 막는다 — alpha·prod
실측 중복 0건(prod 픽스처는 0행)을 근거로 게이트 allowlist 에 사유와 함께 등록했다. 이 제약은
같은 대회에 중복 그룹/픽스처가 생기는 것을 DB 레벨에서 막는 방어이기도 하다.

**후속(별도 PR)**: 이 자연키를 써서 `createScenario` 의 tournament/fixture/group 을 delete→upsert
로 전환하고 `resetAlphaTournamentScenarios`(Part 1 skip 로직)를 제거하면, append-only audit 가
대회를 못박아도 삭제하지 않으므로 매 배포 skip 이 사라진다.
