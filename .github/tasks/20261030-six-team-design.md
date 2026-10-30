# 6강 대진표 디자인 통일

Status: main PR #2104 Checks/Review Pending
Owner: Codex (single agent)

## Context
사용자 지정 alpha 대회의 6강 전용 레이아웃이 조별+결선과 다르고 어드민 결승 카드가 잘린다.
## Goal
기존 결선 카드와 제목/간격/연결선 디자인을 재사용하고 로컬에서 실제 화면을 확인할 수 있게 한다.
## Original Conditions
6강→다음 단계 연결선 생략 유지. 득점 기반 선정 규칙과 API/데이터 변경 금지. 기존 사용자/어드민 카드 재사용.
## User Scenarios
6강 3경기, 선정 대기, 준결승과 결승을 확인한다. 좁은 화면에서는 내부 가로 스크롤한다.
## Test Scenarios
기존 6강 렌더/필터/선정/교환 회귀 테스트. 로컬 실제 API 기반 1440/768/390 시각 검증 및 console/network 확인.
## Parallel Work Breakdown
병렬 없음. Owned: six-team-bracket-layout.tsx, six-team-bracket.tsx, six-team-admin-bracket.tsx, bracket-canvas-workspace.tsx, 관련 테스트/QA 도구/문서. Forbidden: 기존 WIP, API/DB, 원격 데이터 변경, 배포.
## Acceptance Criteria
- [x] 기존 결선과 같은 카드 너비/라운드 제목/표면 사용.
- [x] 연결선이 결승 팀 행에 연결되고 카드에 겹치지 않음.
- [x] 문서 가로 넘침 없이 결승까지 내부 스크롤 가능.
- [x] 로컬 확인 URL 제공.
## Tech Debt Resolved
고정 SVG 백분율 좌표를 실제 카드/팀 행 측정으로 대체.
## Security Notes
인증은 런타임 환경변수만 사용. 쿠키/비밀번호 저장 금지. 실제 대회 변경 금지.
## Risks & Dependencies
origin/dev 2708c6149 기반 격리 worktree. 로컬 프론트엔드는 alpha API를 사용한다.
## Ambiguity Log
사용자가 기존 조별+결선 디자인 재사용과 로컬 확인을 명시적으로 승인. 이번 로컬 확인 요청이 기본 alpha 전용 규칙에 우선한다.
## Progress Snapshot
기존 alpha 캡처는 루트 tmp/qa-round6. alpha 배포는 요청 범위에 없음.

- public 카드 180px, admin 카드 232px와 기존 canvas 간격/표면 재사용. public 라운드 pill/경기 번호, 부전승 표면 통일.
- 6강 원천 선 0 유지. 결승 직행/준결승 두 경로는 실제 카드와 팀 행을 ResizeObserver로 측정. 모바일 가로형 카드에서도 같은 좌표 계약 사용.
- 회귀: public 6 + admin canvas 17 + admin mobile 47 = 70 PASS. tsc --noEmit --incremental false PASS. narrow serial workers=1.
- 수동 QA: 실제 계정 UI 로그인 및 hydrate 후 실제 alpha 대회 읽기. public/admin × 1440/768/390 = 6/6 PASS. document width=viewport, 결승 행 연결 오차0, 최우측 스크롤 캡처로 결승 완전 노출 확인.
- 증거: 이 worktree `tmp/qa-six-team-design/{public,admin}-{1440,768,390}{,-final}.png`, `evidence.json`.
- pageerror 0. 네트워크 대진 조회 실패 없음. 조회 전용 중계가 차단하는 socket.io POST/클라이언트 오류로그 POST의 403은 로컬 제한으로 기록. 실시간 통신과 원격 저장은 이 미리보기 범위 밖. 콘솔의 네트워크 오류도 이 차단과 연관되므로 오류0으로 보고하지 않음.
- 최종 검증 브라우저 PID3180/parent24176 종료, 세션 폐기. 미리보기는 사용자 확인을 위해 유지: WSL preview PID921 / Next PID933. 둘 다 loopback만 노출.
- 최종 console 캡처에서 차단된 POST의403과 websocket upgrade400 확인. 중계는 WebSocket upgrade를 지원하지 않는다. socket 식별자는 증거에서 마스킹.
- 최초 0.0.0.0 실행은 자동승인에서 외부 노출 위험으로 거절되어 127.0.0.1로 수정. 현재 웹과 중계 모두 localhost 전용.
- Windows→WSL 파일 감지 지연을 확인해 재시작 후 최종 캡처. 이후 WATCHPACK_POLLING=true 적용.
- 기존 설치 의존성 Next16.2.10로 로컬 실행(현재 manifest16.3.8). 배포/의존성 변경은 하지 않음.
- git diff --check PASS, touched TODO/FIXME/HACK/XXX 없음. 커밋/PR/alpha 반영 없음. next-env 자동변경 제외.

## Local Preview

### Follow-up: 경기 상세 링크 제거

