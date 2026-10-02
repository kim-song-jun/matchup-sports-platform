# dev → main 프로덕션 배포 준비 — NO-GO

**NO-GO.** 2026-10-01 23:40 KST 전후 재점검. 에이전트가 GitHub·AWS·운영 서버·DB·공개 서비스를 직접 확인했다.
main merge/push, production 승인, 운영 DB 변경, RDS 리소스 생성은 하지 않았다. 원본 작업 트리의 WIP를 보존했다.

## 후보와 변경 범위

| 항목 | 확인 결과 |
|---|---|
| origin/dev / 승격 PR #1325 head | `16a8c301fd8b9e08c7b3c959c2c974480b6d431d` |
| origin/main / #1325 base | `f49742f4522d99eb6c0f25791904ba04278666f3` |
| 커밋 차이 | main-only 0 / dev-only 4,328 |
| 파일·줄 수 | rename 미탐지 7,269경로; renameLimit=10000 명시 탐지 6,803항목, +393,361/-242,741 |
| migration 소스 | main 123 → dev 188, SQL 65개 추가 |
| Changeset | 미소비 **79개**, 두 앱 package 1.0.4 |
| 준비 수정 | dev 대상 [PR #1476](https://github.com/kim-song-jun/matchup-sports-platform/pull/1476) |

점검 중 dev가 여러 번 전진했다. 이 SHA는 관측 스냅샷이며 최종 동결 후보가 아니다. GitHub changed_files=0은 규모 근거로 사용하지 않았다.
원본 `fix/tournament-lineup-flow` / `992dba62f`는 checkout/reset/stash/staging하지 않았다. 수정은 별도 worktree에서만 수행했다.

## 해결된 항목과 검증

- 기본 브랜치 main에 `promote-main.yml`이 없어 dispatch 404인 문제의 로컬 준비 경로를 구현했다.
  `promote-main.sh --prepare-only`는 clean feature worktree만 허용한다. alpha SHA/버전 확인 → pinned Changesets CLI 2.30.0 소비 → 실제 승격 gate 순서다.
  stage/commit/push/dispatch를 하지 않는다. main에 workflow를 넣기 위한 bootstrap push도 하지 않는다.
  실패 후 변경 diff를 보존하고 새 worktree 재시도를 안내한다. 기본 모드는 dev push/alpha dispatch를 하므로 준비 단계에서 사용하지 않는다.
- 채팅 파일 확장자를 서버 허용 목록의 literal key로 고정하고 prototype key를 거부했다. Docker context의 test/ultraplan/.autoqa 제외도 복원했다.
- 런북 PITR 시점을 **Stage A 첫 DB 변경 전**으로 정정했다. M11 이후 legacy-table seal 조회를 구분하고 rollback/restore 설명을 실제 코드에 맞췄다.
- promote 계약 **10 시나리오**, upload **16**, callback **6**, 실제 multer multipart 경로 위조 **3** 요청, surface 정상/거부 probe, Task168/security 계약 PASS.
  로컬 테스트와 원격 CI, 운영 서비스 관측, 실증 DB 리허설은 각각 구분한다.
- 준비 PR 최초 커밋 `704b601b4`의 [API/Web/Gates CI](https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/36870470174)는 모두 SUCCESS.
  후속 커밋에는 실패 안내/실패 경로 검증/본 보고서 갱신이 포함되므로 최신 head의 CI와 리뷰를 다시 확인해야 한다.
- Sonnet 자동 리뷰의 Minor 2건을 보완했다. Copilot을 명시 요청했으나 Copilot 작성자의 최신 clean 리뷰는 아직 확인하지 못했다.
  별도 [AI findings 검사](https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/36870477217)는 `400 The requested model is not supported`로 실패했다.
  CI 성공으로 이 실패나 Copilot 완료 조건을 통과 처리하지 않았다.

과거 c4467dab1 기반 release-only worktree의 75개 소비/앱 1.1.0/로컬 gate PASS는 실행 예시다.
현재 79개 및 준비 수정 자체 Changeset이 추가돼 **최종 후보로 사용할 수 없다**. 수정 dev 반영 후 최신 모든 Changeset으로 다시 생성해야 한다.
최종 SHA의 resolver·alpha header·stable manifest 버전을 재대조한다.

## 리뷰와 보안 판정

- #1325 thread 26개, hasNextPage=false. 미해결 **4→1(.dockerignore)**. 복원 코드는 #1476에 있고 dev 반영 전 thread를 닫지 않는다.
- #13/#44–48 High 6건은 최신 SARIF/현재 코드/실제 multipart·콜백 검증 후 false positive로 명시 처리했다.
  [상세 보안 근거](https://github.com/kim-song-jun/matchup-sports-platform/pull/1325#issuecomment-5932370957).
  파일 path는 multer 2.2.0의 서버 생성 경로이고 사용자 filename/body가 덮어쓰지 못한다. OAuth state는 요청 대조 nonce이며 callback에서 소비·검증한다.
- 현재 **dev 및 #1325 ref의 open CodeQL alert는 각각 0개**. 저장소 전체 open 0이라는 뜻은 아니다.
  main에는 기존 **High 9개/Medium 2개**가 남아 있다. #19 ReDoS는 dev의 선형 문자열 처리로 수정됐고 #1325 instance=fixed다.
  다른 main High 경고 경로(삭제된 QA 스크립트 및 legacy apps/api·apps/web)는 현재 dev tree에 없다. legacy 구현을 v1 판단 근거로 읽지 않았다.
  실제 승격 후 main 재스캔을 확인해야 한다. main 잔존 경고를 오탐으로 일괄 dismiss하지 않았다.
- baseline undefined guard에 대한 리뷰는 실제 gate 정상/거부 probe로 확인해 답변 및 resolve했다.
  [답변](https://github.com/kim-song-jun/matchup-sports-platform/pull/1325#discussion_r4155841395).

## CI와 실제 서비스 관측

| 종류 | SHA / 결과 | 증거 |
|---|---|---|
| 최신 dev push CI | 16a8c301 API/Web/Gates PASS | [CI](https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/36874358056) |
| 최신 alpha 배포 | 16a8c301 SUCCESS | [배포](https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/36874357956) |
| 승격 PR CI | 16a8c301 API/Web PASS, Gates FAIL: 미소비 Changesets | [승격 CI](https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/36874366476) |
| CodeQL | 16a8c301 Analyze 및 aggregate SUCCESS | [분석](https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/36874365478) |
| 현재 production 배포 | f49742f45 SUCCESS | [배포](https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/35971423193) |

실제 HTTP 관측 23:31 KST: 양 환경 /landing·health·매치/팀/대회 목록 200, checks.db=true.
alpha 웹/API commit=`16a8c301fd8b9e08c7b3c959c2c974480b6d431d`, release=`1.1.0-alpha.20261001.g16a8c301fd8b`.
production 웹/API commit=`f49742f4522d99eb6c0f25791904ba04278666f3`, release=0.5.0.
전체 cursor pagination → 대회 detail → schedule → 모든 공개 경기 detail: alpha 21대회/44경기 **44/44**, prod 4대회/32경기 **32/32** 200.
실제 canonical 보호 경로 `/api/v1/auth/me`의 anonymous 요청은 양쪽 401. 잘못 조회한 `/users/me`는 404여서 인증 거부 증거로 사용하지 않았다.
22:26 alpha 배포 중 일시적 502와 이전 웹 SHA도 기록했고 배포 완료 뒤 회복을 확인했다.
로그인 후 사용자·호스트·명단·경기 운영·관리자·실제 Kakao OAuth 브라우저 시나리오는 미검증이다. production 테스트 쓰기는 하지 않았다.

## AWS·운영 DB 직접 확인

Windows AWS CLI 2.34.41의 기존 default 인증을 이용했다. STS 계정과 GitHub 등록 production 계정/리전이 일치한다.
운영 DB 연결 URL/비밀 값은 출력하지 않았고 `.env*`를 읽지 않았다. DB 조회는 single connection, READ ONLY transaction, 5초 statement/1초 lock timeout이었다.

| 항목 | 실제 결과 |
|---|---|
| RDS | available, PostgreSQL, storage encrypted, Multi-AZ=false |
| runtime DB 바인딩 | API DB hostname SHA256가 조사한 RDS endpoint SHA256와 일치 |
| backup retention | **7일**, automated backup active |
| 복원 가능 창 | 2026-09-24 14:02:29Z ~ 2026-10-01 14:02:29Z; 관측 10-01 14:11:45Z |
| 수동 스냅샷 | 대상 DB 1개 available/encrypted, 생성 **2026-08-14 17:27:50.814Z**; 전환 직전 백업으로 인정하지 않음 |
| 복원 권한 | 현재 운영자 IAM policy simulation의 snapshot/PITR restore·snapshot create allowed. 실제 복원/KMS/SCP/네트워크 성공 증거는 아님 |
| DB 원장 | 총125행=완료123+과거 rolled-back2. unresolved0, 완료 중복0, main/dev historical 체크섬 불일치0, 누락/추가0 |
| 전환 전 counts | users545, teams81, team_matches1, games33, tournaments4, legacy fixtures32/results0/goals0/videos32/edges0 |
| 전환 seal | 활성 Task168 seal0, legacy5개 테이블 존재: 전환 전 상태 |
| release state | state.json 존재/mode0600, active SHA=f49742f45/version0.5.0, candidate 없음 |
| 실행 이미지·소스 | API/Web/worker running+healthy, 설정 URI 및 로드된 digest가 active와 일치; source marker/hash·live symlink 일치 |
| Stage 영수증 | 기본 상태 경로에 Task168 receipt/backup 없음. 전환 전이므로 미래 A 영수증 부재는 정상이나, 다른 컴퓨터의 리허설 위치는 확정하지 못함 |
| 호스트 | EC2 running/SSM Online, API restart0; RAM 약1.9GiB/available627MiB, swap 사용822MiB, root 여유 약15GiB |
| 기존 호스트 백업 | 알려진 backup directory의 DB dump4개는 07-26 자료. 최신 리허설 또는 전환 직전 백업으로 인정하지 않음 |
| 로컬 Docker | 설치된 Docker Desktop 시작 후 Linux 엔진 접근 성공, 기존 컨테이너0; 로컬 DB/volume reset/delete 없음 |

SSM DB 원장 첫 출력은 API 24KB 제한으로 잘렸다. compact 배열로 다시 조회해 정상 JSON 전체125행을 받은 결과만 판정에 사용했다.
운영 호스트에서 빌드/전체 테스트/복제 DB 리허설을 시작하지 않았다. 현재 호스트 메모리·swap 상태에서 그 부하를 올리지 않는다.

## 런북 사전 조건 판정

| 조건 | 판정 / 남은 요구 |
|---|---|
| 최신 후보 실증 리허설 | **차단**. 09-27의 123→178/drift0/공개32 기록은 역사 증거. 현재188개 체인과 최종 SHA로 production clone에 A/B 적용한 원본 영수증/hash/drift/행수/공개 API 결과 미확인 |
| RDS 수동 스냅샷 | 존재/available 확인, **신선도 불충족**. 런북상 선택·권장 조건이며 최신 snapshot 생성은 별도 운영 결정 |
| 공개 대회 경기 | **PASS**: 현재 prod32/32. A 직전/B 이후 다시 확인 |
| PITR | **현재 설정 PASS**: 보존7일/복원 가능 창 확인. A 첫 DB 변경 전의 선택 복원 시각과 실제 clone restore 증거는 아직 없음 |
| 유지보수 공지 | **미확정·차단**: 시간창/게시 채널/공지 링크/복구 연락 경로 |
| 연속 승인 운영자 | **미확정·차단**: 같은 사람의 A/B 연속 처리 시간·복구 담당자. GitHub production reviewer kim-song-jun 또는 seeungmin; prevent_self_review=false |
| 동일 main SHA | 코드 강제 확인. **운영 동결 미확정**: 최종 merge SHA M, A/B run.head_sha=M·transition.releaseSha=M 확인 |

## 남은 차단 / 확인하지 못한 항목

1. #1476 최신 head CI와 Copilot clean 리뷰, dev 반영 및 Docker thread 해결.
2. 이후 최신 dev의 전체 Changeset 소비/release-only dev PR, 최종 head CI/alpha 재검증. 현재 #1325 Gates FAIL.
3. 최종188개 chain의 production clone 리허설과 실제 snapshot/PITR restore 증거. 기존 리허설 원본 경로도 미확인.
4. 실제 인증 사용자/운영 브라우저 QA. 공개 API 성공은 이 검증을 대체하지 않는다.
5. 유지보수 공지·동일 운영자·main SHA 동결의 사람 결정.

RDS clone 생성/새 snapshot/production dump 반출은 실행하지 않았다. 직접 조회로 알 수 있는 상태 확인은 완료했지만
새 과금 리소스·production 데이터 복사와 배포 승인은 운영자가 결정해야 한다. 확인되지 않은 항목을 PASS로 표시하지 않는다.

## 정확한 운영 순서

1. 수정 dev PR CI/리뷰·반영 → 최신 dev alpha 확인 → clean feature worktree에서 `--prepare-only` → release-only dev PR 반영.
2. 최종 SHA 고정·CI/CodeQL/전체 리뷰·alpha 인증 QA·최신 clone A/B 리허설 → PITR/백업·공지·연속 운영자·동결 완료 → GO 재판정.
3. **사용자만 #1325 main merge**. 자동 main push `deploy.yml` **Stage none은 승인하지 않고 취소**, cancelled 확인해 production 큐를 비운다.
4. merge SHA `M` 기록/main 동결. 사용자/운영자가 `deploy.yml --ref main`, `task168_stage=stageA`, 검증된 `task168_rehearsal_evidence`로 dispatch.
   실제 run.head_sha=M인지 확인한 뒤 **사람이 production 승인**한다. 현재 branch ref 대신 임의 SHA를 dispatch하면 main 조건을 통과하지 못할 수 있다.
5. A는 quiesce → pg_dump/검증 → pre-migrations → cutover/seal → M9 → transition 영수증. 러너 완료와 receipt/seal/ledger를 확인한다.
   A 뒤 API/worker는 계속 정지한다. A health skip은 의도된 동작이다.
6. **같은 M**, 같은 리허설 증거로 Stage B dispatch → **같은 운영자가 연속 승인**. A/B 사이 일반배포·main 변경·수동 SQL·receipt 수정 금지.
7. B는 바인딩/재quiesce → M11 및 남은 migration → 전체 ledger/backfill → 기동/health/digest → 공개 API verify → active 승격.
8. 웹/API header=M, DBhealth, M11 checksum/원장 unresolved0/legacy없음, core counts, digest·receipt·전체 공개 경기·인증 시나리오를 확인하고 종료 공지.

중단은 A quiesce부터 B 활성화까지이며 승인·빌드 대기도 포함한다. **M11 이후 단순 이전 이미지 롤백은 안전하지 않다.**
실패한 원장을 무조건 재dispatch하지 않는다. [Task168 런북](prod-task168-transition-runbook.md)의 실패 표에 따라 판단하고
PITR/pg_dump는 새 DB로 복원해 확인한 뒤 사용자가 연결 전환을 승인한다.

## 증거 위치

원격 증거는 본문 PR/CI/보안 링크. 로컬 정리 증거는 gitignored `output/release/prod-readiness-20261001/`.
AWS raw 결과와 운영 식별자는 mode0600으로 보관하고 공개 PR/커밋에 포함하지 않는다. timestamp/SHA와 과거 증거를 구분한다.
[GitHub dispatch 기본 브랜치 제약](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow).
