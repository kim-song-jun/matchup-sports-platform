# 프로덕션 Task168 전환 런북 (Stage A → Stage B)

운영자가 이 문서만 보고 프로덕션 DB 전환(dev→main 승격 이후, `teameet.co.kr` 을 실제로
Task168 최종 스키마로 옮기는 작업)을 그대로 따라 할 수 있도록 쓴 실행 순서서다.
`deploy/prod-release-common.sh`·`deploy/prod-task168.sh`·`deploy/deploy-prod.sh` 의 실패
메시지가 전부 이 문서를 가리킨다 — 즉 이 문서는 "참고용"이 아니라 스크립트가 막혔을 때
운영자가 실제로 펼쳐 보는 문서다.

## 한눈에 — 무엇을, 왜

Task168 은 대회 경기 데이터를 예전 방식(`v1_tournament_fixture_*` 레거시 테이블 5개)에서
새 방식(`v1_games`·`v1_team_matches` 등 canonical 테이블)으로 옮기는 작업이다. 이미
alpha(`alpha.teameet.co.kr`)에서는 끝났고, 이 문서는 그 다음 단계 — **진짜 사용자 데이터가
있는 프로덕션(`teameet.co.kr`)에 같은 전환을 적용하는 절차**다.

세 가지를 미리 알아야 한다.

1. **배포를 두 번 한다.** Stage A(준비) 와 Stage B(마무리)로 나뉘어 있고, 각각 GitHub Actions
   승인을 한 번씩 거친다. 두 번 다 하지 않으면 전환이 끝나지 않는다.
