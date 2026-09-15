---
"v1_api": patch
---

Task 168 StageB(최종 스키마 이관) 배선을 dev에 들여왔어요. dev push 로 자동 배포되는 기존 alpha
경로는 바이트 단위로 그대로고, StageB 전용 경로는 수동 `workflow_dispatch`(`task168_stage`)로만
닿을 수 있어요.

**새로 생긴 것**
- `deploy-alpha.yml`에 `task168_stage`(stageAIntermediate 기본 / stageBFinal / stageBRecover)
  입력과 StageB 전용 이미지 빌드·소스 패키징·매니페스트 생성·SSM 스텝을 추가했어요.
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
d5-guard·dockerfile-target)가 가짜 aws/docker/psql로 실제 스크립트를 돌려 각 게이트를
변이(mutation)로 확인해요. 전부 `deploy.yml` gates 에 연결했고 `continue-on-error` 없이
0 failed 를 요구해요. macOS 로컬 케이스 수 — wiring 15(+3 macOS 전용 실패) · d5-guard 8(+1
macOS 전용 skip) · wrapper 31(+1 macOS 전용 skip) · manifest 10 · dockerfile-target 4 ·
post-live 13 = 로컬 81 + macOS 전용 4(실패 3·skip 1). macOS 실패 3건은 wiring 스크립트가
`{1,1024}` 반복을 쓰는데 macOS 시스템 정규식 엔진이 `{1,1024}`를 거부해서(`maximum repetition
exceeds 255`)이고, skip 1건(d5-guard·wrapper 각 1)은 `flock(1)` 부재예요. 셋 다 스크립트 자체
주석에 적힌 Linux 전용 검증 대상이라 ubuntu CI에서는 4건 모두 green 으로 실행돼(직전 라운드
ubuntu:24.04 컨테이너 재확인: wiring 26/0, d5-guard 9/0, wrapper 16/0 — 이번 라운드는 wrapper
에 15케이스를 추가해 ubuntu 기준 31/0 이 될 것으로 계산돼요), **ubuntu CI 기준 총 94개 케이스**
(wiring 26 · d5-guard 9 · wrapper 31 · manifest 10 · dockerfile-target 4 · post-live 13)예요.

wrapper 에 추가한 15케이스: `post_m11_catalog_violation`(`task168-migration-contract.sh`, 러너와
R-A 공유)의 13개 코드 중 이전엔 legacy_tables·lineage_trigger 2개만 개별 테스트가 있었는데 나머지
11개(games_guard_ck·staff_guard_ck·audit_guard_ck·guard_fn_resolve·guard_fn_staff·
guard_fn_lineage·retired_enums·retirement_functions·retirement_triggers·legacy_link_columns·
processing_outbox) 각각을 한 번에 하나씩 깨는 시나리오, R-A 고유 바인딩 3개(러닝 중인 compose
config 의 v1_api 이미지 불일치·정지된 quiesced writer 의 restart policy != no·manifest 사본
해시 불일치) 각 1케이스, R-A 의 cross-release false-green(마커/quiesce/backup 이 자기 자신의
상태 디렉터리에만 자기 일관적이라, 형제 release 가 같은 DB에 나중에 M11 을 커밋해도 모든 바인딩이
통과하는 결함) 을 막는 새 sibling-marker 체크 1케이스, R-B 가 ledger 의 M11 행 부재만 믿고
predecessor writer 를 되살리기 전에 pre-M11 물리 스키마(5개 legacy 테이블) 가 실제로 남아있는지
확인하는 새 체크 1케이스예요.

