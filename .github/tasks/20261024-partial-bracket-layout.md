# 부분 진출 연결 대진표 배치 회귀 수정

Status: Complete (deployed; current-data visual QA PASS)
**Owner**: Codex (단일 실행)
**Created**: 2026-10-05

## Context
사용자 지정 alpha 대회 ad120000-0000-4000-8000-000000000001에서 8강 팀 입력 뒤 배치가 깨지고 부전승만 선으로 이어지는 현상을 보고했다.
공개 API: 12강4경기/부전승4팀, 8강4경기/모두팀배정, 4강2/결승1, 모든 bracketSources=[].

## Goal
부분 연결에도 라운드별 기존 공유 캔버스 배치를 유지해 카드 겹침과 뒤 라운드 하단 밀림을 없앤다. 진출 관계를 임의로 만들지 않는다.

## Original Conditions
- [x] 8강 부전승팀 배정 전후 경기 카드 순서·공통높이 유지.
- [x] 부전승 연결이 일부 생겨도 8강 카드 겹침 없음.
- [x] 실제 저장된 진출 연결 또는 명시적 부전승팀 배정만 선으로 표시.
- [x] 사용자 대회/팀/경기/배정은 읽기전용으로 보존.

## User Scenarios
운영자가 12강을 편성하고 8강에 부전승팀을 먼저 배정한다. 4강/결승이 아래로 밀리지 않으며 나중에 실제 진출 관계를 등록하면 선이 나타난다.

## Test Scenarios
- [x] RED→GREEN: 실제 Alpha와 같은 4개 bye 연결만 있는 12강/8강/4강/결승.
- [x] 배정 전후 공통높이896, 라운드별 카드 비겹침 및 순서 유지.
- [x] 기존 완전연결14edges/미정/legacy 위치/명시연결 테스트 유지.
- [x] Headed Alpha before 1440/768/390 화면·DOM좌표·console/network 캡처.
- [x] 배포 후 동일viewport after 실측.

## Parallel Work Breakdown
병렬화 없음. Owned: tournament-bracket-graph.ts/.test.ts, scripts/qa/capture-round12-partial-connections.cjs, 이문서, scoped changeset.
Forbidden: 기존 로컬 자동생성 작업 변경, API/DB/대회 데이터변경, 임의 승자추정 및 저장되지 않은 진출선 생성.

## Acceptance Criteria
- [x] 부분연결과 완전연결 단위·renderer 회귀 PASS.
- [x] 코드/디자인/권한 변화와 실제데이터 상태를 구분해 보고.
- [x] Alpha after 확인 전 시각QA 완료로 보고하지 않음.

## Tech Debt Resolved
edges0에서만 공통캔버스를 쓰고 edges1 이상이면 미연결 라운드까지 전역 cursor로 직렬 배치하던 회귀를 수정한다.

## Security Notes
공개 API 및 공개 headed 브라우저만 사용. .env/로그인/쿠키/storageState 읽기없음. Alpha write없음.

## Risks & Dependencies
일반 진출선 부재는 bracketSources가 비어 있기 때문이며 팀 직접 배정은 그 관계를 기록하지 않는다.
현재 8강 어웨이팀도 배정돼 있어 승자 연결 전 해당 자리의 직접팀 배정을 해제해야 한다. 이작업은 데이터 변경 없이 표시 로직만 수정한다.

## Ambiguity Log
새 UI안/스타일 변경 없이 기존 미정 상태의 배치를 유지하는 그래프 좌표 로직 회귀 수정이다(CLAUDE.md UI착수 규칙의 로직 전용 변경).
12강2/3/6/7 경기와 8강1/2/3/4의 참가팀이 하나씩 겹치지만 이를 승자 관계로 추정해 저장/렌더하지 않는다.

