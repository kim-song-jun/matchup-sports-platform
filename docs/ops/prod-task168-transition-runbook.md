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

- [ ] **리허설 증거 문구를 미리 준비한다.** GitHub Actions 의 workflow_dispatch 입력
      `task168_rehearsal_evidence` 는 이 전환을 사전에 리허설했다는 증거를 담는 자유 텍스트다
      (예: `"task-6-report.md rehearsal 2026-09-27, drift 0, ledger clean"`). 빈 문자열이면
      Stage A/B 모두 거부된다(`resolve-task168-stage.sh`). 500자 안팎(정확히는 1500바이트)
      제한, 줄바꿈·탭 등 제어문자 금지 — 한 줄 문장으로 미리 준비해 둔다.
- [ ] **RDS 콘솔 수동 스냅샷 1회(선택이지만 권장).** 러너 자체도 `pg_dump` 백업을 뜨지만
      (아래 "복구" 절 참고), 그것과 별개로 AWS 콘솔에서 RDS 인스턴스의 수동 스냅샷을 한 번 더
      떠 둔다. 배포 파이프라인의 IAM role 에는 RDS 스냅샷 권한이 없어 자동화돼 있지 않다 —
      사람이 콘솔에서 직접 눌러야 한다.
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
않고 Stage B 로 바로 이어간다는 C2 결정). 이 시점에 API 는 계속 꺼진 상태다.

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
2. M11(레거시 테이블 5개를 실제로 `DROP` 하는 마이그레이션) 적용 — **여기서부터 되돌리기
   불가**(아래 "복구" 절).
3. 시상자(award recipient) 백필 CLI 실행.
4. `migration-stage.json` 영수증 기록 — 이 시점부터 `deploy-prod.sh` 의 **일반 배포 흐름과
   합류**한다: 새 이미지로 API·웹·워커 컨테이너를 다시 올리고(`compose up -d`), nginx 를
   force-recreate 하고, 헬스체크를 통과할 때까지 기다린다 — **여기서 API 오류 화면 구간이
   끝난다.**
5. 헬스체크 통과 후 `task168_verify` 실행 — 인증 없는 공개 API 로 대회 목록 전체 페이지네이션
   + 각 대회 상세 + 각 경기 상세를 호출해 전부 200 인지 확인(`runtime-verification.json` 기록).
6. 전부 통과하면 이 릴리스가 "active"로 승격된다(`promote_candidate_manifest`).

### 8. Stage B 확인