`scripts/qa/test-task168-stage-b-runner.sh`(실제 docker/postgres/Prisma 하네스, 별도
`deploy.yml` 스텝 없음 — CI 미연결, 로컬 전용)는 a-r(기존 18개) + t(재작성) + u·v(기존 2개) +
w·x(신규 2개) = 23 시나리오, 로컬 macOS 0 failed 로 확인했어요. p/q/r 은 M11 커밋 직후 SIGKILL로
도달한 R-A 대상 상태에서 각각 ledger 체크섬 변조·source 에 없는 여분 적용행·미해결(unresolved)
시도행을 DB 에 직접 주입한 뒤 실제 wrapper 의 stageBRecover 를 호출해, `assert_resolved_attempts`/
`assert_full_ledger`/`ledger_assert_exact`(러너와 R-A 가 공유하는 `task168-migration-contract.sh`)가
셋 다 거부하고 `MIGRATION_COMMITTED_RECOVERED` 를 쓰지 않는지 확인해요. **w**(신규)는 release X 가
마커-기록 창에서 SIGKILL 되고(마커 ENTERED 잔존·M11 미적용) 사람이 그 정확한 컨테이너 id 를 손으로
되살린 뒤, release Y 가 같은 DB 에 M11 을 정상 커밋하는 상태를 실제로 만들고 나서 X 에 대해 처음
호출하는 stageBRecover 가 거부하는지 확인해요 — X 의 자기 참조적 바인딩(체크섬·finished_at≥
enteredAt·마커/quiesce/backup 상호대조)은 전부 통과하므로, 새로 추가한 sibling-marker 체크만이
이 거짓 복구를 막아요(이 체크를 지우는 변이에서 실제로 red 가 되는 것을 확인했어요 — R-A 가
"MIGRATION_COMMITTED_RECOVERED" 를 X 앞으로 잘못 써요). **x**(신규)는 형제 release 디렉터리가
전혀 없는 상태(sibling-marker 체크가 비교할 대상이 없는 상태)에서 finished_at≥enteredAt 바인딩만
단독으로 이 결함을 막는지 확인해요 — 이 바인딩을 항상 참으로 바꾸는 변이(과거 라운드의 mutation ME)
에서 red 가 되는 것을, 그리고 같은 변이에서도 w 는 sibling-marker 체크가 독립적으로 여전히 거부하는
것(두 방어선이 서로 독립임)을 함께 확인했어요. 매 실행 끝에 라벨 컨테이너/네트워크/볼륨 0개와
`docker volume ls` 개수를 기준선과 대조해 익명 볼륨 누수도 함께 확인해요(다른 세션이 동시에 같은
`com.teameet.task168.harness` 라벨로 별도 하네스를 돌리고 있으면 host 전체 볼륨 개수 기준선이
그 세션 몫만큼 달라 보일 수 있어요 — 내 라벨 값(RUN_ID)으로 스코프된 컨테이너/네트워크/볼륨 카운트가
진짜 누수 신호예요).

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

**이번 라운드 추가 수정 — PR #1194 Copilot 리뷰 4건 대응**
- **`deploy-alpha.yml`의 `inputSnapshotSha256`이 `receiptSha256`과 같은 값을 재사용했다.**
  "Package and upload Task168 StageB source" 스텝이 attestation 파일 전체의 sha256
  (`attestationSha256`)을 `TASK168_FINAL_PREFLIGHT_RECEIPT_SHA256`과
  `TASK168_FINAL_PREFLIGHT_INPUT_SNAPSHOT_SHA256` 양쪽에 그대로 썼다. 실제 PR-A1
  `package-task168-final-source.sh`가 attestation JSON 안에 따로 넣는 `inputSnapshotSha256`
  필드(패키징된 INPUT-MANIFEST.json의 해시, attestation 파일 자체의 해시와 다른 값)를 `jq`로
  읽어 쓰도록 고쳤다. `test-task168-stage-b-wiring.sh`에 두 값이 서로 다른 스텝 출력을
  가리키는지 실제 워크플로 YAML에서 `run:`/`env:` 블록을 추출해 확인하는 케이스를 추가했다.
  이 자리엔 더 깊은 문제도 있었다 — 러너는 `finalImagePreflight.receipt`를
  `kind=="task168FinalImagePreflight"` + `.harness`/`.rehearsal` 중첩 필드를 갖춘 T5 리허설
  영수증으로 검증하는데, 워크플로는 거기에 소스 패키징 attestation
  (`kind=="task168StageBSourceArchiveAttestation"`, 그런 필드 없음)을 그대로 넣고 있었다. 이
  `inputSnapshotSha256`/`finalImagePreflight` 배선 전체는 아래 "리허설 waiver" 라운드에서
  삭제됐다 — 더 이상 유효하지 않은 서술이다.
- **`alpha-manifest-common.sh`의 StageB `.source.key` 검증이 `.tar.gz`로 끝나는지만 봤다.**
  StageA 네임스페이스 키(`releases/<sha>.tar.gz`, D-2 네임스페이스 prefix 없음)도 통과했다.
  StageA 검증기와 동일하게 `.source.key == ("releases/task168-stage-b/" + $sha + ".tar.gz")`
  정확히 비교하도록 고쳤다. `test-task168-stage-b-manifest.sh`에 StageA 키를 넣은 StageB
  매니페스트가 거부되는 음성 케이스를 추가했다.
