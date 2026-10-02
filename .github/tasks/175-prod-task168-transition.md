# Task 175 — 프로덕션 Task168 전환 (alpha 방식 이식, C2)

Status: Implemented — 승격(dev→main)과 Stage A/B 실행은 사용자 결정 대기. 런북 `docs/ops/prod-task168-transition-runbook.md`.

## Progress Snapshot — 2026-10-02 Alpha seed applicant follow-up

#1513은 clean Sonnet/API/Web/Gates 후 dev92334b76f에 반영됐고 Alpha 배포36953527183도 SUCCESS였다.
그러나 실제 headed QA에서 memberCount4/active roster6이 다시 확인됐다. 정확한 SSM 배포 stdout/stderr를 대조해 league seed의 `v1_tournament_registrations_applied_by_user_id_fkey` 실패와 non-fatal warning을 확인했다. 전체 seed transaction rollback으로 카운터 변경도 반영되지 않았다.

- [x] 일반/티어 리그 seed의 `V1AdminUser.id`와 `V1User.id` 혼용을 실제 팀 로스터 사용자 ID로 수정. 관리자 생성자 ID와 기존 registration은 보존한다.
- [x] 실제 seed 함수2개에서 외래키 의미 RED2건 → GREEN3건(재실행/creator 보존/빈 로스터 거부), backend/seed typecheck PASS. 스키마·migration·API 형태 변경0.
- [ ] 최신 dev PR CI/clean 리뷰·반영 → Alpha seed 성공/표시·명단 일치 → Changeset 소비. source 수정만으로 실제 Alpha 결함을 해결 표시하지 않는다.

Owned: league seed, actor 회귀 spec, Changeset, 본 task. Forbidden: 원본 WIP, production DB 변경·main 승격, 유료 리소스 생성·운영 dump 반출. NO-GO 유지.

## Progress Snapshot — 2026-10-02 Alpha counter follow-up

판정 NO-GO. bf63 인증24/24와 실제189개 DB fixture 검증은 운영 데이터 보존 리허설을 대체하지 않는다.
Alpha 팀 표시4/활성명단6 결함을 발견해 league/tournament/squad seed가 기존 활성 멤버까지 집계하도록 수정했다.
V1TeamMembership의 active role별 집계로 V1Team.memberCount/managerCount를 재계산하며 owner는 managerCount에 포함하지 않는다. 스키마·migration·API 응답 형태 변경 없음.

- [x] 실제 tournament roster seed 재실행으로 추가 멤버 보존 회귀 RED(memberCount1/기대3) → GREEN, 좁은3테스트 PASS.
- [x] seed와 backend TypeScript 검사 PASS. Docker 보관 이미지의 Linux 의존성 사용, 자체 컨테이너 자동 정리.
- [ ] dev PR 최신 CI/리뷰·반영 후 Alpha 표시/활성명단 재대조. 로컬 소스 수정으로 배포된 결함을 해결 처리하지 않는다.
- [ ] 최종 Changesets 전체 소비/release-only dev PR/최종 SHA CI·Alpha QA.
- [ ] 기존 운영 dump의 데이터 보존 리허설, 공지/운영자/동결 조건. 사람 결정은 배포 전 확정하며 현재 미정.

Owned: alpha seed3개, 공유 카운터 helper/회귀 spec, Changeset, 본 task. Forbidden: 원본 WIP, main 승격, production DB 변경, 과금 리소스·운영 dump 반출.

## Progress Snapshot — 2026-10-01 production readiness

판정 **NO-GO**. 보고서 `docs/ops/prod-readiness-2026-10-01.md`, 승격 PR 본문 `docs/ops/prod-promotion-pr1325-body.md`.
사용자의 최신 지시대로 직접 가능한 GitHub/AWS/서비스 확인은 에이전트가 수행한다.

