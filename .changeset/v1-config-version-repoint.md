---
"v1_api": patch
---

alpha 의 football-v1/futsal-v1 canonical 경기 설정이 Wave B(#276·#277) 프리셋 변경 이후
DB 에는 옛 내용 그대로 남아, 11개 대회가 여전히 옛 설정을 물고 있었다(futsal 은 `lineup.formations`
가 없고 `events` 가 아직 `TEAM_FOUL` — T1-5 포메이션·T1-2 파울 기록이 살아나지 않는 원인). 해당
행은 이미 대회/팀매치/경기가 참조 중이라 `v1_block_used_config_mutation` 트리거가 in-place UPDATE
를 막는다(트랜잭션+ROLLBACK 으로 실측).

운영용 CLI `apps/v1_api/src/tournaments/competition-config/competition-config-version-repoint.{ts,cli.ts}`
를 추가해, 드리프트가 있는 canonical 설정만 골라 기존 `CompetitionConfigRegistry.createVersion`/
`TournamentCompetitionConfig.change`(완료 fixture 영향 미리보기+확인 2단계 포함)로 새 버전을 발행하고
대회·팀매치를 새 버전으로 repoint 한다. dry-run/apply 가 같은 술어를 공유하고, 재실행은 멱등(0 보고)
하다. `result`/`tieBreak`(채점 기준) 이 바뀐 드리프트는 자동 진행하지 않고 `blocked_scoring_drift`
로 보고만 하고 아무것도 바꾸지 않는다 — 채점 소급 변경은 사람이 판단할 일이다. `content_hash` 가
테이블 전역 유니크라 발행하려는 내용이 같은 계열의 예전 버전과 우연히 일치하면 중복 생성 대신 그
버전을 재사용하고, 무관한 계열과 우연히 일치하면 `blocked_content_hash_collision` 으로 보고만 하고
멈춘다.

`competition-config-backfill.ts`의 `seedCompetitionConfigVersions()`도 함께 손봤다: 드리프트된
canonical 행은 완료된 대회/경기가 계속 참조하도록 설계상 절대 원상복구되지 않으므로, 이 CLI 가
성공적으로 새 버전을 발행하고 repoint 한 뒤에는 그 사실(더 최신 버전이 canonical 내용과 일치하고,
활성 참조가 더는 옛 행에 없음)을 인식해 더 이상 `CompetitionConfigSeedDriftError`로 죽지 않는다.

마이그레이션 파일에는 DML 을 넣지 않았다 — expand-contract 게이트가 이를 거부하므로 Task 9/10/D-21
과 같은 방식으로 CLI 로 분리했다. 사용자에게 보이는 API 계약 변경은 없다.