2. **그 사이 서비스가 잠깐 멈춘다.** Stage A 가 시작되면 API 서버를 내리고(quiesce — "라이터를
   잠깐 세운다"는 뜻, 이 절차에서는 API·워커 컨테이너를 멈추는 것), Stage B 가 새 버전을 다시
   올릴 때까지 API 는 계속 꺼져 있다. 웹(정적 페이지)은 떠 있지만 API 를 부르는 화면은 전부
   오류로 보인다. 두 승인 사이 대기 시간이 그대로 서비스 중단 시간이 되므로, **같은 사람이
   두 승인을 연속으로 처리**해야 한다.
3. **되돌리기가 어렵다.** Stage B 가 M11(레거시 테이블을 실제로 지우는 마이그레이션)을 적용하고
   나면, 이전 버전 이미지를 다시 띄우는 "이미지 롤백"은 더 이상 안전하지 않다 — 코드가 이미
   지워진 테이블을 찾게 된다. 그 이후의 복구는 PITR(Point-In-Time Recovery, "특정 시각으로
   DB 를 되돌리는 RDS 기능") 이나 수동 백업 복원뿐이다.

## 사전 준비 체크리스트 (승격 PR 머지 전)

모두 승격 PR(`dev` → `main`)을 **머지하기 전에** 끝내 둔다.

### 릴리스 워크플로가 아직 main에 없는 경우

`promote-main.yml`이 dev에만 있고 기본 브랜치 main에는 없다면 `gh workflow run ... --ref dev`도
404로 실패할 수 있다. workflow_dispatch는 기본 브랜치에 워크플로가 있어야 한다.
이 문제를 해결하려고 main에 파일을 직접 push하지 않는다. 최신 dev에서 격리 feature 브랜치를
만든 뒤 아래 **로컬 준비 전용 모드**로 Changeset을 소비하고 두 앱의 버전·CHANGELOG diff를 만든다.

```bash
git fetch origin dev main
# 다른 작업 트리의 WIP를 보존하고 별도 worktree를 사용한다.
git worktree add /tmp/teameet-release-prep -b fix/production-release-prep origin/dev
cd /tmp/teameet-release-prep
CONFIRMATION=PROMOTE bash scripts/release/promote-main.sh --prepare-only
git diff --check
git diff --stat
```

이 모드는 alpha SHA·버전을 먼저 확인하며 stage/commit/push/dispatch를 하지 않는다.
**`--prepare-only`를 빼면 기존 모드는 dev push와 alpha dispatch까지 실행한다.**
준비한 diff는 dev 대상 PR로 전달하고, 그 결과의 새 dev SHA에서 API·Web·Gates·CodeQL과 alpha를
다시 확인한다. 추가 Changeset이 들어왔다면 다시 소비해야 한다. 2026-10-01 준비 결과와
남은 운영 조건은 [GO/NO-GO 보고서](prod-readiness-2026-10-01.md)를 참고한다.

GitHub 동작 근거: [수동 워크플로 실행 문서](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow).

- [ ] **리허설 증거 문구를 미리 준비한다.** GitHub Actions 의 workflow_dispatch 입력
      `task168_rehearsal_evidence` 는 이 전환을 사전에 리허설했다는 증거를 담는 자유 텍스트다
      (예: `"task-6-report.md rehearsal 2026-09-27, drift 0, ledger clean"`). 빈 문자열이면
      Stage A/B 모두 거부된다(`resolve-task168-stage.sh`). 500자 안팎(정확히는 1500바이트)
      제한, 줄바꿈·탭 등 제어문자 금지 — 한 줄 문장으로 미리 준비해 둔다.
- [ ] **RDS 콘솔 수동 스냅샷 1회(선택이지만 권장).** 러너 자체도 `pg_dump` 백업을 뜨지만
      (아래 "복구" 절 참고), 그것과 별개로 AWS 콘솔에서 RDS 인스턴스의 수동 스냅샷을 한 번 더
      떠 둔다. 배포 파이프라인의 IAM role 에는 RDS 스냅샷 권한이 없어 자동화돼 있지 않다 —
      사람이 콘솔에서 직접 눌러야 한다.
- [ ] **공개 대회 경기가 있는지 확인한다.** Stage B 의 verify 는 공개 API 가 노출하는 경기가
      0건이면 실패하고, M11 이후라 코드 변경 없이는 우회할 수 없다. 전환 직전에 공개 대회·
      공개 대진표가 최소 하나 있는지 사이트에서 확인한다(리허설 덤프 기준 공개 경기 32건).
- [ ] **PITR 보존 기간을 확인한다.** RDS 콘솔의 인스턴스 상세 → "백업" 탭에서 자동 백업
      보존 기간(2026-09-27 확인 시점 7일)을 확인한다. 짧아졌다면 복구 가능 시간창도
      그만큼 좁아진다는 뜻이니 전환 일정을 다시 검토한다.
- [ ] **점검 공지를 낸다.** 이 전환에는 점검 페이지가 없다(아래 "알려진 한계" 참고) — 사용자가
      API 오류 화면을 그대로 보게 되므로, 사내 공지·상태 페이지 등으로 미리 알린다.
- [ ] **두 승인을 연속으로 처리할 담당자를 확정한다.** Stage A 승인과 Stage B 승인 사이의
      대기 시간이 곧 서비스 중단 시간이다 — 같은 사람이 이어서 처리할 수 있는 시간대를 잡는다.
- [ ] **Stage A 와 Stage B 는 반드시 같은 커밋(같은 `main` SHA)에 대해 실행한다.** 아래
      "금지 사항"의 첫 항목이기도 하다 — 사이에 다른 커밋이 `main` 에 들어가면 안 된다.

## 실행 순서

### 1. 승격 PR 머지

사용자가 GitHub 에서 `dev → main` 승격 PR 을 직접 머지한다(에이전트는 이 단계를 대신
실행하지 않는다 — CLAUDE.md 브랜치 정책). 머지 즉시 `main` push 로 `deploy.yml` 이 자동
트리거된다.

### 2. push 로 시작된 배포는 승인하지 말고 취소한다

`main` push 는 `workflow_dispatch` 가 아니므로 `task168_stage` 는 무조건 `none`(보통 배포
경로)으로 고정된다(`resolve-task168-stage.sh`). 이 경로를 그대로 승인하면:

- `assert_task168_m11_guard` 가 "candidate 소스에 M11 마이그레이션이 있는데 prod 원장에는
  아직 적용 기록이 없다"며 **안전하게 거부**하고 이전 릴리스로 복원한다(`restore_active_release`).
- 즉 승인해도 데이터는 바뀌지 않고 옛 버전 그대로 유지된다 — 사고는 아니다.
- 다만 이미지 pull·컨테이너 재기동·복원까지 몇 분을 그냥 쓰게 되고, 다음 단계(Stage A
  dispatch)가 같은 `deploy-production` concurrency 그룹에 큐잉돼 있으면 불필요하게 지연된다.

그러니 GitHub Actions 화면에서 이 실행의 "Deploy" job 승인 대기를 보면 **승인하지 말고
"Cancel workflow" 로 취소**한다.

### 3. Stage A dispatch

Actions → `deploy.yml` → "Run workflow" → 아래 입력으로 수동 실행(`workflow_dispatch`):

| 입력 | 값 |
|---|---|
| `task168_stage` | `stageA` |
| `task168_rehearsal_evidence` | 사전 준비 체크리스트에서 준비해 둔 문구 |

`build-images` job 이 API/웹 이미지 + **전환 도구 이미지**(cutover tool, `task168-cutover-tool`
타깃)까지 빌드한다 — 평소보다 이미지 빌드가 조금 더 걸린다(로컬 실측 73초 추가).

### 4. Stage A 승인

`deploy` job 이 `environment: production` 승인 대기에 들어간다. 승인하면 EC2 에서
`deploy-prod.sh` 가 다음을 순서대로 한다(모두 `deploy/prod-task168.sh` 의 `task168_stage_a`):

1. API·워커 컨테이너 정지(quiesce) — **여기서부터 API 오류 화면 구간 시작**.
2. `pg_dump` 로 전체 DB 백업(호스트 상태 디렉터리에 0600 으로 저장, 복원 가능 여부까지
   `pg_restore --list` 로 검증).
3. 사전 마이그레이션(M1~M10 중 일부) 적용.
4. 전환 도구(cutover tool) 실행 — 레거시 데이터를 canonical 테이블로 변환하고 "seal"(전환이
   끝났다는 트리거·카운트 조건)을 건다.
5. 나머지 사전 마이그레이션 적용, 최종 원장 상태 확인.
6. `transition.json` 영수증 기록.

**Stage A 는 API·워커를 다시 올리지 않는다** — 의도된 동작이다(중간에 옛 버전을 다시 띄우지
않고 Stage B 로 바로 이어간다는 C2 결정). 이 시점에 API 는 계속 꺼진 상태다. 그래서:

- 워크플로의 `Health check` 스텝은 Stage A 에서 **건너뛴다**(`task168Stage != 'stageA'`) — API 가
  꺼진 채라 돌려 봐야 12회 재시도 끝에 실패하고 같은 `deploy-production` 큐의 Stage B 만
  그만큼 기다리게 된다. Stage A 성공 판정은 `Run deploy-prod.sh` 스텝 성공 + 아래 5번의 로그 줄이다.
- Stage A 는 nginx 공개 헤더(`X-Teameet-Release/Commit`) 파일을 **쓰지 않는다** — 승격되지 않는
  SHA 가 A~B 사이 nginx 재시작으로 공개 헤더에 실리면 Stage B 빌드의
  `resolve-prod-rollback-base.sh` 가 "퍼블릭 SHA 불일치"로 거부하기 때문이다.
- **A~B 사이 재부팅·docker 재시작 주의**: `v1_api`·`v1_game_operations_worker` 는
  `restart: always` 라 호스트 재부팅이나 docker 데몬 재시작이 옛 API·워커를 다시 띄운다.
  Stage B 는 진입할 때마다 두 서비스를 다시 멈추고 멈췄는지 확인한 뒤에만 DB 에 손대므로
  (정지 실패면 migrate 없이 거부) 사고로 이어지지는 않지만, 그 사이 옛 API 가 쓰기를 받았을 수
  있다 — 재부팅이 있었다면 Stage B 전에 사용자에게 보고한다.

### 5. Stage A 확인

"단계별 확인 방법" 절 참고. GitHub Actions 로그의 마지막 줄이
`Task168 Stage A complete for <sha> — ... Deploy the Stage B manifest next.` 인지 확인한다.

### 6. Stage B dispatch (같은 커밋으로)

**Stage A 와 반드시 같은 `main` 커밋**에 대해 `workflow_dispatch` 를 다시 실행한다 — 다른
브랜치·다른 커밋을 고르지 않는다(Stage B 는 Stage A 가 남긴 `transition.json` 의 `releaseSha`
와 이번 실행의 `release.sha` 가 일치하는지 직접 대조하고 다르면 거부한다).

| 입력 | 값 |
|---|---|
| `task168_stage` | `stageB` |
| `task168_rehearsal_evidence` | Stage A 때와 같은 문구(달라도 동작엔 문제 없지만 감사 기록
  일관성을 위해 같게 유지한다) |

### 7. Stage B 승인

승인하면 `task168_stage_b` 가 다음을 한다:

1. Stage A 의 `transition.json` 영수증을 찾아 바인딩(release/DB/이미지 일치) 검증.
2. API·워커를 **다시** 정지하고 정지됐는지 확인(재부팅 등으로 다시 떴을 수 있다). 정지 실패면
   migrate 없이 거부.
3. `prisma migrate deploy` 한 번으로 M11(레거시 테이블 5개를 실제로 `DROP`) **과 그 뒤의
   migration 전부**를 적용 — **여기서부터 되돌리기 불가**(아래 "복구" 절).
4. 원장 **전체** 검사 — 미해결(실패·진행 중) 행 0 이고 소스의 모든 migration 이 적용됐을 때만
   통과. 하나라도 어긋나면 영수증 없이 거부한다(그대로 두면 다음 일반 배포가 P3009 로 막힌다).
5. `migration-stage.json` 영수증 기록 → 시상자(award recipient) 백필 CLI 실행.
6. 이 시점부터 `deploy-prod.sh` 의 **일반 배포 흐름과 합류**한다: 새 이미지로 API·웹·워커를
   다시 올리고(`compose up -d`), nginx 를 force-recreate 하고, 헬스체크를 기다린다 — **여기서
   API 오류 화면 구간이 끝난다.**
7. `task168_verify` — DB 행이 아니라 **공개 API 가 스스로 노출하는 것**만 검증한다: 공개 대회
   목록(끝 페이지까지) → 각 대회 상세 200 → 그 대회 공개 일정(`/tournaments/:id/schedule`,
   끝 페이지까지)이 내보내는 경기마다 상세 200. 준비 중·대진 비공개 대회는 API 가 경기를
   내보내지 않으므로 검사 대상이 아니다. 공개 경기가 **0건이면 실패**다(리허설한 prod 덤프에
   공개 대회 2개·공개 경기 32건이 있었다). 결과는 `runtime-verification.json`
   (`tournamentCount`·`publicMatchCount` 포함).
8. 전부 통과하면 이 릴리스가 "active"로 승격된다(`promote_candidate_manifest`).

### 8. Stage B 확인

"단계별 확인 방법"·"부록 B" 참고.

### 9. 승격 뒤 — 대진 제목 라운드 키 백필 (dry-run → 사용자 승인 → apply)

리그 대진 생성기와 어드민 수동 대진은 팀매치 제목을 `대회명 · league_r1 3`·`대회명 · semi 1` 처럼
라운드 키 원값으로 저장해 왔다. #1459 부터 새 제목은 화면 이름(`조별리그 1라운드`·`4강`)으로, #1502 부터는
조 이름까지 붙은 `competitionMatchLabel` 이름(`A조 · 조별리그 1라운드`)으로 저장되지만, 이미 저장된 행은 팀 일정·채팅방 제목에 원값 그대로 보인다.
`scripts/qa/backfill-round-key-titles.sql` 이 그 행만 고친다.

- **언제**: #1459 가 들어간 `main` 이 배포되고 8번까지 끝난 뒤. A~B 구간에는 돌리지 않는다
  ("금지 사항"의 수동 SQL 금지는 그 구간 이야기다).
- **무엇을**: 대회 상세(`v1_tournament_match_details`)가 붙은 `v1_team_matches.title`, 그 팀매치에
  연결된 `v1_team_schedules.title` 중 두 모양만 바꾼다. ① `league_r[0-9]+` → `조별리그 N라운드`(제목 어디든)
  ② 제목 끝의 ` · <단계 키> <번호>` → ` · <단계 이름> <번호>`(group 조별리그 · quarter 8강 · semi·semifinal 4강 ·
  final 결승 · third_place 3·4위전, 대소문자 무시). 단계 키는 끝자리만 보므로 대회명 안의 같은 단어는
  그대로다. 일정은 `version` 도 올린다. 채팅방 제목은 저장값이 아니고, 알림·채팅 공유 카드·감사 로그는
  이미 나간 기록이라 두지 않는다.
- **안전장치**: dry-run 이 기본이고 읽기 전용 트랜잭션이다. `apply=1` 이어도 한 트랜잭션이고, 변환식
  자체 검사([1])가 틀리거나 적용 뒤 대상이 남으면 롤백한다. 다시 돌리면 0건이다.
- **alpha 와 다른 점**: alpha 는 `scripts/qa/backfill-round-key-titles-alpha.sh` 로 돌리고, 그 스크립트는
  prod 를 고를 수 없다. prod 는 부록 B 와 같은 경로(SSM → EC2 → `postgres:16-alpine` 의 psql → RDS)로
  같은 SQL 을 보낸다.

1. **dry-run.** 로컬에서 SQL 을 base64 로 싣고 `APPLY=0` 으로 보낸다. `<PROD_EC2_INSTANCE_ID>` 등
   자리표시자는 부록 B 와 같다.

   ```bash
   APPLY=0   # 사용자 승인 뒤에만 1
   SQL_B64="$(base64 < scripts/qa/backfill-round-key-titles.sql | tr -d '\n')"
   REMOTE="$(cat <<REMOTE
   set -Eeuo pipefail
   V1_API_IMAGE="\$(sudo jq -er '.active.images.api.uri' <PROD_RELEASE_STATE_FILE>)"
   V1_WEB_IMAGE="\$(sudo jq -er '.active.images.web.uri' <PROD_RELEASE_STATE_FILE>)"
   export V1_API_IMAGE V1_WEB_IMAGE
   compose=(sudo --preserve-env=V1_API_IMAGE,V1_WEB_IMAGE docker compose --project-name deploy
     -f <PROD_LIVE_DIR>/deploy/docker-compose.prod.yml --env-file <PROD_LIVE_DIR>/deploy/.env)
   URL="\$("\${compose[@]}" run --rm --no-deps -T v1_api sh -c 'printf "%s" "\$DATABASE_URL"')"
   [[ -n "\${URL}" ]]
   SQL_FILE="\$(mktemp)"
   printf '%s' '${SQL_B64}' | base64 -d > "\${SQL_FILE}"
   sudo docker run --rm --network deploy_default --env-file /dev/stdin \
     -v "\${SQL_FILE}:/backfill.sql:ro" postgres:16-alpine \
     sh -c 'exec psql "\$DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -v apply=${APPLY} -f /backfill.sql' \
     < <(printf 'DATABASE_URL=%s\n' "\${URL}")
   rm -f "\${SQL_FILE}"
   REMOTE
   )"
   # shorthand(commands=[...]) 는 이스케이프를 망친다 — 항상 JSON 으로 넘긴다.
   aws ssm send-command --instance-ids <PROD_EC2_INSTANCE_ID> --document-name AWS-RunShellScript \
     --parameters "$(jq -nc --arg c "${REMOTE}" '{commands:[$c]}')" --query 'Command.CommandId' --output text
   # 끝나면 get-command-invocation 의 StandardOutputContent·StandardErrorContent 를 둘 다 본다.
   ```

2. **출력을 읽는다.** `[1] selftest_failures` 는 0 이어야 한다. `[2]` 가 바꿀 행 수(`kind` 가 `league_r`·`phase`
   로 나뉜다), `[3]` 은 바꾸지 않는 참고 수치다 — `team_matches_without_details` 가 0 이 아니면 대회 밖
   팀매치 제목에도 원값이 있다는 뜻이니 적용하지 말고 원인부터 본다. `phase_key_not_at_end` 는 사람이 고친
   제목이라 두는 것이다. `[4]` 의 전후 예시가 화면 이름인지 확인한다.
3. **사용자 승인.** dry-run 출력 전체를 그대로 보여 주고 승인받는다. 바뀌기 전 값은 라운드 키 원값이라
   되돌릴 일은 없다고 보지만, 승인 요청에 그 판단과 dry-run 출력 보관 위치를 함께 적는다.
4. **apply.** 같은 명령을 `APPLY=1` 로 보낸다. 출력의 `[5]` 에서 `updated` 가 `[2]` 와 같고
   `remaining` 이 0 이어야 한다. 그렇지 않으면 스크립트가 스스로 롤백하고 오류로 끝난다.
5. **재확인.** `APPLY=0` 으로 한 번 더 보내 `[2]` 가 0건인지 본다. 화면 확인은 저장된 제목을 그대로
   내보내는 응답으로 한다 — 참가 팀 멤버로 로그인한 `GET /api/v1/teams/:teamId/schedules` 의 `title`.
   공개 대회 API(`/tournaments/:id/schedule`·`/matches/:fixtureId`)는 제목이 아니라 라운드 값을 따로
   내보내므로 이 확인에 쓸 수 없다.

## 단계별 확인 방법

모든 확인은 **식별자(엔드포인트·인스턴스 ID 등)를 직접 적지 않고** 이미 등록된 GitHub
Actions 변수/시크릿 이름이나 `.env` 키 이름으로만 가리킨다 — 이 저장소는 PUBLIC 이다.

- **GitHub Actions 로그**: 각 단계가 남기는 마지막 줄이 위 "실행 순서"에 적힌 문구와
  정확히 일치하는지 본다. 다르면 다음 "실패 대응표"를 본다.
- **공개 헬스 API**: 배포 스크립트가 스스로 확인하는 것과 같은 엔드포인트 —
  `GET /api/v1/health` 의 `data.checks.db == true`, `/landing` 200, `/v1/home` 308.
  운영자가 직접 재확인하려면 SSM 으로 EC2 안에서 `curl -fsS http://localhost:8121/api/v1/health`
  (부록 B 참고).
- **원장(migration ledger) 상태**: 부록 B 의 쿼리로 `_prisma_migrations` 에 미해결
  행(진행 중이거나 실패한 행)이 0인지, M11 이 `finished_at` 있고 `rolled_back_at` 없는
  한 행으로 존재하는지 확인한다.
- **전환 seal(트리거) 상태**: Stage A 완료 뒤에는 5개 트리거가 걸려 있어야 하고(`5|5|3`),
  Stage B 완료(M11 적용) 뒤에는 레거시 테이블 자체가 없어서 그 쿼리가 더 이상 쓰이지 않는다 —
  대신 부록 B 의 "M11 이후" 쿼리를 쓴다.
- **공개 API 응답으로 판정**: `task168_verify` 가 이미 하는 것과 같은 방식 — 커맨드 응답이
  아니라 `GET /api/v1/tournaments`(비인증) 로 대회 목록 전체를 페이지네이션해 각 `id` 에 대해
  `GET /api/v1/tournaments/:id`, 그 대회의 `GET /api/v1/tournaments/:id/schedule` 이 내보내는
  경기마다 `GET /api/v1/tournaments/:id/matches/:fixtureId` 가 200 인지 직접 찍어 본다. 이번
  리허설 기준으로는 공개 경기 32건이 전부 200 이어야 한다(레거시 fixture 32건이 canonical 로
  변환된 수).
- **핵심 테이블 행 수 불변**: 전환 전후 `v1_games`·`v1_team_matches` 등 핵심 테이블의
  행 수를 비교한다 — Stage B 리허설 기준 `v1_team_matches` 는 `+32`(레거시 fixture 가
  canonical 로 변환된 만큼 늘어나는 것이 정상, canonicalGameCount 증가), 그 외 사용자 데이터
  테이블(경기 신청·리뷰 등)은 그대로여야 한다.

## 실패 대응표

각 행은 실제 에러 메시지 문자열(코드에서 grep 으로 확인한 그대로), 그 시점에 남는 상태,
그리고 해야 할 일이다. "재실행 안전" = 같은 Stage 를 그대로 다시 dispatch 해도 되는지를 뜻한다.

| 단계 | 에러 메시지(요지) | 남는 상태 | 재실행 안전? | 할 일 |
|---|---|---|---|---|
| dispatch 입력 검증 (build-images, DB 미접촉) | `task168_rehearsal_evidence is required for stageA` / `must not contain control characters` / `Unknown task168_stage` | 아무 것도 안 바뀜 | 예 | 입력값 고쳐서 재dispatch. |
| deploy-prod.sh 시작 직후 | `Task168 ${stage} requires an existing active release (had_active=false)` | 아무 것도 안 바뀜(첫 배포 이전 상태에서만 발생, 지금 prod 는 `state.json` 이 있어 실무에서는 안 나올 가능성이 높다) | 해당 없음 | 이 에러가 나오면 `state.json` 자체가 없다는 뜻 — Stage A/B 이전에 먼저 일반 배포로 `state.json` 을 만들어야 한다. 이 문서 범위 밖의 별도 판단이 필요하니 진행 전 사용자에게 보고. |
| Stage A 시작, 원장/seal 상태 판정 | `Stage A refuses: prod ledger/seal state is not a recognized Stage A state` | API·워커 정지 안 됨(quiesce 이전에 거부) | 아니오 | 자동 복구 대상이 아니다. DB 원장을 부록 B 쿼리로 직접 읽어 어떤 상태인지(다른 브랜치의 마이그레이션이 섞였는지 등) 사람이 판단한다. |
| Stage A/B quiesce(정지 확인) | `compose stop failed` / `writers did not quiesce` | API·워커가 일부만 내려갔을 수 있음. DB 는 이 시도에서 아직 안 건드림 | 예 | 컨테이너 상태를 확인하고 같은 Stage 재dispatch(매 진입마다 다시 정지·확인한다). |
| Stage A backup | `pg_dump failed` / `backup file is empty` / `backup archive failed pg_restore --list verification` | quiesce 는 끝났고 API 는 내려간 채, 백업은 없음 | 예 | 디스크 여유·DB 접속을 확인하고 Stage A 재dispatch — `_receipt_reusable` 가 quiesce 영수증은 재사용하고 backup 부터 다시 시도한다. |
| Stage A 사전·사후 마이그레이션(`prisma migrate deploy`) | prisma 오류 출력(`migrate deploy` 실패) / `pre-cutover ledger does not match the expected M1..M8,M10 set` | M1~M10 중 일부만 적용됐거나 실패 행(`finished_at IS NULL`)이 남았을 수 있음. API 는 내려간 채 | **아니오 — 수동 개입 + 사용자 승인** | 재dispatch 해도 러너가 거부한다(실패 행이 있으면 `stuck or self-contradictory`, M1~M10 부분 적용이면 `not a recognized Stage A state`). ① 부록 B 1)로 미해결 행과 M1~M10 적용 상태를 조회 ② 실패한 migration 과 원인(로그의 prisma 오류) 식별 ③ 그 migration 이 부분 적용되지 않았음을 확인한 뒤 `prisma migrate resolve --rolled-back <이름>` 을 할지, 러너 백업(층 1)으로 복원할지는 **사용자 승인 후** 실행 ④ 원장이 인식되는 상태로 돌아온 뒤 Stage A 재dispatch. |
| Stage A 전환 도구(cutover tool) | `cutover tool failed (exit N) and no seals are present -- refusing` | seal 이 안 걸림(`0\|0\|0`), 실패한 리포트는 다음 재시도에서 자동 보관(archive) 됨 | 예 | Stage A 재dispatch. seal 이 이미 `5\|5\|3` 이면 코드 스스로 "seals are already committed -- continuing" 으로 통과시키므로 중복 실행 걱정은 없다. |
| Stage A 최종 확인 | `post-M9 ledger does not match the expected M1..M10 set` / `cutover seals or zero-legacy-link counts are not exact` | 전환 도구는 성공(seal `5\|5\|3`), 확인만 실패 | 실패 행이 없을 때만 예 | 부록 B 1)로 미해결 행이 0인지 먼저 확인한다. 0이면 Stage A 재dispatch — `committed` 상태로 재진입해 사후 마이그레이션부터 이어간다. 실패 행이 있으면 위 행과 같은 수동 절차(사용자 승인). |
| Stage A 전체 실패(ERR trap) | `Candidate failed during Task168 stageA -- refusing to restart the previous release's images against a possibly partially migrated database` | `activation-stage.json`(stage=stageA) 기록, **API·워커는 계속 내려간 채로 유지**(옛 버전도 새 버전도 안 뜸) | 예(위 개별 단계 항목 참고) | 위 표에서 실제 실패 지점을 찾아 원인 조치 후 Stage A 재dispatch. 옛 버전으로 자동 복구되지 않는다는 점이 일반 배포와 다르다 — DB 가 부분적으로 바뀌었을 수 있는 상태에서 옛 코드를 올리는 것 자체가 위험하기 때문(의도된 설계). |
| Stage B 시작, 영수증 조회 | `no unique Stage A transition receipt for this database` / `transition receipt's releaseSha does not match this manifest` / `manifest migration checksums do not match the Stage A transition receipt` | 아무 것도 안 바뀜 | 아니오(그 상태로는) | Stage A 를 같은 커밋으로 다시 완료했는지, Stage B 를 **다른 커밋**으로 잘못 dispatch 하지 않았는지 확인. 원인 없이 재시도하지 않는다. |
| Stage B 사전 이름셋 확인 | `Stage B refuses: prod ledger is not exactly the Stage A M1..M10 set` | 아무 것도 안 바뀜 | 아니오 | Stage A~B 사이에 다른 배포가 끼어들어 원장이 바뀌었을 가능성 — 사람이 원장을 직접 읽고 판단(아래 "금지 사항" 위반이 있었는지부터 확인). |
| Stage B 마이그레이션(M11 과 그 뒤 migration 전부) | `Stage B prisma migrate deploy failed (M11 or a migration after it)` / `Stage B refuses: the migration ledger is not fully applied` | 어느 migration 이 실패했는지는 원장을 봐야 안다. M11 자체가 실패했으면 스키마는 그대로(seal `5\|5\|3`). **M11 은 커밋되고 그 뒤 migration 이 실패했으면 레거시 테이블은 이미 DROP 됨(되돌릴 수 없음)** 이고 실패 행이 남아 Prisma 가 P3009 상태 — 다음 일반 배포도 막힌다. `migration-stage.json` 은 쓰이지 않는다 | **아니오 — 수동 개입 + 사용자 승인** | 실패 행이 남은 채 재dispatch 하면 러너가 거부한다(`stuck or self-contradictory` 또는 P3009). ① 부록 B 1)·2)로 미해결 행과 M11 상태 조회 ② 실패한 migration 과 원인 식별 ③ 부분 적용이 없음을 확인한 뒤 `prisma migrate resolve --rolled-back <이름>`(또는 PITR 복원) 여부를 **사용자 승인 후** 실행 ④ Stage B 재dispatch — `m11-entry.json` 이 이번 실행의 M11 임을 증명하면 멱등 `migrate deploy` 를 다시 돌려 남은 migration 을 적용하고, 원장 전체 검사를 통과해야만 영수증을 쓴다. |
| Stage B 활성화(컨테이너 재기동~헬스체크) | `wait_for_prod_health_contract` 계열 실패(로그에 `Health contract failed`) | **M11 은 이미 커밋됨**(되돌릴 수 없음), 새 컨테이너가 못 뜨거나 헬스체크 미통과 | 예 | Stage B 재dispatch — `migration-stage.json` 이 있으므로 마이그레이션은 건너뛰고 컨테이너 기동부터 재시도한다. 옛 버전으로 자동 복구되지 않는다(위와 같은 이유). |
| Stage B verify(공개 API 검증) | 로그에 `tournament detail non-200` / `match detail non-200` / `zero public matches` / `request failed` 등, `task168_verify` 가 0 이 아님 | **컨테이너는 이미 새 버전으로 떠서 정상 서비스 중**(헬스체크는 통과한 뒤라서), 다만 이 릴리스는 아직 "active"로 승격되지 않음(`state.json` 은 옛 릴리스를 가리킨 채). `runtime-verification.json` 에 status=FAILED 로 남는다 | 예 | 실패한 대회/경기 ID 를 로그에서 찾아 원인 조사. `zero public matches` 는 공개 대회·경기가 실제로 없어졌는지(운영 판단)부터 확인. Stage B 재dispatch 하면 `migration-stage.json` 재사용으로 마이그레이션은 건너뛰고 verify 부터 재실행한다. |
| 전체 공통 | `Another prod deployment is active` | `flock` 이 잡혀 있음 — 다른 배포가 진행 중이거나 이전 실행이 비정상 종료해 락이 안 풀렸을 수 있음 | 상황에 따라 다름 | 진짜 동시 배포가 있는지부터 확인(GitHub Actions 실행 목록). 없다면 EC2 호스트에서 락 파일 상태를 사람이 직접 확인 — 함부로 지우지 않는다. |