- [x] 규칙/런북/워크플로 읽기, 재fetch dev16a8c301/mainf49742f45, main-only0/dev-only4328, Changeset79/source chain188.
- [x] 원본 WIP를 보존하고 격리 worktree/dev 대상 PR #1476에서만 수정.
- [x] prepare-only·업로드 확장자·dockerignore·PITR/완료쿼리 설명, 자동 리뷰의 실패 안내 및 실패 경로 보완.
- [x] promote10/upload16/callback6, multer3, surface 정상/거부, Task168/security 계약 PASS.
- [x] 최초704b601의 #1476 API/Web/Gates CI PASS; 최신 후속 커밋은 별도 확인.
- [x] #1325 thread26/미해결1(.dockerignore), High6 오탐 명시 처리. 현재dev/승격ref open0과 main 잔존High9/Medium2를 구분.
- [x] 최신 dev CI/CodeQL/alpha SUCCESS, 실제 웹/API alpha16a8c301/prodf49742f45/health200/DBtrue, 전체 공개44/44·32/32 상세200.
- [x] Windows AWS 기존 인증으로 production 계정 바인딩/RDS available/PITR7일/자동백업active/오래된manual snapshot/SSM Online 확인.
- [x] 운영 DB READ ONLY: 완료123/rollback2/unresolved0, main/dev 역사 checksum exact, pre-transition counts/seal0 확인.
- [x] state active f497/0.5.0 존재, API/Web/worker healthy·digest/source 일치. 알려진 백업은07-26/Task168 기본receipt 없음.
- [x] 로컬 Docker Desktop Linux 엔진 연결, 기존 컨테이너0. 시스템/운영 DB reset 없음.
- [ ] #1476 최신 CI/Copilot clean 리뷰 → dev 반영 → Docker thread 해결.
- [ ] 수정 dev 반영 뒤 모든 Changeset release-only 재생성/PR → 최종 SHA CI/alpha 인증 QA.
- [ ] 현재188개 chain의 production clone 실증 리허설/실제 복원 증거. 과거178개 기록을 최신 완료로 표시하지 않음.
- [ ] 공지·동일 연속 운영자·main SHA 동결 확정 → GO 재판정.

Owned: release script/test, upload service/test, dockerignore, task/운영 보고서/런북, AGENTS/CLAUDE/compatibility, 자체 Changeset.
Forbidden: 원본 shared-tree WIP, main push/merge, production approval, production DB mutation.
과거75개/c446 기반 release-only 후보는 최종 후보가 아니다. RDS 리소스 생성/덤프 반출은 수행하지 않았다.

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. 체크박스로 진행을 추적한다.

**Goal:** dev→main 승격 후 프로덕션 DB 를 Task168 최종 스키마로 옮기는 Stage A / Stage B 두 번의 배포 경로를 만든다.
alpha 의 안전장치(quiesce·백업·전환·migration-stage 영수증, 단계 거부 가드, 롤백 거부)를 그대로 갖추고, A 와 B 사이에는 API 를 멈춘 채 둔다.

**Architecture:** `deploy.yml` 에 `workflow_dispatch` 입력 `task168_stage`(`stageA` | `stageB`)를 추가하고, 매니페스트의
`database.task168` 블록으로 단계를 `deploy-prod.sh` 에 전달한다. 호스트 쪽 단계 로직은 새 파일
`deploy/prod-task168.sh`(러너)와 `deploy/prod-task168-common.sh`(DB·영수증 헬퍼)에 두고, `deploy-prod.sh` 는
단계가 있으면 그 러너로 분기한다. DB 는 외부 RDS 라 모든 SQL·백업은 `DATABASE_URL` 을 `--env-file` 로 받는
일회용 `postgres:16-alpine` 컨테이너로 실행한다(기존 `assert_task168_m11_guard` 패턴).

**Tech Stack:** bash(set -Eeuo pipefail), jq, docker compose, GitHub Actions, AWS SSM·ECR·RDS, Prisma 6.19 CLI.

**Spec:** 사용자 결정 2026-09-27 — 결정 1 = C(alpha 방식 이식), 결정 3 = C2(점검 시간 안에 A→B 연속, 중간 서비스 없음).
리허설 근거: 프로덕션 덤프 로컬 복원 리허설(아래 Context).

## Context

2026-09-27 프로덕션 RDS 덤프(53MB · 111 테이블 · 원장 123 = main)를 로컬에 복원해 dev migration 55개를 리허설했다.

