---
"v1_api": patch
---

Task 168 StageB(최종 스키마 이관) 배선을 dev에 들여왔어요. dev push 로 자동 배포되는 기존 alpha
경로는 바이트 단위로 그대로고, StageB 전용 경로는 수동 `workflow_dispatch`(`task168_stage`)로만
닿을 수 있어요.

**새로 생긴 것**
- `deploy-alpha.yml`에 `task168_stage`(stageAIntermediate 기본 / stageBPreflight / stageBFinal
  / stageBRecover) 입력과 StageB 전용 이미지 빌드·소스 패키징·매니페스트 생성·SSM 스텝을 추가했어요.
  전부 push 이벤트에서는 도달 불가능하고, StageB 스텝은 이 입력이 명시될 때만 실행돼요.
- `deploy-alpha-via-ssm.sh`가 `TASK168_STAGE` 값으로 `deploy-alpha.sh`(기존)와
  `deploy-alpha-stage-b.sh`(신규) 진입점을 나눠 부르고, 알 수 없는 값은 즉시 실패해요.
  StageB 계열은 SSM `executionTimeout`(U11)을 필수 입력으로 요구하고, 시한 초과를
  "실패"가 아니라 "호스트 진행 중일 수 있음"으로 별도 분류해요.
- `deploy-alpha-stage-b.sh`(신규)가 락·매니페스트 검증·소스 스테이징·이미지 attestation
  확인 뒤 러너(`task168-stage-b-migrate.sh`)를 부르고, 성공 판정은 영수증(`migration-stage.json`
  status) 기준으로만 해요. `MIGRATION_COMMITTED` 이후 최종 런타임 기동은 **이번 배선에 없어요**
  (U2 미결정 — 커밋 메시지에 "post-commit start pending U2"로 남겨뒀어요).
- 같은 스크립트에 `stageBRecover`(R-A/R-B/R-C 판정)를 구현해서, 중간에 종료된 StageB 실행의
  상태를 읽기 전용으로 진단하고 필요하면 이전 writer만 복원해요. R-A는 기존 영수증이 있으면
  상태 무관하게 항상 거부해요(러너가 진짜 실패에는 항상 실제 `MIGRATION_DIAGNOSIS_REQUIRED`를
  쓰므로, 남아있는 영수증을 자동으로 덮어쓰는 것은 실패를 성공으로 둔갑시키는 것과 같아요).
  마커의 `releaseSha`/`manifestSha256`이 이 릴리스·매니페스트와 일치하는지, 그리고 quiesce된
  writer 두 개가 여전히 정지·`restart=no` 상태인지도 재확인해요. `finished_at>=enteredAt` 비교는
  `::text` 캐스트를 뺐어요 — Postgres에서 불리언을 `::text`로 캐스트하면 `'true'/'false'`가
  나오고 캐스트 없이 `psql -At`로 그대로 받으면 `'t'/'f'`가 나와 완전히 달라요(실측 확인). 이
  캐스트가 있으면 이 비교는 실제 DB에서 항상 실패해서 R-A는 절대 성공할 수 없었어요.
- `deploy-alpha.sh`에 D-5 가드를 추가했어요 — Task168 M11이 이미 ledger에 있으면 source 활성화
  **전에** StageA 매니페스트를 거부해요.
- `alpha-manifest-common.sh`/`create-alpha-release-manifest.sh`/`alpha-release-common.sh`/
  `rollback-alpha.sh`가 StageB 매니페스트(namespaced S3 키, `manifests/task168-stage-b/<sha>.json`
  등)를 분기 처리하고, StageB 승격은 T7 런타임 검증 영수증 없이는 거부해요.
- `Dockerfile.v1-api`에 `builder-task168-final`/`runtime-task168-final` 스테이지를 `runtime`
  앞에 추가하고, 두 워크플로의 API 빌드 스텝에 `target: runtime`을 명시했어요 — target 없는
  빌드가 새 스테이지로 조용히 바뀌는 걸 막아요.
- `task168-stage-b-post-live-verify.sh`(신규, T7)가 8개 검사(digest·attestation·ledger·카탈로그·
  drift·health·outbox·read-only smoke)를 전부 통과해야만 런타임 검증 영수증을 써요.