## 복구 (PITR·백업 복원)

Task168 러너 자체는 이미지 롤백 도구가 아니라 **DB 전환 도구**다 — 실패했을 때 "이전
릴리스로 자동 복원"하지 않는 이유는 위 실패 대응표에 적은 대로, DB 가 이미 부분적으로 바뀌어
있을 수 있는 상태에서 옛 코드를 올리는 것 자체가 더 위험하기 때문이다(의도된 설계 —
`deploy-prod.sh` 의 `restore_on_failure()` 주석 참고). 복구는 두 층으로 나뉜다.

### 층 1 — 러너 자체 백업(`pg_dump`)으로 복원

Stage A 가 뜬 백업(`backup.dump`, `pg_restore -Fc` 형식)은 EC2 호스트의 상태 디렉터리
(`${PROD_RELEASE_STATE_DIR}` — 실제 값은 `.env`/GitHub Actions 변수로만 관리, 이 문서에는
값을 적지 않는다)에 0600 권한으로 남는다. Stage A 시작 **직전** 시점의 전체 DB 상태다.

1. 복원 대상 DB(운영 중인 RDS 인스턴스가 아니라 **새로 만든 인스턴스 또는 별도 DB**)를 준비한다.
   운영 중인 인스턴스에 그대로 덮어쓰지 않는다.