- 현행 `deploy-prod.sh` 로는 승격 배포가 불가능하다.
  1. `assert_task168_m11_guard`(`deploy/prod-release-common.sh:281`)는 원장에 M11 이 **이미** 있어야 migrate 를 허용한다 → 항상 실패.
  2. 가드를 없애도 M9 `20260910020000_v1_canonical_game_db_guards` 가 `CANONICAL_GAME_GUARD_PRECONDITION_FAILED legacy_fixtures=32` 로 실패한다(P3009, 33개만 적용된 채 멈춤).
- 성공한 순서(14초, 원본에서 반복 재현):
  1. `< M1` 전부 + M1–M7 + M8 + M10 (M9 제외) — `migrate deploy --schema <임시 폴더>`
  2. 전환 도구(`deploy/task168-pre-retirement-v7.tar.gz`, Dockerfile target `task168-cutover-tool`, `--report /abs/path`) → `status=COMPLETED`, `remainingLegacy*=0`, 대회 경기 32건 이동
  3. M9 적용
  4. 나머지 11개(M11 포함) — 평범한 `prisma migrate deploy`
  5. `tournament-award-recipient-backfill.cli.js` → 10건
  - 결과: 드리프트 0 · 원장 178 적용 / 0 미해결 · 핵심 테이블 행 수 불변 · 공통 GET 라우트 441 조합 퇴행 0
- alpha 의 Stage A 러너(`deploy/task168-stage-a-migrate.sh`)는 로컬 `v1_postgres` 컨테이너·r5 중간 스키마 해시·alpha 상태 경로를 전제하므로 그대로 쓸 수 없다. 순서와 검증 쿼리(`assert_actual_cutover_seals`, `assert_transition_report`)는 그대로 옮긴다.

## Original Conditions

- [ ] alpha 와 같은 단계 분리: Stage A 배포(quiesce → 백업 → M1–M8·M10 → 전환 도구 → M9 → 전환 영수증) 와 Stage B 배포(M11 + 나머지 → 활성화 → 사후 검증 → 승격) 가 **별도 workflow_dispatch 두 번**
- [ ] 영수증: quiesce / backup / transition / migration-stage / runtime-verification — 각 단계가 앞 단계 영수증을 검증하지 못하면 진행 거부
- [ ] A 와 B 사이 API·게임 운영 워커는 멈춘 상태 유지(C2). 중간 스키마용 API 를 띄우지 않는다
- [ ] 백업: `pg_dump -Fc` 파일(alpha 와 동일) → 영수증에 sha256·bytes. 2차 복구 = RDS 시점 복구(PITR 7일, 2026-09-27 확인) — quiesce 영수증 시각 기준. 호스트·배포 역할 모두 `rds:*` 권한이 없으므로(2026-09-27 IAM 시뮬레이션 implicitDeny) 러너는 RDS API 를 부르지 않는다
- [ ] 롤백 거부: 전환 영수증이 있는 DB 에 Task168 이전 이미지로의 자동 롤백을 거부(`deploy/rollback-prod.sh`)
- [ ] 일반 main push 배포는 지금처럼 M11 가드에서 멈추되, 메시지가 이 태스크의 런북을 가리킨다
- [ ] 승격(main 머지)·배포 승인은 사용자 전용 — 이 태스크는 경로만 만든다. 프로덕션에서 실행하지 않는다
- [ ] 로컬 리허설: 새 러너를 **복원한 프로덕션 덤프**에 대해 끝까지 실행해 통과

## Global Constraints

