---
"v1_api": patch
---

갓 배포된 환경에서 대회 운영 보드가 `500 GAME_READ_FLAG_MISSING` 으로 죽던 결함을 고친다.

`TournamentOperationsBoardService.list()` 는 `GAME_READ` 플래그 행이 없으면 의도적으로
fail-closed 한다(Task 18 review P1-7 — 행이 지워졌을 때 조용히 legacy 로 떨어져 compare 모드의
불일치 보호가 사라지는 것을 막기 위함). 그 계약 자체는 옳지만, **배포 경로에서 그 행을 만드는
곳이 없었다**: `GameOperationFlagsService.ensureDefaults()` 는 private 이고 `platform_ops` 가
플래그 API 를 호출할 때만 돌며, 마이그레이션은 이 행을 시드하지 않는다(expand-contract 게이트상
DML 은 additive 가 아니다). 그래서 새로 provisioning 된 환경은 누군가 플래그 API 를 건드리기
전까지 운영 보드가 500 이었다 — alpha 가 실제로 그 상태였다(`v1_game_operation_flags` **0행**).

보드의 통합 테스트가 못 잡은 이유도 같다: 모든 케이스가 setup 에서 플래그 행을 직접 upsert 해서,
"배포만 된 환경" 을 재현하는 케이스가 하나도 없었다.

- `config/game-operation-flags-seed.ts` 신설 — `createMany({ skipDuplicates: true })` 로 4개
  플래그 행 + cutover epoch 을 시드한다. `upsert` 가 아니라 `createMany` 인 것이 핵심이다:
  update 경로가 아예 없으므로 "운영자가 바꾼 값을 되돌리지 않는다" 가 빈 `update: {}` 절에 기댄
  약속이 아니라 **구조적 성질**이 된다. 배포마다 실행되기 때문에 이 성질이 중요하다.
- `config/game-operation-flags-seed.cli.ts` 신설 — 배포 후 실행용 진입점
  (`game-result-backfill.cli.ts` / `competition-config-backfill.cli.ts` 와 같은 분리 방식).
- `deploy/deploy-alpha.sh` 와 `.github/workflows/deploy.yml` 의 마이그레이션 재생 게이트에서
  `prisma migrate deploy` 직후 실행하도록 배선 — CI 와 실제 배포가 같은 DB 상태를 보게 된다.
- `games/migration/task10-runtime-manifest.cli.ts` 안에 있던 동일 구현(byte-equivalent 사본)을
  제거하고 공유 모듈을 import 하도록 정리.
- 통합 테스트 2건 추가: (1) 배포만 된 환경에서 보드가 요구하는 행이 전부 생기는지,
  (2) 재실행이 운영자가 바꾼 값(`PUBLIC_LIVE: on`, epoch `writeMode: new`)을 되돌리지 않는지.
  후자는 덮어쓰는 upsert 를 주입해 실제로 실패하는 것을 확인했다.