2. 승인된 복원 대상의 libpq service 설정과 비밀번호 파일(0600)을 준비한다. 운영 DB 연결이 아닌지
   확인한 뒤 `PGSERVICE=task168_restore pg_restore --clean --if-exists backup.dump`를 실행한다.
   접속 URL·비밀번호를 `-d` 등 명령줄 인자로 넘기거나 로그에 출력하지 않는다.
3. 애플리케이션이 그 DB 를 가리키도록 하기 전에 반드시 부록 B 의 원장 쿼리로 원장 상태가
   Stage A 시작 전과 같은지 확인한다.
4. 이 복원·전환은 **직접 사용자 승인** 후에만 실행한다(alpha-data-writes-need-user-approval
   원칙과 동일 — 대상이 prod 여도 예외 없음).

### 층 2 — RDS PITR(Point-In-Time Recovery)

`pg_dump` 백업이 없거나 더 이전 시점으로 되돌려야 할 때 쓴다. RDS 자동 백업의 보존 기간은
2026-09-27 확인 시점 **7일**이다 — 그보다 오래된 시점으로는 못 돌아간다.

1. AWS 콘솔 → RDS → 대상 인스턴스 → "작업(Actions)" → "특정 시점으로 복원(Restore to point
   in time)". quiesce 영수증(`quiesce.json`)에 기록된 시각 **직전**을 목표 시각으로 고른다 —
   실제 복원 가능 시간창 안에서 **Stage A의 첫 DB 변경보다 앞선 시점**을 확정한다.
   API·워커가 멈춰도 마이그레이션과 전환 도구는 DB를 변경하므로, quiesce 이후의 임의 시각은
   안전한 복원 시점으로 간주하지 않는다. 복원한 원장·스키마·행 수를 검증한 후 연결을 바꾼다.