- DB 접속은 `DATABASE_URL` 만 사용. argv 에 비밀번호를 노출하지 않는다(`--env-file <(printf ...)` 패턴, `prod-release-common.sh:305` 참고).
- 상태 경로: `${PROD_RELEASE_STATE_DIR}/task168/<release-sha>/` (기존 변수, `prod-release-common.sh:77`). alpha 경로(`ALPHA_RELEASE_STATE_DIR`) 참조 금지.
- 고정 해시: 전환 도구 아카이브 `829cbb214afc26c417947c864fd477647498003e06915ca20b4d2f8b44b80c4b`, M11 `08eac7347cbb10fcc4ef87d31d63bd9516d5bfda281dcf5730c4f0a1985d9323`. 새 해시를 만들지 않는다.
- migration 이름: M1 = `20260908130000_v1_team_match_tournament_expand` … `20260909110000_v1_operation_audit_canonical_binding`(7개), M8 = `20260910010000_v1_official_fact_source_history`, M9 = `20260910020000_v1_canonical_game_db_guards`, M10 = `20260910160000_v1_outbox_cutover_claim_gate`, M11 = `20260911090000_retire_tournament_fixture_tables`.
- 전환 도구 이미지는 prod ECR `teameet-prod-v1-api` 에 태그 `task168-cutover-<sha>` 로 push(새 리포지토리 만들지 않음).
- 주석은 저장소 언어(영어 코드 주석 + 기존 한국어 주석 파일은 한국어 유지)를 따르고 변경 줄의 1/3 안팎.
- 이 저장소는 PUBLIC — 프로덕션 식별자(RDS 엔드포인트·UUID)를 코드·PR 에 적지 않는다.

## Review Focus

1. **Stage A 도중 실패 후 재실행** — 전환 도구가 커밋한 뒤 M9 에서 실패하면, 재실행은 도구를 다시 돌리지 말고 봉인 확인 후 M9 부터 이어야 한다(alpha `initial_state` 판정과 동일). 테스트: 봉인 5/5/3 + 원장에 M9 없음 상태에서 재실행 → 도구 미실행, M9 적용.
2. **Stage B 를 Stage A 없이 실행** — 전환 영수증이 없거나 다른 DB 식별자면 migrate 전에 거부. 테스트 필수.
3. **Stage A 실패 시 옛 API 재기동 금지** — ERR trap 이 `restore_active_release` 로 옛 이미지를 부분 마이그레이션된 DB 에 올리면 안 된다. 테스트: 단계 모드에서 실패 → API 컨테이너가 멈춘 채 남는지.
4. **롤백** — 전환 영수증 존재 + 이전 릴리스 소스에 M11 폴더 없음 → `rollback-prod.sh` 거부. 테스트 필수.
5. **일반 push 배포** — 단계 없는 매니페스트는 기존 경로 그대로(가드 포함). 회귀 테스트: `test-task168-prod-guard.sh` 전부 통과.

---

## File Structure

| 파일 | 책임 | 신규/수정 |
|---|---|---|
| `deploy/prod-task168-common.sh` | `prod_dbq`(일회용 psql), `prod_db_identity`, 원장 조회, 봉인 확인, 영수증 쓰기·검증(sha256 바인딩) | 신규 |
| `deploy/prod-task168.sh` | `stageA` / `stageB` 러너 본체. 상태 판정 → 단계 실행 → 영수증 | 신규 |
| `deploy/deploy-prod.sh` | 매니페스트 `database.task168.stage` 가 있으면 러너로 분기, ERR trap 단계 모드 처리 | 수정 |
| `deploy/prod-release-common.sh` | `validate_prod_release_manifest` 가 `database.task168` 블록 검증, M11 가드 메시지에 런북 경로 | 수정 |
| `deploy/prod-manifest-common.sh` | (검증 함수가 여기 있으면) 같은 검증 | 수정(필요 시) |
| `deploy/rollback-prod.sh` | Task168 전환 이후 옛 릴리스 롤백 거부 | 수정 |
| `scripts/release/create-prod-release-manifest.sh` | `TASK168_STAGE`·전환 도구 이미지 digest·migration 해시·리허설 증거를 매니페스트에 기록 | 수정 |
| `.github/workflows/deploy.yml` | `workflow_dispatch.inputs.task168_stage`, stageA 일 때 전환 도구 이미지 빌드·push, 매니페스트 env 전달 | 수정 |
| `scripts/qa/test-prod-task168.sh` | 러너·공통 헬퍼 계약 테스트(가짜 docker/psql shim) | 신규 |
| `scripts/qa/test-prod-task168-real-db.sh` | 실제 Postgres 에 시드 → stageA → stageB 끝까지(기존 `test-task168-final-steady-real-db.sh` 패턴) | 신규 |
| `docs/ops/prod-task168-transition-runbook.md` | 승격 → Stage A → Stage B 운영 절차, 실패별 대응, 스냅샷 복원 | 신규 |
| `.changeset/*.md` | 저장소 changeset 정책이 요구하면 | 신규(필요 시) |