**이번 라운드 추가 수정 — R-A와 러너의 post-M11 검증을 한 곳으로**
- 이전 라운드까지 R-A(`stageBRecover`)는 M11 커밋 뒤 러너가 요구하는 검사 중 카탈로그
  일부만 다시 확인했고, `prisma migrate status` 드리프트·resolved-attempts 감사값·전체
  ledger 일치·Task168 11행 체크섬은 전혀 재확인하지 않았어요. 킬 직후 이 중 하나라도 깨져
  있으면 R-A가 `MIGRATION_COMMITTED_RECOVERED`를 잘못 써버릴 수 있었어요. 지금은
  `deploy/task168-migration-contract.sh`(신규, 러너와 wrapper가 함께 source)에 ledger·카탈로그·
  `prisma migrate status` 검사를 전부 모아, 러너의 정상 경로와 R-A가 **같은 함수**를 호출해요.
  R-A는 러너가 M11 진입 직전에 남기는 매니페스트 사본(`manifest.json`)과 동결된 마이그레이션
  소스(`frozen-source/`)를 state 디렉터리에서 읽어 이 검사들을 재현해요.
- M11 진입 마커는 이제 **마지막 quiesced-writer 재확인이 끝난 뒤에만** 쓰고, 그 직후 바로
  `phase=after_m11`로 넘어가요(이전엔 재확인 *전에* 썼어요). before_m11 단계에서 빠져나가는
  모든 경로는 마커가 있으면 writer를 복원하기 전에 `*.aborted`로 원자적으로 옮겨요 — 그래야
  이 릴리스가 실제로는 M11 이전에 실패했는데도, 같은 DB에 나중에 다른 릴리스가 커밋한 M11을
  자기 것으로 잘못 인증하는 경로가 막혀요.
- `BACKUP_FORMAT=plain-sql-gzip` 분기의 `pg_dump | gzip`에 `set -o pipefail`을 추가했어요 —
  없으면 `pg_dump` 실패가 `gzip`의 exit 0 뒤에 가려져 잘린 백업이 "성공"으로 기록돼요.
- 스크립트 주석에서 리뷰 라운드·BLOCK 라벨·행 번호 인용을 모두 걷어내고 실제 제약만 남겼어요.

**보류된 것(추측으로 채우지 않았어요)**
- U2: `stageBResume` 진입점은 만들지 않았어요.
- U4: 백업 형식은 러너 트랙(`task168-stage-b-migrate.sh`) 소관이라 이 변경에서 정하지 않았고,
  이 배선의 recover 경로는 백업 파일을 형식과 무관하게 재해시만 해요.
- U11: `executionTimeout` 실제 값은 T5 리허설 실측이 있어야 정해져요 — 값이 없으면 dispatch
  자체가 거부돼요.

**행동 없이도 검증**: `scripts/qa/test-task168-*.sh` 6개(wiring·wrapper·manifest·post-live·
d5-guard·dockerfile-target, ubuntu CI 기준 총 69개 케이스 — wiring 18 · d5-guard 9 · wrapper 15
· manifest 10 · dockerfile-target 4 · post-live 13)가 가짜 aws/docker/psql로 실제 스크립트를
돌려 각 게이트를 변이(mutation)로 확인해요. 전부 `deploy.yml` gates 에 연결했고
`continue-on-error` 없이 0 failed 를 요구해요(리뷰 라운드에서 wrapper·manifest 두 fixture 가
최신 계약과 어긋나 잠깐 `continue-on-error` 로 우회된 적이 있었는데, fixture 를 계약에 맞게
고치고 걷어냈어요). macOS 로컬 실행은 wiring 3케이스가 시스템 정규식 엔진의 `{1,1024}` 반복
제한(`maximum repetition exceeds 255`)과 wrapper 1케이스가 `flock(1)` 부재로 각각 fail/skip
처리되는데, 둘 다 스크립트 자체 주석에 적힌 Linux 전용 검증 대상이라 ubuntu CI에서는 영향
없어요(직접 ubuntu:24.04 컨테이너에서 재확인: wiring 26/0, d5-guard 9/0, wrapper 15/0 — 셋 다
macOS 에서 fail/skip 이던 케이스까지 포함해 전부 green).

