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
QA 픽스처에는 `V1Game`이 없어 배포 직후 공개 대회 일정이 항상 빈 목록이었다(운영자가 수동으로
백필 CLI 를 돌려야만 복구됐다). QA 시드 실행 **직후**에 아래 두 CLI 를 순서대로 추가했다:

1. `tournaments/competition-config/competition-config-backfill.cli.ts` —
   `v1_tournaments`/`v1_team_matches`/`v1_tournament_fixtures.competitionConfigVersionId` 를 채운다.
2. `games/migration/fixture-game-backfill.cli.ts` — `scheduled`/`in_progress`/`completed`
   픽스처에 대응하는 `V1Game`을 미러링해 생성/보강한다.

순서가 중요하다: fixture-game 백필은 `competitionConfigVersionId` 가 없는 픽스처를
`CONFIG_MISSING` 으로 격리한다. competition-config 백필을 먼저 돌려 그 값을 채워 두지 않으면
방금 QA 시드가 만든 픽스처 전부가 격리돼 백필이 무의미해진다(실측 확인됨).

**`COMPETITION_CONFIG_SEED_DRIFT` 는 의도적으로 배포를 막는다.** competition-config 백필은
canonical config 행(`v1_competition_config_version`, football/futsal 각 1행)이 이미 존재하는데
현재 코드의 레지스트리 상수와 content hash 가 다르면 예외를 던진다. 이 두 행은 alpha 의 QA
시드/sanitize 어느 쪽도 건드리지 않는 테이블이라(첫 백필 실행 이후로는) 배포 사이에 그대로
남는다 — 즉 정상적인 반복 배포에서는 드리프트가 발생하지 않는다. 드리프트가 발생하는 유일한
경로는 이미 대회들이 참조 중인 canonical config 의 **내용**을 코드에서 바꿔놓고 새 버전 행을
만들지 않은 경우인데, 그 상태로 배포를 계속 진행하면 이미 끝난 경기의 채점 규칙이 조용히
바뀔 수 있다 — 바로 이 가드가 막으려는 사고다. `deploy-alpha.sh` 는 `set -Eeuo pipefail` +
`trap ERR` 로 이미 모든 단계에 fail-fast 이므로, 이 CLI 가 비정상 종료하면 배포는 자동으로
직전 정상 릴리스로 롤백된다. 이 가드를 무력화하거나 우회하지 않았다 — 코드 자체의 주석이
"resolve manually... then re-run" 을 요구하는 설계이므로, alpha 라는 자동배포 환경에서도
그 요구를 그대로 존중하는 것이 맞다고 판단했다.
