# 대회 진행 단계의 결선 순서 수정

Status: In Progress (implemented; Alpha deployment/after QA pending)
Owner: Codex (단일 실행)
Created: 2026-10-05

## Context
Alpha `/tournaments/ad120000-0000-4000-8000-000000000001/bracket` 상단에서 조별리그 다음 4강·8강·12강이 역순으로 보인다. 경기 번호는 라운드마다 다시 시작하므로 진행 순서 기준이 될 수 없다.

## Goal
상단 단계를 조별리그 → 12강 → 8강 → 4강 → 결승 순으로 표시한다. 후속 요청: 조별 순위 A/B/C 정렬, 일정은 조별 → 결선 순, 실제 진행 중 경기는 여러 건 모두 최상단.

## Original Conditions
- [x] 결선 규모가 큰 순서대로 정렬하고 결승은 마지막에 둔다.
- [x] 경기 번호 동률 및 역순 번호 모두 올바르게 정렬한다.
- [x] 경기·팀·결과 데이터는 변경하지 않는다.
- [x] 조별 순위를 생성 순서 대신 조 이름 자연 정렬로 표시.
- [x] 확정/미정 일정 모두 조별 A/B/C → 12강/8강/4강/결승/3위전 순서.
- [x] live 상태 경기를 확정/미정 목록 양쪽에서 추출해 상단에 중복 없이 표시.
- [x] 페이지 뒤에 있는 live 경기도 발견하도록 cursor 페이지 순차 로드, 예정/진행 경기 polling.

## User Scenarios
관람자가 진행 중 대진표를 열면 실제 경기 진행 순서로 단계를 읽는다.

## Test Scenarios
- [x] 영문/한국어 라운드, 역순 경기 번호 및 동률 번호 CLI 회귀 검증 (4 시나리오).
- [x] 8강 진행 중이면 조별/12강은 완료, 4강/결승은 예정.
- [x] Alpha baseline 1440/768/390 실측.
- [ ] 수정 배포 이후 Alpha 1440/768/390 실측.
- API/fixture 계약 변경 없음. 기존 결승·3위전 제외·리그 테스트 유지.

## Parallel Work Breakdown
병렬화 없음. Owned: progress-stepper.tsx/.test.ts, 이 문서, scoped changeset, scoped QA 스크립트.
후속 Owned: tournament-display-order.ts, detail partition helper, bracket schedule wrapper, schedule-grouping/.test, schedule-content/.test, use-public-game-records.ts.
Forbidden: 타 작업의 substantive dirty 파일, API/DB/관리자 대진 편집 및 배정 변경. schedule-content.tsx는 status 표시가 있으나 git hash-object=HEAD(9c7d42c)로 substantive WIP 없음 확인 후 수정.

## Acceptance Criteria
- [x] 사용자 지정 순서 적용.
- [x] 좁은 production builder CLI 회귀 검증 PASS.
- [ ] 배포 이후 Alpha 화면 확인.

## Tech Debt Resolved
결승 외 결선 순서를 경기 번호 또는 서버 배열 순서에 맡기던 정렬을 라운드 규모 기준으로 수정한다.

## Security Notes
표시용 정렬만 변경. 인증·권한·API·데이터 쓰기 변경 없음.

## Risks & Dependencies
Alpha after 증거는 수정 버전 배포가 필요하다. 기존 공유 트리의 타 작업 변경은 보존한다.

## Ambiguity Log
사용자가 순서를 명시했고 기존 마크업·스타일은 유지하는 정렬 로직 수정이다. `5`는 결승의 예정 단계 번호로 별도 라운드가 아니다.
현재 진행은 공개 API status=live 기준(예정 시각 경과만으로 실제 시작을 추정하지 않음). 진행 경기 섹션은 일정 필터와 별개로 모든 현재 경기를 고정 표시한다.

## Progress Snapshot
- origin/dev fetch 완료. 기존 admin bracket / bracket graph 등 dirty 파일은 수정하지 않음.
- 라운드 팀 수 내림차순 → 동일 규모/알 수 없는 라운드의 경기 번호 순. 결승 마지막 유지.
- `node scripts/qa/verify-tournament-progress-round-order.cjs`: 실제 TS production builder를 ES2022로 변환해 Node assert로 정렬·상태 4 시나리오 PASS. 공유 node_modules 링크 수정 없음.
- RED→GREEN: `--baseline`은 HEAD 원본을 메모리로 읽어 실제 역순 assertion 실패, 수정 코드에서는 동일 assertion 통과. 작업트리 원복 없음.
- Vitest 실행 불가: pnpm의 sh 미설치 및 Windows에서 @vitest/utils 링크 해석 실패. 추가한 Vitest 테스트는 실행 완료로 보고하지 않음.
- Headed Alpha baseline: 1440/768/390 모두 조별리그·4강·8강·12강·결승 역순 확인. `5`는 예정 결승 단계 번호. documentWidth=viewport, pageerror 0. 로그아웃 my-fixtures 401/console error 1은 기존 baseline.
- 증거: `tmp/qa-tournament-progress-round-order/before-{1440,768,390}.png`, `before-evidence.json`. 브라우저 PID19096/parent12268 정상 종료. 로컬 웹 서버 시작/Alpha 데이터 쓰기 없음.
- 변경 배포 전이므로 after 화면, merge 및 committed-tree 검증 미완료. scoped diff whitespace 및 debt marker 확인 완료.
- 후속 Alpha baseline: API 그룹 B조/C조/A조 모두 sortOrder=0, 실제 table aria-label도 동일 순서(1440/768/390). 생성 시각은 응답에 없어 생성 순서는 확정하지 않고 서버 응답 순서로 기록.
- 확인 시 실제 liveStatus=live fixture 0건. Alpha 데이터 변경으로 경기를 만들지 않음. 여러 live(시간 미정 포함)·중복 제거·종료 시 일반 목록 복귀는 production helper CLI로 검증.
- 진행 경기 상단 고정은 bracket hub에서만 `prioritizeLiveGames`로 활성화. 일정 시간 확정 여부와 무관하게 나머지를 조별 → 결선 순으로 합친다. live 섹션은 기존 일정 카드/경기 상세 링크를 재사용한다.
- 추가 CLI PASS: schedule grouping/unscheduled grouping, 여러 live 및 dedup, live→ended, 실제 detail partition 함수의 A/B/C·숫자 자연 정렬·원본 배열 보존. UI renderer 회귀 테스트 추가(Vitest 실행은 기존 dependency blocker로 미확인).
- 후속 baseline browserPID10152/parent35640 정상 종료. 3viewport 가로 overflow 없음, pageerror0, 로그아웃 my-fixtures401/console은 기존 증거. 변경 코드의 Alpha after는 배포 후 확인 필요.
- 배포 착수: 최신 origin/dev9d7869721에서 `fix/tournament-progress-order-live` 격리 worktree 생성, 소유14파일만 복사.
- 기존 Ubuntu 의존성으로 화면/그룹/stepper Vitest72 PASS, 일정 권한1 PASS. 추가 page/partition 스위트는 누락된 persistence 패키지로 import 단계에서 막힘.
- 공유 node_modules를 바꾸지 않고 `/tmp/teameet-progress-order-validation-20261005`에 frozen-lockfile install. clean dependencies에서 프론트 tsc0 및 pattern check PASS. 추가 page 테스트는 native PostCSS binding 설치 후 재확인 예정.
