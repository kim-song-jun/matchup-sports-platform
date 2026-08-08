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

## 추가 — 공개 대회 일정 백필을 alpha 배포 경로에 배선

`deploy/deploy-alpha.sh` 는 매 배포마다 QA 시드를 돌려 대회 데이터를 리셋한다. 새로 생기는
QA 픽스처에는 `V1Game` 이 없어 배포 직후 공개 대회 일정이 항상 빈 목록이었다(운영자가 수동으로
백필 CLI 를 돌려야만 복구됐다). QA 시드 실행 **직후**에 `games/migration/fixture-game-backfill.cli.ts`
를 추가해, 픽스처에 대응하는 `V1Game` 을 미러링 생성하도록 했다.

**`competition-config-backfill.cli.ts` 는 의도적으로 배포 경로에 넣지 않았다.** 그 CLI 는
canonical config 행이 현재 코드의 레지스트리 상수와 content hash 가 다르면
`COMPETITION_CONFIG_SEED_DRIFT` 로 하드 실패한다. 가드 자체는 옳다 — 이미 대회가 참조 중인
config 의 내용이 바뀐 채로 진행하면 끝난 경기의 채점 규칙이 조용히 바뀔 수 있다. 그러나 그
CLI 를 배포 경로에 두면 **드리프트가 존재하는 동안 모든 alpha 배포가 실패한다.**

이건 가정이 아니라 실측이다. 2026-08-09 시점 alpha 가 정확히 그 상태였다 — #277 이
`lineup.positions`/`lineup.formations` 를 프리셋에 추가했는데 DB 의 canonical 행은 이전 내용이라
CLI 가 거부했다:

```
COMPETITION_CONFIG_SEED_DRIFT: football-v1 expected b442845d… but found 60b7ecf9…,
                               futsal-v1   expected 2d4bf6fb… but found 769fa5d3…
```

게다가 in-place 복구도 불가능하다 — `v1_block_used_config_mutation` 트리거(라이브 정의 확인)가
`v1_games`/`v1_tournaments`/`v1_team_matches`/`v1_tournament_fixtures` 중 하나라도 그 config 를
참조하면 UPDATE·DELETE 를 거부한다(실측 참조 수: 대회 4 · 픽스처 10 · 게임 4 · 팀매치 1).
즉 "새 config 버전 발행 후 repoint" 라는 운영 판단이 필요한데, **배포 파이프라인이 그 판단을
대신 내릴 수는 없다.**

그래서 config 채우기는 CLI 가 아니라 **QA 시드가 픽스처를 만드는 시점에 직접** 하도록 하고
(별도 PR), 이 CLI 는 운영자가 필요할 때 수동으로 돌린다. `fixture-game-backfill` 은 config 가
없는 픽스처를 **격리(quarantine)만 하고 실패하지 않으므로** 배포 경로에 두어도 안전하다.
