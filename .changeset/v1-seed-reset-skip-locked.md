---
"v1_api": patch
---

alpha QA 시드 리셋이 **append-only `v1_operation_audits`가 못박은 대회를 통째 실패 대신
건너뛰도록** 고친다 — 2026-08-09부터 모든 alpha 배포를 막던 데드락 해소.

## 무엇이 막고 있었나

alpha 배포는 매번 6개 고정 ID 대회를 삭제-후-재생성한다. 게임 운영이 이 대회들의 경기를
처리하며 `GamesService.writeAudit()`가 `v1_operation_audits`에 tournament·fixture 를 참조하는
행을 쌓는데, 이 테이블은 트리거 `v1_operation_audits_append_only`로 **DELETE·UPDATE가 둘 다
금지**된 append-only 로그다. 그 audit가 tournament 를 Restrict FK 로 못박아 `v1Tournament.deleteMany`
가 실패하고, 배포가 통째로 중단됐다(candidate failed → 이전 릴리스 복원).

## 어떻게 고쳤나

`resetAlphaTournamentScenarios`를 대회별 `SAVEPOINT`로 감쌌다. 삭제를 실제로 시도하고,
Restrict FK 위반(Postgres 23503 → **Prisma P2003**)이면 그 대회분만 `ROLLBACK TO SAVEPOINT`로
되돌려 건너뛰고 나머지는 계속 재생성한다. **append-only 트리거는 절대 끄지 않는다** — audit 를
지우거나 수정하는 시도 자체가 없다.

기존 정책도 그대로다: `teardownGamesForTournaments`의 두 가드(OFFICIAL 결과·append-only
`V1TeamRecordFact`)는 일반 `Error`를 던지므로 P2003 캐치에 안 걸려 전체 트랜잭션을 그대로
중단시킨다(PR #281이 확립한 "확정된 결과는 사람이 처리" 정책 불변).

건너뛴 대회는 재생성하지 않는다(고정 ID라 재생성 시 충돌). `createScenario`를 안 부르므로 그
대회의 leaf 엔티티(공지·시상·후기·스폰서)도 이전 배포 상태 그대로 보존된다. `skipped` 목록은
배포 stdout JSON에 항상 실려 조용한 방치를 막는다.

## 검증

- **P2003 매핑을 alpha 실데이터로 실측 확정**: 배포된 Prisma로 못박힌 대회(aa...004) 삭제를
  시도해 `code === 'P2003'`, 0행 변경(safe)을 직접 확인.
- 통합 테스트 3건 추가: ① append-only audit가 못박은 대회를 skip(throw 아님)하고 P2003 경로가
  실제로 돌았음을 assert, ② 한 대회 skip + 다른 대회 reset을 같은 트랜잭션에서, savepoint
  롤백 후 트랜잭션이 계속 사용 가능함을 확인, ③ 기존 7개 계약 케이스(특히 OFFICIAL 결과는
  여전히 전체 실패)는 그대로 유지.

## 후속 (별도 PR)

이건 "막히면 스킵"이지 근본 해소가 아니다. 계속 운영 중인 QA 대회는 매 배포마다 스킵돼 새
QA 콘텐츠를 못 받는다. tournament/fixture 를 delete 대신 upsert 로 전환하는 구조적 해소는
별도 PR(fixture 자연키 마이그레이션 동반)로 진행한다.