2. 복원은 **새 인스턴스**로 생성된다(원본을 덮어쓰지 않음) — 엔드포인트가 바뀐다.
3. 애플리케이션을 그 새 인스턴스로 돌리기 전에 부록 B 쿼리로 원장·핵심 테이블 행 수를 확인한다.
4. 확인 후 `.env` 의 DB 접속 정보(`V1_DB_HOST` 등 키 이름)를 새 인스턴스로 갱신 — 이 문서엔
   실제 엔드포인트 값을 적지 않는다.
5. 이 전환도 직접 사용자 승인 후에만 실행한다.

### 이전 릴리스 재배포가 막히는 조건

`assert_task168_m11_restore_target_safe()` 는 다음 세 조건이 **모두 참이면** 롤백/복원 대상을
거부한다:

1. Task168 Stage A 전환 영수증(`transition.json`)이 이 환경에 존재한다(없으면 애초에 이
   가드 자체가 발동하지 않는다 — M11 을 겪은 적 없는 환경).
2. 마이그레이션 원장에 M11 이 완료(finished, 롤백 아님) 행으로 있다.
3. **롤백/복원 대상 릴리스 자신의 저장된 소스 트리에 M11 마이그레이션 폴더가 없다** — 즉
   M11 이전 코드로 되돌리려는 시도.

