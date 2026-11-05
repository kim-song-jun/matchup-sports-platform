# 운영 콘솔 승부차기 결과 정정

Status: Rollout In Progress (main/dev merged; deployments pending)
Owner: Codex (single agent)

## Context
기존 task150 결과 정정 후속 회귀. 정정 UI는 성공 수만 보내지만 기록이 있는 경기의 점수 변경은 서버가 takenHome/takenAway를 요구한다. 승부차기만 바꾼 변경 요약도 빠져 있다.
## Goal
승부차기 성공/시도 수와 선축을 실제 저장 계약에 맞춰 편집하고 변경 내용을 확인한다.
## Original Conditions
기존 점수·시도·운영자 예외 감사값 보존. 점수/시도 변경 시 과거 예외를 자동 승계하지 않음. 비결선/정규시간 승패 금지 유지. 기존 DTO 필드만 사용, DB/원격 결과 변경 없음.
## User Scenarios
운영자가 현재 공식 결과를 열어 PK 성공/시도/선축과 사유를 수정하고 정정 초안을 저장한 뒤 기존 공식화 절차를 따른다.
## Test Scenarios
RED→GREEN: PK만 수정 diff/시도수 payload. 미기록 시도 횟수는 자동 추정하지 않고 입력 요구. 기존 기록/예외 승계 및 정규시간 변경 회귀. 로컬 실제 정정 화면 read-only 검증.
## Parallel Work Breakdown
병렬 없음. Owned: result-edit-modal.tsx/.test.tsx, result-review-copy.ts/.test.ts, app/tournament-ops/result-review.test.tsx, 관련 types 주석/QA/changeset/이 문서. 추가 발견: explicit operatorOverride=false가 parser에서 생략되어 서버의 base 보완이 true를 되살릴 수 있어 tournament-result-review.service.ts/.spec.ts 및 docs/api/domains/tournament-operations.md까지 최소 수정. Forbidden: 기존 6강 WIP 제거, Prisma/원격 데이터 쓰기, 배포.
## Acceptance Criteria
- [x] 시도 횟수 입력과 DTO 허용 payload 전달.
- [x] 성공 수보다 적은 시도/한쪽만 입력/신규 점수에 횟수 누락 차단.
- [x] PK만 수정/횟수만 수정/선축만 수정 diff 표시.
- [x] 기존 무수정 PK의 시도/예외 보존.
- [x] 관련 테스트 및 로컬 화면 검증.
## Tech Debt Resolved
승부차기 편집이 없다고 기술한 stale 주석과 서버 에러 영문 노출 정리.
## Security Notes
기존 권한·CAS·공식화·서버 결판 검증 유지. 원격 수정 요청을 보내지 않는다.
## Risks & Dependencies
승자 변경은 후속 경기 진행 여부에 따라 서버가 정당하게 거절할 수 있다. 로컬 API bridge는 쓰기를 차단하므로 실제 alpha 저장은 검증하지 않는다.
## Ambiguity Log
사용자가 운영 콘솔의 결과 정정을 명시. 기존 공유 폼 수정으로 정정/재제출에 함께 적용. 임의 킥 횟수/운영자 예외 자동 생성 금지.
## Progress Snapshot
origin/dev2708c6149 기반 기존 six-team-design worktree에서 분리된 파일만 수정. 선행 디자인 WIP 보존.

- UI RED: 신규3개 모두 홈 시도 입력 누락으로 FAIL. GREEN: result-edit-modal54 + result-review31 + error-copy15 =100 PASS.
- backend RED: 명시적 false인데 base override=true로 복원되어 거절해야 할 미결 정정이 통과. GREEN: 서비스61 PASS, 정상 횟수 저장 시 과거 예외 미승계 확인.
- 서버 테스트 초기 blocker는 로컬 Prisma Client의 sixTeamBracket 타입 부재. 최신 v1 schema로 generate만 실행해 해결. DB접속/마이그레이션/스키마/seed 변경 없음. 이후 실제 ts-jest diagnostics 켠 상태로 검증.
- frontend tsc --noEmit --incremental false PASS. backend 변경은 ts-jest 타입 검사 포함61개 테스트 PASS. 좁은 직렬workers1, 추가 전체suite/build 없음.
- 기존 테스트2건은 새 시도 횟수 필수 입력 계약에 맞춰 실제 홈/원정 시도5회를 입력하도록 갱신. 성공payload에 두값 포함까지 검증.
- UI: alpha before 1440/768/390 및 실제 alpha 데이터 기반 로컬 after 1440/768/390. PK3:2, 시도3:3으로 폼 수정하고 변경요약·제출가능 확인. 홈시도1로 낮추면 안내/제출차단 확인. 모든 문서폭=viewport. 실제 저장 클릭 없음.
- 증거: `tmp/qa-penalty-correction/{before,after}/{1440,768,390}.png`, evidence.json. alpha baseline 오류0. local pageerror0; 조회용 중계의 socket/log403 제한은 기존과 동일.
- 브라우저 after PID12240/parent21088, before PID26812/parent12156 정상종료·세션폐기. 로컬 미리보기 서버는 사용자 확인용으로 유지.
- API docs README/global-contract/domain sync. diff --check PASS, touched TODO/FIXME/HACK/XXX 새 항목0, 신규 import 누락없음. 커밋·원격push·배포 없음.

