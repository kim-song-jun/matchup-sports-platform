# dev → main 프로덕션 배포 준비 — NO-GO

**NO-GO.** 2026-10-01 후속 점검 기준. main 머지·push·production 승인·DB 변경은 하지 않았다.
요청된 PR 본문/오탐 근거와 확인된 리뷰·보안 처리는 원격에 기록했다. 준비 수정은 dev 대상 초안 PR로
전달하며 dev/main에는 아직 반영하지 않는다. 원본 WIP는 보존했다.

## 현재 후보와 범위

| 항목 | 마지막 fetch 결과 |
|---|---|
| origin/dev, PR #1325 head | `3aac46ec17f5b0646ca6a47f1e20a06771fd5fc6` |
| origin/main, PR #1325 base | `f49742f4522d99eb6c0f25791904ba04278666f3` |
| commit 차이 | main-only 0, dev-only 4,322 |
| 규모 | rename 미탐지 7,262경로; 명시 탐지 6,796항목, +392,666/-242,704줄 |
| DB 소스 | SQL migration 65개 추가; main 123 → dev 188 |
| Changeset | **77개 미소비**, 앱 package 1.0.4 |

점검 중 #1459/#1462가 dev에 추가됐다. GitHub changed_files=0은 크기 근거로 사용하지 않았다.
원본 `fix/tournament-lineup-flow` / `992dba62f`의 API·Web·Prisma·배포 WIP를 checkout/reset/stash/
staging하지 않았으며 다른 worktree를 정리하지 않았다. 수정 작업은 별도 `/tmp/teameet-prod-readiness-20261001`이다.

## 해결된 리뷰·보안과 검증

GitHub CLI 2.102.0을 공식 SHA256 확인 후 WSL 사용자 경로에 설치했다. 기존 인증을 이용했고
비밀 값을 읽거나 복사하지 않았다. write/triage 권한은 있으나 admin/maintain 권한은 없다.