1·2·3 이 전부 참이면 거부되고, 원장 조회 자체가 실패해도 (fail-closed) 거부된다. 이 셋 중
하나라도 거짓이면(예: 되돌릴 대상이 이미 M11 이후 코드라면) 허용된다 — M11 이후로 롤백하는
것은 안전하기 때문이다.

## 금지 사항

- **Stage A 완료 후 ~ Stage B 완료 전 구간에는 일반 배포(`task168_stage=none`)를 하지
  않는다.** Stage A 는 API 를 내린 채로 끝나므로 이 구간에 다른 배포를 끼워 넣을 이유가
  없고, 끼워 넣으면 Stage B 의 "원장이 정확히 Stage A 의 M1..M10 세트인지" 검사가 깨져
  Stage B 가 통째로 거부되거나(안전하게 멈춤), 최악의 경우 검증되지 않은 경로로 원장이
  바뀔 수 있다.
- **DB 에 수동 SQL 을 직접 실행하지 않는다.** 원장·seal·레거시 테이블 상태를 "직접 고쳐서"
  다음 단계를 통과시키려 하지 않는다 — 이 런너의 모든 단계는 원장/seal 의 정확한 조합을
  기준으로 재개 여부를 판단하므로, 수동 SQL 은 그 판단 근거 자체를 오염시킨다. 문제가
  있으면 이 문서의 실패 대응표를 따르거나 사용자에게 에스컬레이션한다.
- **영수증 파일(`quiesce.json`·`backup.json`·`transition.json`·`m11-entry.json`·
  `migration-stage.json`·`runtime-verification.json`·`activation-stage.json`)을 지우거나
  손으로 고치지 않는다.** 이 러너의 재개 로직은 영수증 내용과 실제 DB 상태를 대조해서
  "이 시도가 이전 시도와 같은 release/DB/이미지인가"를 판단한다 — 영수증을 지우면 이미
  끝난 위험한 단계(전환 도구, M11 마이그레이션)를 다시 실행하려 들 수 있다.