`scripts/qa/test-task168-stage-b-runner.sh`(실제 docker/postgres/Prisma 하네스, 별도
`deploy.yml` 스텝)는 a-r(기존 18개) + t(재작성) + u·v(신규 2개) = 21 시나리오, macOS 로컬
0 failed 로 확인했어요. p/q/r 은 M11 커밋 직후 SIGKILL로 도달한 R-A 대상 상태에서 각각 ledger
체크섬 변조·source 에 없는 여분 적용행·미해결(unresolved) 시도행을 DB 에 직접 주입한 뒤 실제
wrapper 의 stageBRecover 를 호출해, `assert_resolved_attempts`/`assert_full_ledger`/
`ledger_assert_exact`(러너와 R-A 가 공유하는 `task168-migration-contract.sh`)가 셋 다 거부하고
`MIGRATION_COMMITTED_RECOVERED` 를 쓰지 않는지 확인해요. 매 실행 끝에 라벨 컨테이너/네트워크/
볼륨 0개와 `docker volume ls` 개수를 기준선과 대조해 익명 볼륨 누수도 함께 확인해요.

**이번 라운드 추가 수정 — 독립 검증 2건 대응**
- **stageBRecover R-B가 M11 진입 마커를 방치하는 false-recovery(2건 지적).** `phase=after_m11`
  직전에 마커를 쓰고 그 뒤 M11 이 커밋되기 전에 온 untrappable SIGKILL 은 러너 자신의 trap 을
  전혀 못 돌린다 — trap 이 도는 catchable 신호와 달리 마커가 ENTERED 로 남는다. 이 상태에서
  R-B(같은 release 의 recover)가 writer 만 복원하고 마커는 그대로 두면, 나중에 **다른** release
  가 같은 DB 에 M11 을 실제로 커밋했을 때 원래 release 의 stageBRecover 가 그 커밋을 자기 것으로
  잘못 인증할 수 있었다(마커의 releaseSha/quiesce/backup 이 전부 자기 자신과만 self-consistent
  하기 때문에 그 자체 검증으로는 못 잡는다). R-B 가 writer 를 되살리기 **전에** 마커를
  `*.aborted` 로 원자적 rename 하도록 고쳤다 — 실패하면 fail-closed. 새 시나리오 v(release X 를
  이 정확한 창에서 SIGKILL → R-B 호출로 마커 회수 확인 → 별도 release Y 가 같은 DB 에 M11 을
  정상 커밋 → X 를 다시 recover 시도하면 "M11 entry marker is missing" 으로 거부)가 이 경로
  전체를 real docker 로 재현·검증한다. 고침을 되돌리면 v 가 실제로 `MIGRATION_COMMITTED_RECOVERED`
  를 X 앞으로 잘못 써서 red 로 확인했다. 시나리오 u 는 같은 창에서의 TERM(catchable, 기존 trap
  경로)이 여전히 동작함을 회귀 확인한다. 시나리오 t 는 release X 가 (j 와 같은 externally-revived
  writer 기법으로) marker 를 쓰기 **전에** 자기 pre-migrate 재확인에서 실패하는 경우로 다시 짰다 —
  이전 버전은 X 를 마커 쓰기 훨씬 전(SIGTERM mid-backup)에 세워서 이 정확한 결함 상태에 닿지
  못했다. j 에도 재확인 실패 뒤 마커가 전혀 안 쓰였는지 확인하는 assertion 을 추가했다.
- **`assert_prisma_migrate_status_clean`(task168-migration-contract.sh, 러너와 R-A 공유)가
  `set -Eeuo pipefail` 아래서 자신의 실패를 스스로 못 봤다(2건 지적).** `docker exec ...; rc=$?`
  형태는 errexit 아래서 "체크된" 명령이 아니라서, `prisma migrate status` 가 non-zero 로 끝나면
  그 줄에서 함수가 즉시 종료되고 `rc=$?`·`docker rm -f`·`fail` 메시지가 전부 안 돈다 — R-A 의
  일회용 status-check 컨테이너가 Alpha 호스트에 무기한 남고 진단 메시지도 없다. `if ... ; then
  rc=0; else rc=$?; fi` 로 바꿔 errexit 이 실제로 "체크"하는 형태로 고쳤다. wrapper 테스트에
  fake docker 의 `migrate status` 만 실패로 답하는 케이스를 추가해 rc≠0·진단 메시지·
  `docker rm -f` 호출을 전부 assert 한다 — 고침을 되돌리면 이 케이스가 정확히 그 세 조건 전부로
  red 가 됨을 확인했다.