"단계별 확인 방법"·"부록 B" 참고.

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
  `GET /api/v1/tournaments/:id` 가 200 인지 직접 찍어 본다. 이번 리허설 기준으로는 대회 경기
  상세 32건이 전부 200 이어야 한다(레거시 fixture 32건이 canonical 로 변환된 수).
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
| Stage A quiesce | `compose stop failed` / `writers did not quiesce` | API·워커가 일부만 내려갔을 수 있음 | 예 | 컨테이너 상태를 확인하고 Stage A 재dispatch(재-quiesce는 매 시도마다 무조건 다시 함). |
| Stage A backup | `pg_dump failed` / `backup file is empty` / `backup archive failed pg_restore --list verification` | quiesce 는 끝났고 API 는 내려간 채, 백업은 없음 | 예 | 디스크 여유·DB 접속을 확인하고 Stage A 재dispatch — `_receipt_reusable` 가 quiesce 영수증은 재사용하고 backup 부터 다시 시도한다. |
| Stage A 사전 마이그레이션 | `pre-cutover ledger does not match the expected M1..M8,M10 set` | quiesce+backup 완료, 마이그레이션 일부만 적용 | 예 | Stage A 재dispatch — `state` 판정이 `precutover` 로 잡혀 재-quiesce 후 전환 도구부터 이어간다. |
| Stage A 전환 도구(cutover tool) | `cutover tool failed (exit N) and no seals are present -- refusing` | seal 이 안 걸림(`0\|0\|0`), 실패한 리포트는 다음 재시도에서 자동 보관(archive) 됨 | 예 | Stage A 재dispatch. seal 이 이미 `5\|5\|3` 이면 코드 스스로 "seals are already committed -- continuing" 으로 통과시키므로 중복 실행 걱정은 없다. |
| Stage A 사후 마이그레이션/최종 확인 | `post-M9 ledger does not match the expected M1..M10 set` / `cutover seals or zero-legacy-link counts are not exact` | 전환 도구는 성공, seal 확인만 실패 | 예 | Stage A 재dispatch — `committed` 상태로 재진입해 사후 마이그레이션부터 이어간다. |
| Stage A 전체 실패(ERR trap) | `Candidate failed during Task168 stageA -- refusing to restart the previous release's images against a possibly partially migrated database` | `activation-stage.json`(stage=stageA) 기록, **API·워커는 계속 내려간 채로 유지**(옛 버전도 새 버전도 안 뜸) | 예(위 개별 단계 항목 참고) | 위 표에서 실제 실패 지점을 찾아 원인 조치 후 Stage A 재dispatch. 옛 버전으로 자동 복구되지 않는다는 점이 일반 배포와 다르다 — DB 가 부분적으로 바뀌었을 수 있는 상태에서 옛 코드를 올리는 것 자체가 위험하기 때문(의도된 설계). |
| Stage B 시작, 영수증 조회 | `no unique Stage A transition receipt for this database` / `transition receipt's releaseSha does not match this manifest` / `manifest migration checksums do not match the Stage A transition receipt` | 아무 것도 안 바뀜 | 아니오(그 상태로는) | Stage A 를 같은 커밋으로 다시 완료했는지, Stage B 를 **다른 커밋**으로 잘못 dispatch 하지 않았는지 확인. 원인 없이 재시도하지 않는다. |
| Stage B 사전 이름셋 확인 | `Stage B refuses: prod ledger is not exactly the Stage A M1..M10 set` | 아무 것도 안 바뀜 | 아니오 | Stage A~B 사이에 다른 배포가 끼어들어 원장이 바뀌었을 가능성 — 사람이 원장을 직접 읽고 판단(아래 "금지 사항" 위반이 있었는지부터 확인). |
| Stage B M11 마이그레이션 자체 | `M11 prisma migrate deploy failed` | seal 은 아직 `5\|5\|3`(M11 이전 상태), M11 자체는 트랜잭션이라 실패하면 스키마는 안 바뀜 — 단 `m11-entry.json`(status `ENTERED`)은 이미 기록돼 있어 다음 시도가 "이번 실행이 넣은 항목"임을 증명할 수 있음 | 예 | 에러 원인(디스크·락 등) 해결 후 Stage B 재dispatch — 같은 release/db/image 조합이면 `m11-entry.json` 을 재사용하고 마이그레이션만 다시 시도한다. |
| Stage B 활성화(컨테이너 재기동~헬스체크) | `wait_for_prod_health_contract` 계열 실패(로그에 `Health contract failed`) | **M11 은 이미 커밋됨**(되돌릴 수 없음), 새 컨테이너가 못 뜨거나 헬스체크 미통과 | 예 | Stage B 재dispatch — `migration-stage.json` 이 있으므로 마이그레이션은 건너뛰고 컨테이너 기동부터 재시도한다. 옛 버전으로 자동 복구되지 않는다(위와 같은 이유). |
| Stage B verify(공개 API 검증) | 로그에 `tournament detail non-200` / `fixture detail non-200` 등, `task168_verify` 가 0 이 아님 | **컨테이너는 이미 새 버전으로 떠서 정상 서비스 중**(헬스체크는 통과한 뒤라서), 다만 이 릴리스는 아직 "active"로 승격되지 않음(`state.json` 은 옛 릴리스를 가리킨 채) | 예 | 실패한 대회/경기 ID 를 로그에서 찾아 원인 조사. 원인을 못 찾아도 서비스 자체는 떠 있으니 급하지 않다 — Stage B 재dispatch 하면 `migration-stage.json` 재사용으로 마이그레이션은 건너뛰고 verify 부터 재실행한다. |
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
2. `pg_restore --clean --if-exists -d <복원 대상 DATABASE_URL> backup.dump`.
3. 애플리케이션이 그 DB 를 가리키도록 하기 전에 반드시 부록 B 의 원장 쿼리로 원장 상태가
   Stage A 시작 전과 같은지 확인한다.
4. 이 복원·전환은 **직접 사용자 승인** 후에만 실행한다(alpha-data-writes-need-user-approval
   원칙과 동일 — 대상이 prod 여도 예외 없음).

### 층 2 — RDS PITR(Point-In-Time Recovery)

`pg_dump` 백업이 없거나 더 이전 시점으로 되돌려야 할 때 쓴다. RDS 자동 백업의 보존 기간은
2026-09-27 확인 시점 **7일**이다 — 그보다 오래된 시점으로는 못 돌아간다.