## Local Review

http://localhost:3013/admin/live/a90df6d5-47e9-40f9-93ef-f679ce8da858/records/corrections 에서 경기 선택 → 정정 시작. 현재 미리보기는 실제alpha 조회용이므로 제출 요청은403으로 차단된다. 실제 alpha 저장/공식화는 배포 후 별도 검증해야 한다.

## 2026-10-30 main hotfix

- 사용자 요청: 위 다섯 항목만 main 핫픽스로 준비. 이 명시적 요청에 따라 일반 dev 대상 정책의 범위를 이번 핫픽스 PR로 한정해 예외 적용. 최종 main 머지와 production environment 승인은 사용자가 직접 수행한다.
- 기준: origin/main dcab2c77e4. origin/dev의 미승격 대회 체험·접수 정책·단계별 경기 시간·목록 변경은 제외. 원본 six-team-design WIP는 보존.
- Owned: 원본 작업의 25개 소스/테스트/API 문서, 위 두 task 문서, 두 Changeset 및 소비에 따른 API/Web 버전·CHANGELOG. Forbidden: Prisma/DB, 원격 경기 데이터, 무관한 dev 변경. 단일 에이전트로 수행.
- 진행: main 기준 패치 적용 및 diff --check 통과. main 기준 회귀 검증 중. 이전 로컬 미리보기 증거는 위 기록이며 이번 main 배포 검증을 대신하지 않는다.
- 남은 검증: main 기반 회귀 테스트/타입 검사, Changesets 소비·버전 게이트, 원격 CI/리뷰, 실제 배포 후 저장·공식화 및 화면 검증.

### main 기준 최종 로컬 검증

- 소스 커밋 `6ffb2d4cf`, 공식 Changesets 소비/릴리스 커밋 `a7d79655e`. 두 앱 `1.12.2 → 1.12.3`, 두 CHANGELOG 갱신, 미소비 Changeset 0. 이력의 두 Changeset 삭제를 포함한 main 릴리스 게이트 PASS.
- Frontend: Vitest `--maxWorkers=1 --minWorkers=1` 8 files / **280/280 PASS** (635.28s). result-edit-modal54, result-review31, result-review-copy15, bracket-page49, schedule60, admin canvas17/mobile47, public six-team7.
- Backend: Jest `--selectProjects unit --runInBand --runTestsByPath src/tournament-operations/results/tournament-result-review.service.spec.ts` **61/61 PASS**, ts-jest diagnostics 유지, 67.326s. 실제 DB/원격 저장 검증 아님.
- Frontend `tsc --noEmit --incremental false` PASS. 패턴 검사는 첫 실행의 sandbox `/bin/sh EPERM`을 기록하고 해당 읽기 전용 검사만 제한 밖에서 재실행해 PASS.
- Runtime: Node22.23.1, 설치된 Vitest3.2.4/Jest30.3.0. 기존 의존성을 링크해서 검증했고 설치된 Next16.2.10과 manifest16.3.8 차이는 남아 있음. lockfile 기반 CI/build 검증은 원격 게시 후 필요. 의존성 manifest/lockfile 변경 없음(앱 version만 증가).
- Host: WSL load 약1.5, memory 여유9GB 이상, swap0; 최소 worker 직렬 실행. Docker CLI는 WSL interop 오류로 확인 불가하나 이번 단위 검증은 DB/컨테이너를 사용하지 않음. 새 서버/브라우저는 띄우지 않음. 테스트 프로세스 자연 종료, 이번 검증용 dependency symlink 3개는 종료 후 제거.
- main 대비 25개 source/test/API docs + task2 + 앱 manifest2/CHANGELOG2 = **31 paths**. Prisma/마이그레이션/배포/워크플로/lockfile diff0, committed-tree `diff --check` PASS, touched TODO/FIXME/HACK/XXX0, 신규 미추적 source import 없음.
- 사용자 요청에 따라 전용 `hotfix/six-team-penalty-20261030` 브랜치를 준비. 원격 push + main 대상 초안 PR 생성은 자동 승인 검토가 '코드 원격 전송 및 PR 생성에 별도 명시 승인 필요' 사유로 거절해 **미실행**. 재시도/우회 없음. 사용자 승인 대기.
- 원격 CI/Copilot, 배포 후 실제 저장·공식화 및 390/768/1440 화면 검증은 미완. 로컬 테스트를 배포/시각 검증 완료로 표시하지 않음. 최종 main 머지와 production 승인은 사용자 직접 수행.

### PR CI 후속 — 상세 페이지 회귀 계약 동기화