## Progress Snapshot
- 기준 origin/dev 및 Alpha576039adc. 기존 graph 두파일 substantive WIP없음 확인.
- before 증거: tmp/qa-round12-partial-connections/before-{1440,768,390}.png / before-evidence.json.
- Alpha 실제1368px canvas, 8강2/3 카드간격80px 대비카드높이111px로겹침. 4강/결승은 y952/1096/1240px까지 밀림.
- 선5개 = 부전승4 + 결승→우승1. 일반 진출선0. 각viewport 문서 가로폭 정상, baseline 로그아웃my-fixtures401/console1, pageerror0.
- 소유 headed Windows browserPID26368/parent26096 정상close, 인증정보생성없음. 웹서버/서비스시작없음.
- 실제 공개 API 다운로드는 /tmp/teameet-round12-public.json, synthetic테스트 공개데이터로 제한.
- RED: 실제와 같은 부분bye4edge 상태가1328px, 연결전896px 유지조건 FAIL.
- 수정: 후속경기의 어느 자리에든 진출관계가 미등록이면 기존공통캔버스 배치유지. 선은 기존 실제edges그대로 렌더, 새관계추정없음. 양자리가 모두 연결된 대진은 기존HOME/AWAY트리배치 유지.
- GREEN: graph11 + renderer11, 총22 PASS. 기존완전연결14edges/미정/legacy 위치/부전승계약 유지. Alphaafter는 배포후확인예정.
- 사용자에게 현재8강 어웨이 직접배정4팀을12강2/3/6/7승자대기 자리로 바꾸는 별도 선택 요청. 답변전 원격데이터 변경금지.
- 앞선dev반영요청에 따라 자동생성수정(task20261023)과이번배치수정만 격리/tmp/teameet-round12-bracket-flow에서 dev대상PR준비.

- 격리작업트리 precommit frontend tsc PASS (incremental false). 실제배포대상4소스가루트검증본과개행정규화후동일. capture script node --check 및 git diff --check PASS, debt marker0.

- PR #1618, head986ae09118893cd8b4ab83c68228f400bd5e9614: 관리자22+graph/renderer22 PASS, 격리 tsc 및 pattern PASS. PR CI Gates/API/Web 모두 SUCCESS. 직접 committed diff 검토 및 unresolved thread0 확인. Copilot 재요청에도 리뷰가 생성되지 않아 Copilot clean으로 판정하지 않음.
- 사용자는 승자대기 변경을 승인한 후 "잘못 생각하고 있었다"고 정정하여 데이터 작업 보류. 이후 코드의 alpha 배포를 명시 요청. 이번 세션에서 Alpha mutation0.
- dev merge ed0a4e85a1e5ef068000b6b81584138efd552f81 완료. Alpha 실행37301483732가 동일SHA의 CI37301483730을 기다리는 중.
- 로컬dev FF 완료. 공유 충돌7개는 CRLF만 다름을 확인하고 tmp/qa-round12-partial-connections/local-dev-backup/shared-ff-collisions에 백업. 원본소유9개도 같은상위backup에 보존. 현재dev 내용에 원래CRLF 스타일 복원, 다른 WIP 내용 보존.
- 배포 전 공개API 재확인: 30 fixtures/12 bracketSources. 초기 before의 source0에서 외부 변경됨(8강/4강/결승/3위전 연결 및12강 한경기상태). 에이전트가 연결/팀/상태를 변경한것 아님. after는 현재 실제데이터 기준으로 검증하며 초기 partial상태의 동일데이터 전후 실측으로 표현하지 않는다.

- dev commit ed0a4e85a의 CI37301483730 완료: Web/API/Gates SUCCESS. Alpha37301483732가 CI대기를 마치고 이미지빌드 시작.

- 독립 적대적 정적 리뷰가 PR #1618에 게시됨(2026-10-05T11:11:31Z, exacthead986ae091). 변경9/9와 생성 페어링·mutation/서버검증·공개렌더 교차검토, actionable finding0. 자체 runtime 검증을 했다고 주장하지 않은 COMMENT이며 코드배포의 검증은 이세션 실제CI/Alpha증거로 별도 기록.

- Alpha37301483732 SUCCESS, 실제페이지 x-teameet-commit=ed0a4e85a1e5ef068000b6b81584138efd552f81. 1440/768/390 공개 headed 화면과 단계이동 PASS. 문서 가로넘침0, 각column겹침0, canvas936px, quarter 카드간격113px, 선15개. JS pageerror0, baseline my-fixtures401/console1 유지.
- 최종 owned browserPID18956/parent6288 정상close. 재캡처의 SSR pre-hydration 클릭 유실은 QA도구에서 실제 hydration완료상태를 기다리도록 해결; runtime 변경없음.
- 검증 증거는 docs/visual-qa/round12-partial-connections/2026-10-05/. 실제 대회데이터가 before→after 사이 바뀌었으므로 동일데이터 비교로 주장하지 않음. 관리자 인증 mutation QA NOT RUN. 별도 GitHub Advanced Security check FAILURE(원인 annotation exit1뿐)는 PASS로 숨기지 않음.