---

## Tasks

### Task 1: 공통 헬퍼 `deploy/prod-task168-common.sh`

**Interfaces (Produces):**
- `prod_dbq <sql>` — stdout = `psql -At` 결과. 환경: `PROD_TASK168_DATABASE_URL`, `PROD_TASK168_DB_NETWORK`(기본 `deploy_default`). `postgres:16-alpine` 일회용 컨테이너 + `--env-file <(printf 'DATABASE_URL=%s\n' ...)`. `ON_ERROR_STOP=1`. 실패 시 비0.
- `prod_db_identity` — `current_database()||'|'||current_user||'|'||(select system_identifier from pg_control_system())` 의 sha256. (RDS 에서 `inet_server_addr()` 는 불안정할 수 있어 쓰지 않는다. `pg_control_system()` 권한이 없으면 `current_database()|current_user|<RDS 인스턴스 식별자 env>` 로 대체 — 구현자가 로컬 PG16 과 **리허설 덤프 DB** 양쪽에서 확인.)
- `prod_ledger_rows` — `migration_name|checksum` (finished·not rolled back), 정렬.
- `prod_assert_cutover_seals` — alpha `assert_actual_cutover_seals` 와 같은 쿼리, 기대값 `5|5|3|0|0|0`.
- `prod_count_cutover_seals` — `write|row_write|link` 세 수를 `a|b|c` 로.
- `prod_write_receipt <path> <json>` — 0600, 이미 있으면 내용이 같을 때만 통과. `prod_receipt_sha <path>`.

- [ ] 테스트 먼저(`scripts/qa/test-prod-task168.sh` 의 common 섹션): docker shim 이 받은 argv 에 URL 이 없음, `--env-file /dev/fd/*` 존재, psql 실패 시 비0 전파, 영수증 재기록 시 내용 다르면 실패.
- [ ] 구현 → 테스트 통과 → 커밋.

### Task 2: 러너 `deploy/prod-task168.sh stageA`

**Consumes:** Task 1 전부. 환경: `PROD_SOURCE_DIR`, `PROD_MANIFEST_FILE`, `compose` 배열(호출자가 export 하는 대신 러너가 `deploy-prod.sh` 와 같은 방식으로 구성), 매니페스트의 `images.api.uri`, `images.cutoverTool.uri`.

**단계와 상태 판정** (alpha `task168-stage-a-migrate.sh` 의 `initial_state` 를 prod 로):
| 원장/봉인 상태 | 판정 | 동작 |
|---|---|---|
| M1 전부 없음, 봉인 0/0/0 | `fresh` | 전체 실행 |
| M1–M8·M10 적용, M9 없음, 봉인 0/0/0 | `precutover` | 전환 도구부터 |
| M1–M8·M10 적용, M9 없음, 봉인 5/5/3 | `committed` | 도구 건너뛰고 M9부터 |
| M1–M10 전부, 봉인 5/5/3, 전환 영수증 있음 | `complete` | 영수증 검증 후 exit 0 |
| 그 밖 (M11 이미 있음, 미해결 행, 봉인 부분) | 거부 | exit 1, 변경 없음 |

**실행 순서:**
1. quiesce: `compose stop v1_api v1_game_operations_worker` → 두 컨테이너 not running 확인 → `quiesce.json`(stopped services, 이전 이미지, db identity, 시각)
2. 백업: `pg_dump -Fc` 를 일회용 `postgres:16-alpine` 컨테이너로 `state_dir/backup.dump`(0600) 에 → `pg_restore --list` 로 읽히는지 확인 → `backup.json`(dump sha256·bytes·테이블 수, quiesce 시각). 실패하면 migrate 로 넘어가지 않는다.
3. pre migrations: 임시 폴더(`< M1` 전부 + M1–M7 + M8 + M10 + `migration_lock.toml` + 현재 schema) 를 candidate API 이미지 일회용 컨테이너에 마운트해 `prisma migrate deploy --schema /tmp/task168/schema.prisma`. 원장이 정확히 기대 목록인지 확인.
4. 전환 도구: `docker run --rm --network deploy_default --env-file <(DATABASE_URL) -v report_dir:/work <cutoverTool> --report /work/cutover-report.json`. 종료코드 0 → report `COMPLETED` + `remainingLegacy*==0` 확인. 비0 → 봉인이 있으면 `committed` 로 간주해 계속(alpha rc=2 경로), 없으면 거부.
5. M9: 같은 임시 폴더에 M9 추가 후 migrate deploy.
6. 봉인·원장 최종 확인 → `transition.json`(release sha, api/tool image, db identity, migration 해시, quiesce/backup/report sha256 바인딩).
7. **API 를 다시 올리지 않는다.** 출력: "Stage A complete — run task168_stage=stageB".