1. AWS 콘솔 → RDS → 대상 인스턴스 → "작업(Actions)" → "특정 시점으로 복원(Restore to point
   in time)". quiesce 영수증(`quiesce.json`)에 기록된 시각 **직전**을 목표 시각으로 고른다 —
   quiesce 이후에는 쓰기가 없었으므로 그 시각 자체나 그 이후 아무 시각이나 안전하다.
2. 복원은 **새 인스턴스**로 생성된다(원본을 덮어쓰지 않음) — 엔드포인트가 바뀐다.
3. 애플리케이션을 그 새 인스턴스로 돌리기 전에 부록 B 쿼리로 원장·핵심 테이블 행 수를 확인한다.
4. 확인 후 `.env` 의 DB 접속 정보(`V1_DB_HOST` 등 키 이름)를 새 인스턴스로 갱신 — 이 문서엔
   실제 엔드포인트 값을 적지 않는다.
5. 이 전환도 직접 사용자 승인 후에만 실행한다.

### 이전 릴리스 재배포가 막히는 조건

M11 이 이미 원장에 적용된 뒤에는 `assert_task168_m11_restore_target_safe()` 가 다음을 모두
만족할 때만 롤백/복원 대상을 허용한다 — 즉 셋 중 하나라도 걸리면 **자동으로 거부**된다:

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

EC2 안에서 실행할 내용(반드시 `SET default_transaction_read_only = on` 을 먼저 건다):

```bash
API=$(sudo docker ps -q -f name=teameet_v1_api | head -1)
URL=$(sudo docker exec "$API" printenv DATABASE_URL)
sudo docker exec -i -e PGURL="$URL" teameet_v1_postgres sh -c 'psql "$PGURL" -f -' <<'SQL'
SET default_transaction_read_only = on;

-- 1) 원장에 미해결(진행 중이거나 실패한) 행이 있는지 — 0이어야 정상
SELECT count(*) FROM "_prisma_migrations"
WHERE finished_at IS NULL AND rolled_back_at IS NULL;

-- 2) M11 이 정확한 체크섬으로 완료 상태인지(Stage B 완료 후)
SELECT checksum, finished_at, rolled_back_at FROM "_prisma_migrations"
WHERE migration_name = '20260911090000_retire_tournament_fixture_tables';
-- 기대값: checksum = 08eac7347cbb10fcc4ef87d31d63bd9516d5bfda281dcf5730c4f0a1985d9323,
--         finished_at 있음, rolled_back_at 없음(NULL)

-- 3) Stage A 완료 후 ~ Stage B 이전: 전환 seal(트리거) 상태 — "5|5|3|0|0|0" 이어야 정상
SELECT
  (SELECT count(*) FROM pg_trigger WHERE tgname='v1_tournament_fixture_retired_write' AND tgenabled='A') || '|' ||
  (SELECT count(*) FROM pg_trigger WHERE tgname='v1_tournament_fixture_retired_row_write' AND tgenabled='A') || '|' ||
  (SELECT count(*) FROM pg_trigger WHERE tgname='v1_000_tournament_fixture_retired_link' AND tgenabled='A') || '|' ||
  (SELECT count(*) FROM v1_games WHERE source_type::text='TOURNAMENT_FIXTURE' OR tournament_fixture_id IS NOT NULL) || '|' ||
  (SELECT count(*) FROM v1_tournament_staff_fixture_scopes WHERE fixture_id IS NOT NULL) || '|' ||
  (SELECT count(*) FROM v1_operation_audits WHERE fixture_id IS NOT NULL);

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
```

숫자 3·4번의 정확한 기대값은 위 SQL 주석에 이미 적혀 있다 — 다르면 "실패 대응표"의 해당
행을 본다. 5번은 Stage B 완료 후 `v1_team_matches` 행 수가 **레거시 fixture 가 canonical 로
변환된 만큼만** 늘어야 한다(정확한 증가분은 실제 프로덕션 대회 수에 따라 다르다 — 리허설
기준으로는 +32, 그 외 사용자 데이터 테이블은 변하지 않아야 한다).

공개 API 로 최종 확인(비인증, 인증 토큰 불필요):

```bash
curl -fsS https://teameet.co.kr/api/v1/health | jq -e '.data.checks.db == true'
curl -fsS https://teameet.co.kr/api/v1/tournaments | jq '.data.pageInfo'
# 위에서 얻은 각 대회 id 에 대해:
curl -o /dev/null -sw '%{http_code}\n' https://teameet.co.kr/api/v1/tournaments/<id>
```