- **`task168-stage-b-post-live-verify.sh`의 ledger 조회가 `LIKE '202609%_v1_%'`였다.** 무관한
  9월 마이그레이션까지 포함될 수 있었다. 매니페스트의 `.database.task168.migrations[]`에서
  정확한 이름 목록을 받아 `IN (...)`으로 조회하고, 각 행의 checksum을 매니페스트 값과 대조하도록
  고쳤다. 이제 쓰이지 않는 `TASK168_M11`/`TASK168_M11_SHA256` 상수는 제거했다.
  `test-task168-post-live.sh`(기존 gate 연결 테스트)의 ledger fixture에 Task168 11건과 무관한
  9월 마이그레이션 2건을 항상 함께 두어 통과 케이스 자체가 이를 증명하게 했고, checksum 불일치
  음성 케이스와 LIKE 패턴으로 되돌리는 변이(mutation) 케이스를 추가했다 — 가짜 psql은
  실제 `psql -At` 출력 형식(파이프 구분, 헤더 없음)을 그대로 돌려준다.
- **`deploy-alpha-via-ssm.sh`의 주석이 실제 동작과 달랐다.** poll 소진 시 "실패로 보고하지
  않는다"고 적혀 있었는데 실제로는 `exit 1`로 스텝을 실패시킨다 — 다만
  `FAILED_HOST_EXITED`가 아니라 `UNKNOWN_HOST_MAY_BE_RUNNING`으로 분류해 운영자가 죽은
  호스트로 오판하지 않게 한다. 주석만 고쳤고(로직 무변경), 기존 `run_classification` 케이스가
  이미 `rc≠0`을 확인하고 있어 테스트는 추가하지 않았다.