- 전체 thread 26개(hasNextPage=false), unresolved **4→1(.dockerignore)**. outdated는 resolved로 간주하지 않았다.
- High 총 **6개(#13, #44–48)**를 조사했다. 실제 요청/최신 SARIF/소스로 오탐 처리한 뒤 open **0개**,
  CodeQL aggregate SUCCESS를 확인했다. [보안 판정 근거](https://github.com/kim-song-jun/matchup-sports-platform/pull/1325#issuecomment-5932370957).
- #44–48의 source는 `@UploadedFile().path`다. controller는 고정 dest를 사용하고
  [잠금 버전 multer 2.2.0](https://github.com/expressjs/multer/blob/v2.2.0/storage/disk.js)은 서버에서 랜덤 파일명을 생성한다.
  실제 HTTP multipart로 Unix/Windows/절대 경로 filename 및 `path`/`file[path]`를 넣어도 서버 경로를
  덮어쓰지 못했다(3/3 PASS). 미머지된 보강 코드를 오탐 근거로 사용하지 않았다.
- #13은 password/token/개인정보가 없는 128-bit 요청 대조 nonce다. callback에서 읽기 즉시 제거,
  불일치 교환 거부, 주소 code/state 제거. [RFC6749 §10.12](https://www.rfc-editor.org/rfc/rfc6749#section-10.12)의
  같은 origin으로 보호되는 state 저장 원칙을 대조했다. callback suite 6/6 PASS. 실제 Kakao 로그인은 별도 미검증.
- baseline의 `allowedOf(undefined)`는 guard 후 0 반환. 실제 gate PASS(593 files, raw lookup 0/0),
  신규 raw lookup probe는 허용 0으로 FAIL/TypeError 없음. probe 삭제.
  [답변](https://github.com/kim-song-jun/matchup-sports-platform/pull/1325#discussion_r4155841395), thread resolved.
- Docker 제외 복원은 실제 개선 사항이며 **dev 반영 전 unresolved 유지**.

## 준비한 코드와 좁은 검증

- `promote-main.sh --prepare-only`: clean feature worktree만 허용; dirty WIP/main/dev/detached 거부.
  alpha SHA/버전 대조 → 고정 Changesets CLI로 소비 → 승격 gate. stage/commit/push/dispatch 없음.
  main에 promote-main.yml이 없어 dispatch 404인 상황의 안전한 로컬 경로다. 기본 모드는 dev push와
  alpha dispatch까지 하므로 준비 단계에서는 사용하지 않는다. main workflow bootstrap push 금지.
- 채팅 저장 확장자를 서버 허용 목록의 키로 고정; prototype key도 거부. `.dockerignore` 3개 제외 복원.
- 런북 PITR를 **Stage A 첫 DB 변경 전의 검증된 시점**으로 정정. M11 이후 legacy table seal 쿼리를
  조건 분기로 건너뛰고 rollback 거부 조건/비밀번호 없는 restore argv 설명을 맞췄다.
- AGENTS/CLAUDE/compatibility 문서를 동기화하고 patch Changeset을 포함했다.
- promote 8 시나리오 PASS(최종 dirty WIP 거부도 확인), 업로드 16/16, callback 6/6,
  실제 surface 정상/거부, 실제 multer 3 요청, Task168 계약, production security guard PASS.
  diff check/새 debt marker/import 범위도 확인. 원격 준비 수정 PR CI/실제 DB 리허설을 대체하지 않는다.
- 이전 Prisma client 타입 오류와 callback 누락 의존성 때문에 초기 검증이 실패했다. 다른 세션의
  node_modules를 바꾸지 않고 이 worktree의 client 및 /tmp 잠금 버전 의존성으로 보완해 통과했다.
  테스트용 web overlay는 제거했다. 호스트 24 cores/load<0.2/가용 약15GB/swap0. Docker는 WSL IPC
  오류로 접근 불가하여 실제 DB/이미지 빌드를 수행하지 않았다.

과거 릴리스 전용 후보 `/tmp/teameet-prod-release-candidate-20261001`는 **c4467dab1의 75개**를
실제 CLI 2.30.0으로 소비(1.0.4→1.1.0)하고 일반 release commit/promotion gate PASS를 확인한 예시다.
현재 77개 및 준비 수정의 Changeset이 더 있으므로 **이 후보를 최종 후보로 사용하지 않는다**.
준비 수정 dev 반영 후 최신 dev의 전체 Changeset을 다시 소비한다. resolver는 미소비가 없어도 다음
patch를 계산하므로 package 1.1.0 후보 stable header=1.1.1이었다. 최종 SHA의 header/manifest 재대조 필요.

## CI와 실제 서비스

| 검사 | SHA와 판정 | 증거 |
|---|---|---|
| dev push API/Web/Gates | 70a8e2c5a PASS | [CI](https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/36866816889) |
| alpha 배포 | 70a8e2c5a PASS | [배포](https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/36866816901) |
| 승격 PR API/Web | 70a8e2c5a PASS | [PR CI](https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/36866829467) |
| 승격 PR Gates | 70a8e2c5a FAIL, unreleased Changesets | [실패 job](https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/36866829467/job/110384288199) |
| CodeQL aggregate | 오탐 처리 후 SUCCESS | [체크](https://github.com/kim-song-jun/matchup-sports-platform/runs/110384554009) |
| 최신 3aac46ec1 | 검사/alpha 완료 미확인, 이전 PASS 재사용 금지 | [최신 체크](https://github.com/kim-song-jun/matchup-sports-platform/pull/1325/checks) |
| 현 production 배포 | f49742f45 SUCCESS | [배포](https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/35971423193) |

인증 후 Gates 실제 로그에서 `dev -> main promotion must not contain unreleased Changesets`를 확인했다.
현재 적용 ruleset에는 deletion/non-fast-forward/Copilot만 있고 required_status_checks 규칙은 없다.
classic protection API는 404로 필수 체크 강제 여부를 확정하지 않았다. 운영 GO에는 API/Web/Gates/CodeQL과 리뷰 해결을 요구한다.

실제 관측 **22:29 KST**: 양 환경 /landing·health·매치/팀/대회 목록 200, checks.db=true.
alpha 웹/API commit=`70a8e2c5abf276c10e4a15423a81feed1611c711`, release=`1.1.0-alpha.20261001.g70a8e2c5abf2`.
production 웹/API commit=`f49742f4522d99eb6c0f25791904ba04278666f3`, release=0.5.0.
22:26 배포 중 alpha health 502/이전 웹 SHA도 관측했고 완료 후 회복 확인. **현재 dev=3aac46ec1과 마지막
alpha SHA가 다르므로 최신 후보 검증은 미완료**다. 초기 c446 관측의 /v1/home 308, anonymous 보호 API401,
alpha44/44·prod32/32 공개 경기 상세200은 별도 이전 증거다. 최신 전체 상세 및 로그인 후 사용자/호스트·
명단/경기 운영/관리자/실제 OAuth 시나리오는 미확인이다. production 테스트 쓰기는 하지 않았다.

## Task 168 사전 조건 7개

| 런북 조건 | 판정 | 필요한 증거/조치 |
|---|---|---|
| 최신 후보의 리허설 | 미확인, 차단 | Task 175에는 09-27, 123→178 원장·drift 0·공개 경기 32건 기록. 현재는 188개 체인이다. 원본 영수증/덤프/hash 및 65개 migration 전체를 적용한 최신 결과 필요. task-6-report 경로는 현재 tracked tree에 없음 |
| RDS 수동 스냅샷 | 미확인, 런북상 선택/권장 | 대상 DB와 바인딩된 snapshot, available 시각 확인. 존재하지 않는다고 단정하지 않음. 배포 IAM 역할에 권한이 없다는 역사 기록과 운영자의 콘솔 권한은 별개 |
| 공개 대회 경기 존재 | PASS | prod 32/32 상세 200. 전환 직전에 다시 조회. 이전 덤프의 숫자만 사용하지 않음 |
| PITR 보존 기간/복원 가능 시각 | 미확인, 차단 | 09-27의 7일은 역사 기록. 현재 retention·earliest/latest restorable time과 복원 권한 확인 |
| 유지보수 공지 | 미확정, 차단 | API 오류 구간/예상 창/연락·복구 경로 공지, 게시 시각/링크 |
| Stage A/B 연속 승인 운영자 | 미확정, 차단 | 같은 담당자의 이름·시간대·production 승인 권한·복구 담당자 확인 |
| 동일 main SHA | 강제 코드 확인/운영 계획 미확정 | merge SHA 고정·main 변경 동결, A/B run head_sha와 transition.releaseSha 대조 |

추가 운영 미확인: 실제 RDS `_prisma_migrations` checksum/미해결 행, seal 상태, 현재 active/state
매니페스트의 SHA·digest·DB 바인딩, core 테이블 전환 전 행 수, 호스트 백업/디스크, 전체 승인 대기/SSM
상태, 로그인 후 사용자·운영 시나리오. 최초 점검에서는 gh/aws CLI 및 인증 환경 변수가 없었다.
위 후속 확인에서 gh를 설치하고 기존 인증을 확인했으며, AWS 접근은 아직 확인하지 못했다.

전환 도구 archive와 M11 source hash는 런북의 고정 값과 일치했다. 소스 SQL의 단순 token
inventory에서 DROP 관련 신호가 8개 migration에 있었으며, 이 중에는 table/type뿐 아니라
constraint 삭제도 있다. M11 외 리그 테이블/분쟁 제거와 revision 변경 등도 최신 덤프에서
리허설해야 한다. token inventory는 실제 DDL 영향 검토나 DB 리허설을 대체하지 않는다.

## 남은 차단 항목

1. 준비 수정의 dev PR CI/리뷰·반영 및 Docker thread 해결.
2. 최신 전체 Changeset 소비/릴리스 전용 dev PR, 최종 head CI/CodeQL/실제 alpha·인증 시나리오 확인.
3. 188개 체인 실증 리허설·DB ledger/checksum·PITR·복원 권한. 스냅샷은 권장으로 따로 확인.
4. 유지보수 공지·연속 승인 운영자·동일 main SHA 동결 확정.

## 정확한 운영 순서 — 사용자 실행 단계

1. 기존 GitHub 인증으로 보안/리뷰 조회 및 오탐 처리를 완료했다. 다음은 AWS 읽기 권한/리허설/공지/운영자
   조건을 **한 항목씩** 확인한다. 토큰/DB 비밀 값을 보고서나 채팅에 넣지 않는다.
2. 수정 브랜치 diff 검수 → dev 대상 수정 PR의 CI/리뷰 → dev 반영·alpha 검증.
3. 그 결과의 최신 dev를 새 worktree에 받고 `--prepare-only`로 자체 Changeset까지 소비 → release-only
   PR을 dev로 반영 → 새 dev SHA의 CI/alpha/인증 시나리오 검증. #1325 head/base와 본문을 다시 고정한다.
4. 최신 덤프 리허설·DB 원장·PITR·권장 스냅샷·공지·연속 담당자·동결 조건을 완료한 뒤 GO를 재판정한다.
5. **사용자가** #1325를 main으로 머지한다. 에이전트는 merge/push/production 승인을 하지 않는다.
6. 자동 시작된 main push / Stage none 런을 식별하고 **승인하지 않고 취소**한다. 취소 완료를 확인해
   `deploy-production` 큐를 비운다. 무관한 alpha/CI 런은 취소하지 않는다.
7. main merge SHA를 `M`으로 기록하고 동결한다. Stage A dispatch 시 선택한 ref와 실제 run.head_sha가
   `M`인지 확인한다. `task168_stage=stageA`, 검증된 `task168_rehearsal_evidence` 한 줄을 입력한다.
   **사용자/지정 운영자가** production 승인한다.
8. A는 quiesce→pg_dump/검증→pre-migration→cutover/seal→M9→transition 영수증 순서다. A 성공은
   러너 완료 로그와 영수증으로 확인한다. API/워커는 내려간 채이며 health skip은 의도된 동작이다.
9. 같은 `M`에 `task168_stage=stageB`, 같은 증거 문구로 dispatch한다. **같은 운영자가 연속 승인**한다.
   A~B 사이 일반 배포/main 변경/수동 SQL/영수증 수정 금지. 재부팅이나 Docker 재시작이 있었다면 중단·보고.
10. B는 바인딩/재quiesce→M11 및 남은 migration→전체 ledger→backfill→기동→health/digest→공개 API
    verify→active 승격이다. 실패한 원장 상태를 무조건 재dispatch하지 말고 런북 실패 표를 따른다.
11. B 완료 뒤 웹/API header=`M`, checks.db=true, /landing 200, /v1/home 308, 공개 대회/경기 전체,
    원장 미해결 0/M11 checksum, legacy table 없음, core 행 수와 모든 영수증·active digest를 확인한다.
    인증 사용자/운영 시나리오 확인 후 점검 종료 공지를 낸다.

**중단 시간은 A quiesce부터 B 활성화까지다. 승인·빌드 대기까지 포함하므로 과거 DB 작업 14초/7초를
전체 중단 예상 시간으로 쓰지 않는다. M11 이후 이전 이미지 롤백은 안전하지 않다.**
재시도/복원은 실패 표와 사용자 판단을 따른다. PITR/pg_dump는 새 DB로 복원해 원장·스키마를 검증하고,
사용자 승인 후 연결을 바꾼다. 이미지 rollback/revert를 자동 실행하지 않는다.

## 증거 위치

원격 근거는 위 PR/체크/리뷰 링크. 원본 및 수정 worktree의 `output/release/prod-readiness-20261001/`
(Git ignore)에 raw JSON/SARIF/테스트/처리 결과/후보 패치를 보존한다. 최신 SHA·시각과 과거 결과를 구분한다.
[dispatch 제약 공식 문서](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow).
이 보고서는 현재 NO-GO이며 상태 변경 뒤 다시 판정한다. 실제 DB 접근이 없어 확인하지 못한 조건은 PASS가 아니다.