- [ ] 테스트: 상태 판정 표 5행 각각(shim 으로 원장·봉인 응답 조작), 백업 실패·`pg_restore --list` 실패 시 migrate 미실행, 도구 비0+봉인 없음 → 거부, `committed` 재실행 시 도구 미호출.
- [ ] 구현 → 통과 → 커밋.

### Task 3: 러너 `deploy/prod-task168.sh stageB`

**Consumes:** Task 1, Task 2 의 `transition.json` 형식.

1. 선행: 같은 DB identity 의 `transition.json` 이 정확히 1개, 그 안의 sha256 바인딩이 실제 파일과 일치, `prod_assert_cutover_seals` 통과, 원장 = `< M11` 전부 적용·미해결 0. 아니면 거부.
2. M11 소스 sha256 == 고정값 확인 → `m11-entry.json`(ENTERED)
3. `prisma migrate deploy`(평범한 전체 폴더) → 원장에 M11 체크섬 확인 → `migration-stage.json`(`MIGRATION_COMMITTED`, 적용 수)
4. 백필 CLI(`tournament-award-recipient-backfill.cli.js`)
5. 러너는 여기서 반환. 활성화(compose up·nginx·health·digest·promote)는 `deploy-prod.sh` 의 기존 흐름이 이어서 한다.
6. `deploy-prod.sh` 가 health 통과 후 러너의 `verify` 하위 명령 호출: 공개 대회 목록 200 + 각 대회 상세 200, `v1_tournament_match_details` 전 행의 공개 경기 상세 200 → `runtime-verification.json`. 실패 시 promote 하지 않고 비0(롤백은 거부 상태이므로 런북의 스냅샷 복원 절차로).

- [ ] 테스트: 전환 영수증 없음 → 거부(migrate 미호출), DB identity 불일치 → 거부, 영수증 파일 변조(sha 불일치) → 거부, M11 소스 해시 불일치 → 거부.
- [ ] 구현 → 통과 → 커밋.

### Task 4: `deploy-prod.sh`·`prod-release-common.sh`·`rollback-prod.sh` 배선

1. 매니페스트 `database.task168.stage` 읽기(`load_prod_release_manifest` 에 추가). 값: 없음 | `stageA` | `stageB`.
2. `stageA`: 이미지 pull·소스 활성화까지 기존대로 → M11 가드·migrate·compose up **대신** `prod-task168.sh stageA` → promote 하지 않고, candidate 매니페스트를 `task168/<sha>/manifest.json` 으로 보관하고 종료 0.
3. `stageB`: M11 가드 대신 `prod-task168.sh stageB` → 이후 기존 흐름(업로드 백업·compose up·nginx·health·digest) → `prod-task168.sh verify` → promote.
4. ERR trap: 단계 모드에서는 `restore_active_release`/`restore_legacy_runtime` 을 **호출하지 않는다**. 대신 `activation-stage.json`(실패 단계·시각) 을 쓰고 런북 경로를 출력.
5. 단계 없음: 기존 흐름 그대로. M11 가드 실패 메시지에 `docs/ops/prod-task168-transition-runbook.md` 추가.
6. `rollback-prod.sh`: `${PROD_RELEASE_STATE_DIR}/task168/*/transition.json` 이 있고, 롤백 대상(`.previous`) 릴리스 소스에 M11 폴더가 없으면 거부.
7. `validate_prod_release_manifest`: `database.task168` 이 있으면 `stage ∈ {stageA, stageB}`, `migrations[]`(이름·sha256 11개) 가 소스와 일치, stageA 는 `images.cutoverTool.uri` 필수·digest 형식, `rehearsal.evidence` 비어 있지 않음.