- 사용자 요청으로 6강/준결승/결승 카드 아래 경기 상세 링크 5개 제거. 링크 전용 하위 props/import도 제거. 기존 호출자 prop 호환성은 유지.
- 기존 카드와 24px 간격 유지. 링크 터치영역 삭제로 전체 대진 높이696→552px; ResizeObserver가 결승 연결선을 새 높이에 재정렬.
- 6강 공개 회귀6개 PASS. 익명 로컬 QA 1440/768/390 3/3 PASS: 상세 링크0, 가로 넘침0, 연결선 두개 모두 결승 팀 행 일치, console/network/pageerror0.
- 증거: `tmp/qa-six-team-design-no-detail/`. 브라우저 PID21972/parent21764 종료. 미리보기 서버 유지.
- 후속 요청: 각 6강 어드민 경기 카드에서 반복 라운드명 제거, 경기 번호만 표시(데스크톱/모바일). 라운드 열 제목/편집 시트와 접근성 컨텍스트는 유지. 사용자 카드는 이미 번호만 표시.
- 일정 카드에서도 pure knockout의 라운드 배지(내부quarter→8강, semi→4강)를 제거. 일정 묶음의 실제 라운드 제목만 표시하며 일정 확정/미정/진행중 행에 동일 적용.
- 순수 토너먼트 일정·순위표의 결선 탭 제거. 일정도 전체+라운드 직접 필터, 기존 URL선택/내팀/라이브/미정 분류 유지. 조별+결선과 정규리그는 기존 흐름 유지.
- 추가 Owned: bracket-page-client.tsx/.test.tsx, schedule-content.tsx/.test.tsx, bracket-canvas.tsx/.test.tsx, mobile 관련 테스트. API 변경 없음.
- 후속 회귀: 공개6 + admin17/mobile47 + bracket-page49/schedule60 = 관련179개 PASS(최종 schedule 배지 변경 후 해당60개 재확인). 기존 조별+결선 테스트도 PASS.
- 최신 수동 QA: 일정/대진표/어드민 각1440/768/390 =9/9. 일정 필터 전체5, 6강3, 준결승1, 결승1 실측. 두 탭에 결선 필터0, 대진표 경기상세 링크0, 일정 카드의8강/4강배지0, admin 번호만 표시 확인.
- 최종 캡처는 `tmp/qa-six-team-design/`; browserPID18392/parent26524 정상종료, 세션폐기. 기존 로컬 socket/log403 제한은 동일, pageerror0.
- 후속 색상 요청: 확정된 부전승 카드 팀명도 blue700 적용(사용자/어드민 공통). 대기 팀명은 기존색. 헤더는 typography 클래스 우선순위에 덮이지 않도록 inline token색으로 고정.
- 색상 회귀6개 PASS. 실제 선정된 팀의 로컬 1440/768/390 computed text rgb(27,100,218), 헤더와 일치 확인. 증거 `tmp/qa-six-team-design-no-detail/`. alpha 데이터 수정 없음.
- 후속 정렬/로고: 결승 직행 설명 제목에 SectionTitle compact 적용(기본20px 내부 패딩 제거), 본문 기준선과 일치. public 부전승 등록ID로 원본 경기의 HOME/AWAY 실제 팀ID/로고 전달. 비공개 팀의 이미지 미노출 유지.
- admin은 기존 등록목록을 desktop/mobile에 전달해 부전승 팀ID 확인 후 기존 /teams/:id 조회 훅으로 저장 로고 사용. 새 API/계약 없음. 로고는 기존 TeamAvatar 로딩/실패 보호 유지.
- 추가 Owned: bracket-canvas-mobile-screen.tsx. 로컬 실제 사용자/admin 각1440/768/390 6/6에서 부전승 로고 naturalWidth>0, 팀명blue700, 본문/제목 left차0 확인. 증거 `tmp/qa-six-team-design/`. 브라우저 PID23904/parent14768 종료, 세션폐기. 기존 실시간/로그 중계제한만 남음.
- 최신 관련 테스트 public7/admin17/mobile47 =71 PASS, tsc --noEmit --incremental false PASS. 타입검사에서 앞선 신규 필터 테스트 fixture의 status 누락2건을 발견해 명시적 scheduled로 보완 후 PASS.

- public: http://localhost:3013/tournaments/a90df6d5-47e9-40f9-93ef-f679ce8da858/bracket?tab=standings
- admin: http://localhost:3013/admin/tournaments/a90df6d5-47e9-40f9-93ef-f679ce8da858/bracket
- 브라우저에서 기존 계정으로 로그인. 자격정보 파일/쿠키 저장 없음.
- 재시작: WSL에서 이 worktree 루트의 `node scripts/qa/preview-six-team-design.cjs`. 설치된 v1_web 의존성 필요(현재 루트 앱 node_modules junction 사용).
- 중계 8122, 웹3013. 실제 alpha GET/HEAD와 로그인/로그아웃만 허용. 나머지 요청은 명시적403으로 실패.

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
