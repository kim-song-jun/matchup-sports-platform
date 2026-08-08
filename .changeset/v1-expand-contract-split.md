---
"v1_api": patch
---

alpha 배포를 막고 있던 expand-contract 마이그레이션 게이트 실패를 해소했다. 게이트 파서를
dollar-quote(`$$...$$`) 인지 방식으로 고쳐 PL/pgSQL 함수 본문이 세미콜론에서 잘못 분할되던 버그를
잡았고, 함수 재정의·신규 테이블 트리거·(순차 검사로 안전이 증명되는) 기존 테이블 FK·유니크 인덱스에
대한 좁은 판정 규칙을 추가했다. 남은 진짜 위반(경쟁 설정 백필/시드/`SET NOT NULL`/구버전 앱이 이미
쓰는 트리거)은 마이그레이션에서 분리해 `apps/v1_api/src/tournaments/competition-config/
competition-config-backfill.{ts,cli.ts}` 앱 CLI로 옮겼다(DML은 게이트가 신뢰하지 않는 설계).
`v1_tournaments`/`v1_team_matches`/`v1_tournament_fixtures.competitionConfigVersionId`는 계약
단계 마이그레이션이 나올 때까지 nullable이다 — 남은 SET NOT NULL/트리거 부착 계획은
`docs/ops/task9-competition-config-contract-phase.md` 참조. 사용자에게 보이는 API 계약 변경은
없다.