- [ ] 테스트: `test-task168-prod-guard.sh` 전부 통과(회귀), 새 테스트 — 단계 모드 실패 시 restore 미호출, 롤백 거부/허용 양방향, 매니페스트 검증 양방향(정상 통과·필드 누락 거부).
- [ ] 구현 → 통과 → 커밋.

### Task 5: 워크플로·매니페스트 생성

1. `deploy.yml` `workflow_dispatch.inputs.task168_stage`: `choice`, `none | stageA | stageB`, 기본 `none`. `task168_rehearsal_evidence`: string(stageA/B 필수 — 로컬 리허설 기록 위치).
2. push 이벤트는 항상 `none`.
3. `build-images`: stageA 일 때 `target: task168-cutover-tool` 이미지를 `teameet-prod-v1-api:task168-cutover-<sha>` 로 빌드·push, digest 를 매니페스트 단계에 전달. 기존 스캔(`check-prod-image-scans.sh`)에 포함.
4. `create-prod-release-manifest.sh`: `TASK168_STAGE`·`TASK168_CUTOVER_DIGEST`·`TASK168_REHEARSAL_EVIDENCE` 가 있으면 `database.task168` 블록 추가(migration 이름·sha256 은 소스에서 계산).
5. Gates job 에 새 테스트 두 개 추가(`test-prod-task168.sh` 는 push/PR 공통, real-db 는 기존 real-db 테스트와 같은 job).
6. `scripts/qa/check-production-deploy-security.mjs` 가 새 입력·job 에서도 불변식(승인 게이트·SSH 미사용)을 통과하는지 실행.

- [ ] 테스트: 워크플로 정적 검사 스크립트들 통과, 매니페스트 생성 스크립트를 로컬 env 로 돌려 stageA/stageB/none 세 경우 JSON 확인.
- [ ] 구현 → 통과 → 커밋.

### Task 6: 실제 DB 테스트 + 프로덕션 덤프 리허설

1. `scripts/qa/test-prod-task168-real-db.sh`: 로컬 Postgres 컨테이너 → main 까지의 migration + 옛 fixture 행 시드(`scripts/qa/harness/task168-stage-b-fixtures/` 재사용 가능 여부 확인) → stageA → stageB → 드리프트 0·원장 미해결 0·봉인 확인. docker compose 대신 러너의 compose/이미지 호출을 env 로 대체할 수 있게 Task 2·3 이 훅을 제공해야 한다(`PROD_TASK168_COMPOSE_CMD`, `PROD_TASK168_API_IMAGE_RUN` 등 — Task 2 에서 확정).
2. 리허설(메인 세션이 수행, 커밋 안 함): 복원한 프로덕션 덤프 사본에 대해 같은 러너를 실행. 결과(단계별 시간·영수증 요약)를 런북에 수치로 남긴다(식별자 제외).

- [ ] real-db 테스트 통과 → 커밋. 리허설 통과 기록.

### Task 7: 런북

`docs/ops/prod-task168-transition-runbook.md` — 사전 준비(콘솔에서 RDS 수동 스냅샷 1회 — 선택이지만 권장, PITR 보존 기간 확인), 순서(승격 PR 머지 → push 배포는 **승인하지 않고 취소** → dispatch stageA → 승인 → 확인 → dispatch stageB → 승인 → 확인), 예상 중단 시간, 실패 지점별 대응(표), 스냅샷 복원 절차, 완료 후 확인 쿼리. CLAUDE.md·AGENTS.md 의 브랜치 정책 절에 한 줄 링크.

- [ ] 작성 → 커밋.

---

## User Scenarios