- main #2104 / alpha(dev) #2105 게시. 사용자가 원격 게시와 alpha 반영을 명시 승인. main 최종 머지·production 승인은 사용자 직접 수행.
- main Web CI에서 전체9948개 중 상세 페이지의 기존 링크5개 기대2건만 실패(844 files 중843 PASS). 제거된 링크를 요구하는 stale assertion을 실제 경기 카드5개 유지 + 경기 상세 링크0개 계약으로 갱신. CI RED는 run41065438245/job124095377701. 해당 파일만 좁게 재검증 후 양쪽 PR에 동일 반영.
- Copilot은 gh edit와 공식 REST 요청을 접수했으나 현재 두 head 리뷰0건. clean으로 간주하지 않으며 리뷰 도착을 별도 확인.
- alpha before: 배포SHA2708c614993e, 공개 대진표·일정390/768/1440 baseline 캡처 완료. 상세링크5/결선탭1 및 선정카드 흰색·이미지없음 확인. console/network/pageerror0, browserPID8510/parent8413 정상종료. 증거는 alpha worktree `tmp/qa-six-team-hotfix/before/`.
- 상세 페이지 단일 파일 재검증 **38/38 PASS** (86.78s, worker1), CI의 stale 링크 기대2건을 실제카드5/링크0 계약으로 GREEN. 기존341개와 합산 관련379개 검증. main diff32 paths(추가 test1), alpha diff30 paths. 앱 소스 추가 수정 없음.


## 2026-10-30 alpha 반영 요청

- 사용자가 main 핫픽스와 함께 alpha 반영도 명시 승인. 최신 origin/dev2708c6149 기준 전용 브랜치 `fix/six-team-penalty-alpha-20261030`에 소스 커밋만 적용. main용 1.12.3 버전/Changeset 소비는 포함하지 않음.
- 원본 dev WIP와 25개 source/test/API docs가 개행을 제외하고 전부 일치. 기존 원본 dev 검증과 main 기준 frontend280/backend61 및 타입·패턴 PASS를 참조. 동일 로컬 전체 검증은 반복하지 않으며 dev 기준 CI를 실행.
- 두 Changeset 유지, diff --check PASS. main 핫픽스는 별도 브랜치/PR, 최종 main 머지·production 승인은 사용자 직접 수행.
- dev PR 검사·Copilot 완료 후 dev 머지와 alpha 배포 SHA 확인. 실제 사용자/admin 390/768/1440 및 승부차기 저장·공식화는 접근 가능한 인증/안전한 시나리오 전제하에 검증하고, 미실행 항목은 별도 표시.


## 2026-10-30 승인 후 머지 및 main → dev 동기화

- 사용자 최신 승인: “진행해줘 main도 다 해줘”. 이번 핫픽스는 Copilot 미생성 상태를 자체 리뷰로 진행하고 main/dev 머지와 배포까지 수행한다. GitHub 보호 정책은 우회하지 않으며 Copilot clean으로 표시하지 않는다.
- 자체 리뷰는 main4c2e8e536 / alpha67a660f55에 기록. 양쪽 PR의 API/Web/Gates 전체 SUCCESS, main CodeQL SUCCESS, 미해결 스레드0 및 정확한 target/head 검증 후 일반 merge commit 사용.
- alpha #2105 merge `a7c520c2f3f359b89cf50d26160ceba392c29e2e` (14:40:45UTC), main #2104 merge `b50074f90ff602eff47b21b0d2577bcc0377c57b` (14:46:22UTC). 양쪽 서버 반영은 후속 CI/deploy 진행 중이며 머지=배포 완료로 표시하지 않는다.
- 저장소 정책에 따라 origin/main을 dev 기준 격리 branch로 흡수. 충돌은 두 task 문서뿐이며 main의 전체 검증 이력과 dev의 alpha 반영 요청을 함께 보존한다. 앱 소스·Prisma·미승격 dev 기능은 유지한다.
- main에서 이미 소비한 두 Changeset은 dev에서도 제거하고 API/Web package1.12.3 및 CHANGELOG를 동기화한다. 다른 미소비 Changeset은 유지한다.
- 현 production 공개 header는 release1.12.3 / SHA dcab2c77e4. 기존 배포 계약이 app version1.12.3+patch를 계산하므로 후보 production header는1.12.4다. 버전 계산 스크립트 변경 없음.
- alpha Wait-for-CI 제한35분이 실제API CI(직전약50분)보다 짧다. 같은 SHA CI 성공 후 대기 시간 초과로 실패한 alpha run만 재실행한다. 진행 중 SSM/서버 activation은 취소하지 않는다.
- 남은 검증: 최신 alpha/prod serving SHA·health, 공개 대진표/일정390/768/1440 AFTER와 before 비교. 관리자 로그인 수단 미제공이므로 실제 저장·공식화는 아직 미검증이며 원격 경기 결과를 임의 수정하지 않는다.