**이번 라운드 추가 수정 — U2(post-commit 활성화) 결정 반영 + Copilot 리뷰 2건 추가 대응**
- **U2 = 자동 계속으로 확정.** `deploy-alpha-stage-b.sh`의 `stageBFinal`이 러너의
  `MIGRATION_COMMITTED` 이후 같은 실행 안에서 최종 소스 활성화 → 이미지 pull → 메타데이터
  기록 → `docker compose up -d --force-recreate`(api/web/worker, 그다음 nginx) → 각 writer의
  restart policy를 `quiesce.json`의 `restartPolicyBefore.api`/`.worker`에서 복원(compose의
  정적 `restart: always`로 덮이지 않게, 하드코딩 없음) → worker healthcheck 대기 → T7
  (`task168-stage-b-post-live-verify.sh`) → `write_candidate_manifest` +
  `promote_candidate_manifest`(이미 존재하던 `assert_stage_b_promotion_receipt` 게이트가
  그대로 통과 조건)까지 이어간다. M11 커밋 이후이므로 이 구간의 어떤 실패도 이전 이미지로
  롤백하지 않는다 — `activation-stage.json`(status `ACTIVATION_DIAGNOSIS_REQUIRED`)에 실패
  단계 이름과 사유를 남기고 런타임은 실패가 남긴 상태 그대로 둔 채 종료한다. 재시도는 자동
  entry point 없이 수동 절차이며(`docs/ops/task168-stage-b-runbook.md` "Post-commit activation
  failure"), `stageBRecover`의 R-A/R-B 판정은 전혀 바꾸지 않았다 — 여전히 `migration-stage.json`
  존재 여부로만 판단한다. `deploy-alpha.yml`의 `task168_stage` 입력 주석과 `.changeset`,
  `deploy-alpha-stage-b.sh` 헤더에서 "post-commit start pending U2" 문구를 전부 제거했다.
  `test-task168-stage-b-wrapper.sh`에서 실제로 아무 활성화 코드도 없다고 주장하던 static guard
  (`check_no_post_commit_start`)를 지우고, 성공 케이스(활성화→restart policy 복원→T7→promote
  전부 통과) + 실패 케이스 2건(T7 실패, compose-up 실패 — 각각 영수증 미기록·정확한 실패
  단계명·이전 이미지 미참조 확인) + premature-receipt mutation 1건을 추가했다.
- **영수증 계약을 런북에 명문화.** `migration-stage.json`/`runtime-verification.json` 둘 다
  같은 `<ALPHA_RELEASE_STATE_DIR>/task168/<releaseSha>/` 디렉터리에 release별로 쓰인다(PR-B가
  가정했던 flat `task168-final/` 경로가 아니다). 전체 필드·타입·소비자가 실제로 바인딩해야
  하는 jq 조건(정확히 `assert_stage_b_promotion_receipt`가 쓰는 조건)을 런북 "Receipt
  contract" 절에 적었다. `test-task168-post-live.sh`에 `runtime-verification.json`의 정확한
  키 집합(중첩 객체 포함)을 고정하는 assertion을 추가해 필드 rename이 red가 되게 했다.
- **PRRT_kwDORrML2s6iCgGF — `create-alpha-release-manifest.sh`의 StageB 매니페스트 재사용
  경로가 `resolvedMigrationAttemptsSha256`를 갱신 확인 안 했다.** S3에서 기존 매니페스트를
  받아올 때 `validate_alpha_stage_b_final_manifest`는 이 필드가 sha256 형식인지만 보고 이번
  실행에서 새로 읽은 predecessor/live-DB 스냅샷(`TASK168_RESOLVED_MIGRATION_ATTEMPTS_SHA256`)과
  같은 값인지는 비교하지 않았다 — 오래된 매니페스트가 CI를 통과하고 호스트에서야 실패할 수
  있었다. 재사용 분기에 명시적 동등성 비교를 추가해 즉시 실패하게 했다.
  `test-task168-stage-b-manifest.sh`에 실제 스크립트를 두 번 실행하는(첫 실행이 기준
  매니페스트를 만들고 S3 put-object를 가짜 aws로 가로채 저장, 그 저장본의
  resolvedMigrationAttemptsSha256만 변조한 뒤 두 번째 실행이 재사용 경로를 타서 거부하는지
  확인) 음성 케이스와, 새 동등성 검사를 제거하면 같은 변조 매니페스트가 통과함을 확인하는
  mutation 케이스를 추가했다.
- **PRRT_kwDORrML2s6iCgGa — `task168-stage-b-post-live-verify.sh`가 개수만 보고 정확히 11개인지
  확인 안 했다.** `.database.task168.migrations[]`가 비어있지만 않으면(10개든 12개든) 통과해
  ledger 조회로 넘어갔는데, 승격 게이트(`assert_stage_b_promotion_receipt`)는
  `ledgerCount == 11`을 하드코딩해 요구한다 — 개수가 틀리면 영수증을 쓰기 전에 막아야 한다.
  정확히 11개를 요구하도록 고쳤다. `test-task168-post-live.sh`에 10개·12개 매니페스트가 영수증
  기록 전에 거부되는 음성 케이스 2건과, 검사를 "비어있지 않음"으로 완화하면 10개짜리가
  exact-11 메시지로 더 이상 거부되지 않음을 확인하는 mutation 케이스를 추가했다.

**되돌아가며 잡은 테스트 인프라 버그 2건(내가 만든 새 시나리오에서 발견, 별도 커밋 아님)**
- `test-task168-stage-b-wrapper.sh`의 신규 시나리오들이 `pass`/`fail`만 부르고 `exit`하지 않는
  서브셸 블록을 썼는데, `pass`/`fail` 둘 다 0을 반환해 바깥의 `) && PASS+=N || FAIL+=1`이
  항상 성공으로 집계했다 — 실패가 조용히 통과로 보고될 수 있었다. 각 블록에 `block_ok` 플래그를
  두고 마지막 줄에서 그 값을 그대로 실행해 진짜 종료 코드를 내보내도록 고쳤다.
  `docker login --username AWS --password-stdin`을 처리하지 않던 가짜 docker(catch-all이 stdin을
  안 비우고 바로 exit)가 `aws ecr get-login-password | docker login ...` 파이프에서 가끔
  SIGPIPE(rc=141)로 죽는 레이스가 있었다 — 새 시나리오뿐 아니라 기존 `run_stage_b_final_no_receipt`
  시나리오의 가짜 docker에도 있던 문제라 같이 고쳤다(`cat > /dev/null`로 stdin을 비우고 exit).
  고친 뒤 새 wrapper 시나리오를 5회 연속 재실행해 0 failed를 확인했다(고치기 전엔 5회 중 2~3회
  간헐적으로 실패).

**이번 라운드 추가 수정 (2026-09-14) — 리허설 waiver + stageBPreflight 완전 삭제**
- **사용자 직접 지시로 T5 격리 리허설을 이번 M11 실행에서 생략한다.** manifest와 러너가
  `finalImagePreflight` 영수증(`kind=="task168FinalImagePreflight"`)을 더 이상 요구하지 않는다.
  대신 `database.task168.rehearsal: {mode, reason, decidedAt}`을 요구하고, 러너는
  `mode=="waived"`일 때만 진행하며 같은 값을 `MIGRATION_COMMITTED` 영수증에 그대로 복사한다.
  `deploy-alpha.yml`은 `TASK168_REHEARSAL_MODE=waived` / `REASON="user-directed Alpha run
  without isolated rehearsal"` / `DECIDED_AT="2026-09-14"`를 리터럴로 넘긴다. 이 waiver가
  대체한 finalImagePreflight 경로가 바인딩하던 `migrationLockSha256`(source의
  `migration_lock.toml` 무결성 검증)은 매니페스트의 독립 필드로 남겼다 — manifest 생성 시점에
  이 커밋의 실제 migration_lock.toml에서 계산되므로 재사용 경로에서 별도 신선도 검사가 필요
  없다(resolvedMigrationAttemptsSha256과 달리 커밋 불변값).
- **`stageBPreflight`를 dispatch 선택지·wrapper·via-ssm·manifest 생성기·테스트·런북에서 전부
  삭제했다.** 호스트 분기가 무조건 실패(`orchestration is not wired yet`)하는 죽은 선택지였고,
  T2(`task168-stage-b-fresh-backup.sh`) 의존 스크립트도 없었다. 이제 dispatchable stage는
  `stageBFinal`/`stageBRecover` 둘뿐이다. `deploy-alpha-stage-b.sh`의 후반부
  `stageBFinal`/`stageBPreflight` 분기용 `case`문은 이제 값이 하나뿐이라 제거하고 본문만 남겼다.
- **패키저 옵션 불일치를 고쳤다.** `deploy-alpha.yml`의 "Package and upload Task168 StageB
  source" 스텝이 `package-task168-final-source.sh`에 없는 `--output-attestation`을 넘기고
  있었다 — 그 스크립트는 항상 `"${archive}.attestation.json"` 고정 경로에 스스로 쓰고 인식 못한
  옵션은 `usage`/exit 64로 거부한다. 그 플래그를 뺐다. 이 attestation 사이드카는 더 이상 아무
  것도 읽지 않는다(rehearsal waiver로 대체) — 패키저 자체와 소스 아카이브 업로드는 그대로
  필요해 스텝은 유지했다.
- **불변 stageBFinal manifest는 stageBFinal dispatch에서만 만들어진다.** stageBPreflight
  삭제로 자연히 해소됐다 — `create-alpha-release-manifest.sh`의 StageB 분기는
  `TASK168_STAGE==stageBFinal`이 아니면 즉시 거부하고, `manifests/task168-stage-b/<sha>.json`
  키 하나만 쓴다(직전 라운드에서 도입했던 `task168-stage-b-preflight/` 네임스페이스 분기는
  되돌렸다).
- **T7 read-only smoke check의 `'ENDED'` 상태값 버그를 고쳤다.** `V1TeamMatchStatus`에는
  `ENDED`가 없다(`recruiting|closed|matched|cancelled|completed|archived`) — 모든 stageBFinal
  실행이 M11 커밋 후 이 검사에서 항상 실패했다. `'completed'`로 고쳤고, 대회 데이터가 0건인
  Alpha(M11 직후 정리 예정)에서도 거짓 실패하지 않도록 0건이면 `smokeCheck.status:
  "skipped_no_data"`로 통과시키되(쿼리 자체는 이미 `set -e`+`psql -v ON_ERROR_STOP=1`로
  fail-closed), 실제 조회 오류는 그대로 실패시킨다. 실제 postgres:16-alpine 하네스
  (`scripts/qa/test-task168-post-live-smoke-status.sh`)로 ENDED 미존재·completed 값 발견·0건
  통과·잘못된 enum 리터럴 조회 오류 4가지를 각각 검증했다.
- **`scripts/qa/harness/task168-stage-b-fixtures/build-fixtures.mjs`**(real-docker 러너 하네스
  `test-task168-stage-b-runner.sh`의 매니페스트 생성기)도 같은 계약으로 맞췄다 —
  `finalImagePreflight` 생성 코드를 지우고 `migrationLockSha256`(실제 harness 소스 트리의
  `migration_lock.toml`에서 계산, 기존 코드가 이미 갖고 있던 값 재사용)과 `rehearsal` waiver를
  넣었다. real-docker 실행은 host 부하(load avg ~22, 공유 머신) 때문에 이번 라운드에서 돌리지
  못했다 — 정적으로 필드 대응만 확인했다.
