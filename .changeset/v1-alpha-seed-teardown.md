---
"v1_api": patch
---

alpha 배포를 영구 차단하던 QA 시드 teardown 결함을 고친다.

`deploy/deploy-alpha.sh` 는 매 배포마다 `prisma/seed-alpha-tournament-qa.ts` 를 실행하고, 그
시드는 `v1Tournament.deleteMany()` 로 QA 대회를 리셋한다. Game 도메인이 올라오기 전에는 Game
행이 없어서 통과했지만, 대진표 생성·백필로 Game 이 생긴 뒤로는 `V1Game.tournamentFixture` 의
`onDelete: Restrict` 에 걸려 매번 죽는다. 2026-08-08 alpha 에서 #275·#276·#277·#278·#280
배포가 연속으로 이 지점에서 실패했고 alpha 는 #274 릴리스에 묶였다.

- `purgeTournamentGameAggregates()` 추가 — 대상 대회의 fixture 에 매달린 V1Game 집합체를
  스키마의 Restrict 그래프 순서대로 걷어낸다. 자기참조 FK 두 개
  (`V1Game.currentOfficialRevisionId`, `V1GameResultRevision.supersedesId`)를 먼저 끊는다.
  범위는 인자로 받은 대회로만 한정된다.
- **공식 결과는 우회하지 않는다.** `v1_block_terminal_revision_mutation` 트리거가 terminal
  상태 revision 의 UPDATE·DELETE 를 둘 다 막는다 — 의도된 불변성이다. terminal revision 을
  발견하면 조용히 건너뛰지 않고 어떤 경기가 걸렸는지 밝히며 명시적으로 실패한다.
- 통합 테스트 3건: purge 없이는 삭제가 FK 로 막힌다는 것 자체 / purge 후 삭제 성공 + 다른 대회
  불간섭 / 공식 결과가 있으면 부분 삭제 없이 통째로 거부.