- **Stage B 를 Stage A 와 다른 커밋으로 dispatch 하지 않는다.** `transition.json` 의
  `releaseSha` 대조에서 자동으로 걸리긴 하지만, 애초에 시도하지 않는다.
- **롤백(`git revert`·이전 릴리스 재배포)을 사용자 검수 없이 실행하지 않는다.** 전역
  규칙(롤백은 사용자 게이트)이 이 전환에도 그대로 적용된다 — 특히 M11 이후에는 이미지
  롤백 자체가 위험하므로 더더욱.

## 알려진 한계

- **점검 페이지가 없다.** Stage A~B 사이 API 오류 구간에 사용자는 우리가 만든 안내 화면이
  아니라 일반적인 API 오류(502/503 등)를 그대로 본다. `docs/ops/maintenance-mode.md` 의
  ALB 고정응답 점검 페이지는 이 전환 절차에 아직 연결돼 있지 않다 — 필요하면 이 문서 범위
  밖의 별도 UI 작업(3안 브레인스토밍 절차 포함)으로 처리한다.
- **호스트의 `sudo docker ... --env-file <(...)` 는 동작하지 않는다(2026-09-27 SSM 실측).**
  `sudo` 가 프로세스 치환 파일서술자를 exec 전에 닫아버려("open /dev/fd/N: no such file or
  directory") 실패한다. 이 브랜치의 모든 러너·기존 M11 가드는 `--env-file /dev/stdin` +
  전체 명령의 표준입력을 리다이렉트하는 패턴으로 고쳐져 있다 — 이 수정이 없었다면 승격 후
  **모든** 배포(Task168 여부와 무관하게)가 M11 가드에서 막혔을 것이다. 향후 이 계열 코드를
  건드릴 때 `<(...)` 프로세스 치환 패턴을 다시 쓰지 않도록 주의한다.
- **Stage B 활성화 실패에는 자동 재시도 진입점이 하나뿐이다.** "Stage B 재dispatch" 가
  유일한 복구 경로이고, 실패 지점별로 세밀하게 재개하는 것이 아니라 `migration-stage.json`
  유무로만 "마이그레이션을 건너뛸지"를 판단한다 — 실패 대응표 이상의 세밀한 자동 복구는
  없다.
- **Stage B 이후 일반 배포 실패의 자동 복구는 DB 조회 성공에 의존한다.** 복원 대상 가드
  (`assert_task168_m11_restore_target_safe`)가 원장을 읽어야 옛 릴리스로의 자동 복구를 허용하므로,
  DB 장애가 배포 실패의 원인이면 자동 복구도 거부된다(fail-closed) — 그때는 수동 개입이다.
- **verify 실패는 승격을 막을 뿐 서비스를 막지는 않는다.** 위 실패 대응표에 적은 대로,
  verify 가 실패해도 새 버전 컨테이너는 이미 떠서 정상 응답 중이다 — 다만 `state.json`
  의 "active" 포인터가 갱신되지 않은 채로 남으므로, 이 상태에서 또 다른 배포를 진행하면
  `previousSha` 계산이 실제 배포된 버전과 어긋날 수 있다. verify 를 통과시키고 나서 다음
  배포를 진행한다.

## 부록 A — 영수증(receipt) 파일 위치

모든 영수증(receipt — "이 단계를 완료했다"는 증거로 남기는 작은 JSON 파일)은 이 경로
아래에 릴리스별로 쌓인다(값 자체는 GitHub Actions 변수/`.env` 로만 관리, 실제 절대경로는
적지 않는다):

```
${PROD_RELEASE_STATE_DIR}/task168/<release-sha>/
├── quiesce.json              # API·워커 정지 완료
├── backup.json               # pg_dump 백업 완료(+ backup.dump 본체)
├── backup.dump                # 실제 백업 파일 (0600)
├── report/cutover-report.json # 전환 도구(cutover tool) 실행 결과
├── transition.json           # Stage A 완료 종합 영수증(Stage B 가 이걸로 검증)
├── m11-entry.json            # M11 마이그레이션 실행 "직전" 기록(status: ENTERED)
├── migration-stage.json      # M11 커밋 완료(status: MIGRATION_COMMITTED)
├── runtime-verification.json # Stage B verify 결과(성공/실패 모두 기록, 매 실행마다 덮어씀)
└── activation-stage.json     # Stage A/B 활성화 단계 실패 시에만 생김(어느 stage에서 실패했는지)
```

| 파일 | `kind` | 언제 생기나 | 재사용(idempotent) 가능? |
|---|---|---|---|
| `quiesce.json` | `quiesce` | Stage A, 정지 확인 직후 | 같은 release/DB/이미지면 재사용 |
| `backup.json` | `backup` | Stage A, 백업 검증 통과 후 | 같은 release/DB/이미지 + 파일 해시 일치 시 재사용 |
| `cutover-report.json` | (전환 도구 자체 포맷) | Stage A, 전환 도구 실행 후(성공·실패 모두) | seal 이 `0\|0\|0` 이고 실패 상태일 때만 archive 후 재시도 |
| `transition.json` | `transition` | Stage A 전체 완료 시 | Stage B 가 읽기 전용으로 검증만 함 |
| `m11-entry.json` | `m11Entry` | Stage B, M11 실행 직전 | 같은 release/DB/이미지면 재사용(마이그레이션은 다시 실행하되 진입 기록은 유지) |
| `migration-stage.json` | `migrationStage` | Stage B, M11 커밋 후 | 있으면 마이그레이션 자체를 건너뛴다 — 가장 중요한 재개 신호 |
| `runtime-verification.json` | `runtimeVerification` | Stage B, verify 실행 후(매번) | 덮어씀(과거 실패 기록을 유지하지 않음) |
| `activation-stage.json` | `activationStage` | Stage A/B 활성화 실패 시 | 덮어씀, `stage` 필드로 어느 단계였는지 구분 |

## 부록 B — 완료 후 확인 쿼리·명령

DB 는 직접 접속하지 않고 **SSM → EC2 → 컨테이너 안 `psql`(읽기 전용) → RDS** 경로로만
조회한다(`prod-db-readonly-via-ssm` 패턴 재사용). 아래 예시의 `<PROD_EC2_INSTANCE_ID>` 는
GitHub Actions 변수 `PROD_EC2_INSTANCE_ID` 이름을 가리키는 자리표시자이지 실제 값이 아니다.

```bash
aws ssm send-command --instance-ids <PROD_EC2_INSTANCE_ID> --document-name AWS-RunShellScript \
  --cli-input-json file://<json>   # Parameters.commands 안에서 아래 스크립트를 실행
```

EC2 안에서 실행할 내용. 러너·가드와 **같은 방식**으로 DB 에 붙는다 — API 컨테이너가 떠 있을
필요가 없고(A~B 구간에도 동작), DB 가 외부 RDS 여도 되며, `DATABASE_URL`(비밀번호 포함)이
어떤 명령줄 인자에도 실리지 않는다. `<PROD_LIVE_DIR>`·`<PROD_RELEASE_STATE_FILE>` 는
`deploy/prod-release-common.sh` 의 같은 이름 변수 값을 가리키는 자리표시자다.

```bash
set -Eeuo pipefail
# compose 가 v1_api 서비스를 해석하려면 이미지 변수가 필요하다 — 현재 active 매니페스트 값을 쓴다.
V1_API_IMAGE="$(sudo jq -er '.active.images.api.uri' <PROD_RELEASE_STATE_FILE>)"
V1_WEB_IMAGE="$(sudo jq -er '.active.images.web.uri' <PROD_RELEASE_STATE_FILE>)"
export V1_API_IMAGE V1_WEB_IMAGE
compose=(sudo --preserve-env=V1_API_IMAGE,V1_WEB_IMAGE docker compose --project-name deploy
  -f <PROD_LIVE_DIR>/deploy/docker-compose.prod.yml --env-file <PROD_LIVE_DIR>/deploy/.env)
URL="$("${compose[@]}" run --rm --no-deps -T v1_api sh -c 'printf "%s" "$DATABASE_URL"')"
[[ -n "${URL}" ]]
SQL_FILE="$(mktemp)"
cat > "${SQL_FILE}" <<'SQL'
SET default_transaction_read_only = on;

-- 1) 원장에 미해결(진행 중이거나 실패한) 행 — 0행이어야 정상. 있으면 그 이름이 실패한 migration
SELECT migration_name, started_at, left(logs, 300) AS logs FROM "_prisma_migrations"
WHERE finished_at IS NULL AND rolled_back_at IS NULL ORDER BY started_at;

-- 2) M11 이 정확한 체크섬으로 완료 상태인지(Stage B 완료 후)
SELECT checksum, finished_at, rolled_back_at FROM "_prisma_migrations"
WHERE migration_name = '20260911090000_retire_tournament_fixture_tables';
-- 기대값: checksum = 08eac7347cbb10fcc4ef87d31d63bd9516d5bfda281dcf5730c4f0a1985d9323,
--         finished_at 있음, rolled_back_at 없음(NULL)

-- 3) Stage A 완료 후 ~ Stage B 이전: 전환 seal(트리거) 상태 — "5|5|3|0|0|0" 이어야 정상
-- M11 이후에는 제거된 테이블을 조회하지 않는다(psql 조건 분기).
SELECT to_regclass('v1_tournament_fixtures') IS NOT NULL AS legacy_present \gset
\if :legacy_present
SELECT
  (SELECT count(*) FROM pg_trigger WHERE tgname='v1_tournament_fixture_retired_write' AND tgenabled='A') || '|' ||
  (SELECT count(*) FROM pg_trigger WHERE tgname='v1_tournament_fixture_retired_row_write' AND tgenabled='A') || '|' ||
  (SELECT count(*) FROM pg_trigger WHERE tgname='v1_000_tournament_fixture_retired_link' AND tgenabled='A') || '|' ||
  (SELECT count(*) FROM v1_games WHERE source_type::text='TOURNAMENT_FIXTURE' OR tournament_fixture_id IS NOT NULL) || '|' ||
  (SELECT count(*) FROM v1_tournament_staff_fixture_scopes WHERE fixture_id IS NOT NULL) || '|' ||
  (SELECT count(*) FROM v1_operation_audits WHERE fixture_id IS NOT NULL);
\endif

-- 4) Stage B 완료 후(M11 적용 후): 레거시 테이블·트리거가 실제로 사라졌는지 — "0|0" 이어야 정상
SELECT
  (SELECT count(*) FROM (VALUES ('v1_tournament_fixtures'),('v1_tournament_fixture_results'),
    ('v1_tournament_fixture_goals'),('v1_tournament_fixture_videos'),
    ('v1_tournament_fixture_advancement_edges')) AS legacy(name)
   WHERE to_regclass(legacy.name) IS NOT NULL) || '|' ||
  (SELECT count(*) FROM pg_trigger WHERE tgname='v1_000_tournament_fixture_retired_link' AND tgenabled='A');

-- 5) 핵심 테이블 행 수(전환 전후 비교용 — 전후 숫자를 각각 기록해 둔다)
SELECT count(*) FROM v1_team_matches;
SELECT count(*) FROM v1_games;
SQL
# --env-file /dev/stdin: `--env-file <(...)` 는 sudo 가 fd 를 닫아 prod 호스트에서 실패한다.
sudo docker run --rm --network deploy_default --env-file /dev/stdin \
  -v "${SQL_FILE}:/queries.sql:ro" postgres:16-alpine \
  sh -c 'exec psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f /queries.sql' \
  < <(printf 'DATABASE_URL=%s\n' "${URL}")
rm -f "${SQL_FILE}"
```

숫자 3·4번의 정확한 기대값은 위 SQL 주석에 이미 적혀 있다 — 다르면 "실패 대응표"의 해당
행을 본다. 5번은 Stage B 완료 후 `v1_team_matches` 행 수가 **레거시 fixture 가 canonical 로
변환된 만큼만** 늘어야 한다(정확한 증가분은 실제 프로덕션 대회 수에 따라 다르다 — 리허설
기준으로는 +32, 그 외 사용자 데이터 테이블은 변하지 않아야 한다).

공개 API 로 최종 확인(비인증, 인증 토큰 불필요):

```bash
curl -fsS https://teameet.co.kr/api/v1/health | jq -e '.data.checks.db == true'
curl -fsS 'https://teameet.co.kr/api/v1/tournaments?limit=50' | jq '.data.pageInfo'
# 위에서 얻은 각 대회 id 에 대해:
curl -o /dev/null -sw '%{http_code}\n' https://teameet.co.kr/api/v1/tournaments/<id>
curl -fsS 'https://teameet.co.kr/api/v1/tournaments/<id>/schedule?limit=100' |
  jq -r '.data.items[].fixtureId, .data.unscheduled[].fixtureId, .data.nextCursor'
# 각 fixtureId 에 대해:
curl -o /dev/null -sw '%{http_code}\n' https://teameet.co.kr/api/v1/tournaments/<id>/matches/<fixtureId>
```