- 사용자가 dev→main 승격 PR 을 머지한다 → push 배포는 build-images 까지 돌고 승인 대기. 사용자는 승인하지 않고 취소한다(승인해도 M11 가드가 DB 변경 전에 멈추고 옛 릴리스를 유지).
- 사용자가 점검 공지 후 `task168_stage=stageA` 로 dispatch → 승인 → API 가 멈추고 스냅샷·전환이 끝난다. 웹은 떠 있지만 API 오류 상태를 보인다.
- 사용자가 `task168_stage=stageB` 로 dispatch → 승인 → 새 버전이 서비스를 재개하고 사후 검증이 통과하면 승격된다.

## Test Scenarios

- happy: real-db 테스트 stageA→stageB, 프로덕션 덤프 리허설.
- edge: Stage A 재실행(`committed`·`complete`), Stage B 재실행(M11 이미 적용 → 나머지만), 전환 도구 비0 + 봉인 있음.
- error: 영수증 변조, DB identity 불일치, 스냅샷 실패, M11 소스 해시 불일치, 단계 없는 push 배포(가드 메시지).
- mock updates: 해당 없음(앱 코드·Prisma 모델 변경 없음).

## Parallel Work Breakdown

- 순차: Task 1 → (Task 2 ⟂ Task 3) → Task 4 → Task 5 → Task 6 → Task 7.
- Task 2·3 은 같은 파일(`prod-task168.sh`)이므로 **한 구현자가 연속으로** 한다.

## Acceptance Criteria

- [ ] 새 테스트 + 기존 `scripts/qa/test-task168-*.sh`·`test-final-schema-binding.py`·`check-production-deploy-security.mjs` 통과
- [ ] 프로덕션 덤프 리허설: stageA→stageB 후 드리프트 0 · 원장 미해결 0 · 전환 보고서 remainingLegacy* 0 · 핵심 테이블 행 수 불변 · 공개 대회 경기 상세 32건 200
- [ ] 단계 모드 실패 시 옛 API 가 재기동되지 않음(테스트)
- [ ] 롤백 거부 양방향 테스트
- [ ] 런북 존재, CLAUDE.md·AGENTS.md 링크
- [ ] dev 머지 후 alpha 배포 green(이 변경은 prod 경로만 건드리므로 alpha 경로 무영향 확인)

## Tech Debt Resolved

- 자기모순 M11 가드: 단계 모드에서 가드 대신 영수증 검증으로 대체, 일반 모드 메시지 보강.
- `deploy-prod.sh` 가 M1–M10 을 quiesce·백업 없이 적용하던 위험(가드 주석이 스스로 명시한 "pre-existing risk") 해소.

## Security Notes

- DB URL 은 argv·로그에 남기지 않는다. 덤프 파일 0600, 상태 디렉터리 0700.
- IAM 권한을 추가하지 않는다. 백업 덤프는 호스트 상태 디렉터리(0700)에만 두고 S3 로 옮기지 않는다(개인정보 포함).
- PUBLIC 저장소 — 런북·PR 에 엔드포인트·인스턴스 ID 를 적지 않고 `.env` 키 이름만 적는다.

## Risks & Dependencies

- Stage A~B 사이 서비스 중단(C2 수용). 두 번의 승인 대기 시간이 그대로 중단 시간이 된다 → 런북에 "같은 사람이 연속 승인" 명시.
- 호스트 디스크: 덤프 약 4MB(2026-09-27 실측) — 여유 충분. 덤프 실패는 fail-closed.
- 전환 도구 이미지 빌드 시간(로컬 73초) 만큼 stageA build-images 가 늘어난다.

## Ambiguity Log

- 2026-09-27: 전환 방식 → C(alpha 방식). 중간 서비스 → C2(없음, 점검 시간 안에 연속). 시상 이름 → 현행 유지(PR #1309).
- 미결: 점검 중 웹 화면 안내(점검 페이지)는 이 태스크 범위 밖 — 필요하면 UI 3안 절차로 별도 태스크.

## 2026-10-02 PR review handoff

사용자가 최신 production DB 사본 Stage A/B 리허설 상태를 **미실행**으로 확인했다. 기존 acceptance checkbox를 완료로 바꾸지 않는다. 수정 PR 11개 dev 병합 및 release 1.1.1 준비는 production GO 증거가 아니다. [현재 NO-GO 및 준비 기록](../../docs/ops/pr-review-2026-10-02.md).
