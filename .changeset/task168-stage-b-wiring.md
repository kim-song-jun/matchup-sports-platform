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
없어요.
