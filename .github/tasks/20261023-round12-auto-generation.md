# 12강·8강 자동 대진 생성 분기 수정

Status: Deployed (administrator mutation QA not run)
**Owner**: Codex (단일 실행)
**Created**: 2026-10-05

## Context
사용자가 참가 확정 후 12강 조 하나에 12팀을 배정하고 4팀 부전승·8팀 일반 경기를 만들려고 하지만 대진 입력 흐름이 막힌다고 보고했다.
현재 자동 생성 handler가 round12와 quarter를 조별리그로 잘못 분류한다.

## Goal
기존 화면에서 12팀·부전승4팀 구성은 일반 경기4개를, 8강8팀 구성은 일반 경기4개를 생성한다.

## Original Conditions
- [x] 12강 조 하나에12팀·부전승4팀·일반경기4개 (컴포넌트 검증).
- [x] 부전승은 기존 직접 입력으로 저장하며 가짜 경기/점수를 만들지 않는다.
- [x] 조별리그 회전수 선택·생성 계약 유지.

## User Scenarios
조 카드에서12팀배정 → 직접 입력/12강/부전승으로4팀지정 → 대진 자동 생성 → 일반경기4개 확인.

## Test Scenarios
- [x] 실제 컴포넌트 클릭:12강/8강이 리그모달 없이4경기 생성·목록표시, 부전승팀 제외.
- [x] 부전승 미지정은 사유표시·생성0.
- [x] 기존 직접입력 부전승 폼과 조별리그 회귀검증.

## Parallel Work Breakdown
병렬화 없음. Owned: bracket-tab.tsx, bracket-tab.test.tsx, 이문서, 필요시 scoped changeset.
Forbidden: API/DB/schema, Alpha기존대회데이터, 공유 EntityPicker, 기존 작업트리 WIP.

## Acceptance Criteria
- [x] 좁은 RED→GREEN과 관련 폼/조별리그 테스트 PASS.
- [x] 변경은 로직분기만이며 기존 UI/저장계약 유지.
- [x] 로컬검증과 Alpha실측을 구분해 보고.
- [x] dev 반영: PR #1618, merge ed0a4e85a.
- [x] Alpha 배포 실측: ed0a4e85a, 실행37301483732 SUCCESS.
- [ ] 로그인 관리자 자동 생성 클릭 실측 (인증 세션 없음).

## Tech Debt Resolved
추가된 round12/quarter enum을 놓친 녹아웃 판별 수정.

## Security Notes
권한/인증/비밀/DB 변경 없음. .env읽기 없음.

## Risks & Dependencies
실제 사용자 입력 실패의 정확한 오류문구는 아직 제공되지 않았다. 자동생성 분기 오류는 별도로 코드에서 확정.
Alpha 로그인 클릭검증에는 인증된 관리자 브라우저 필요. 로컬 Next서버 시작금지.

## Ambiguity Log
사용자는12강조1개/12팀/부전승4팀/나머지경기 구성을 재확인했다.
부전승은 Game이 아닌 별도 조 항목이라 경기일정표에는 표시되지 않는다. UI재설계는 이로직수정에 포함하지 않는다.

## Progress Snapshot
- 최신 origin/dev 576039adc 기준 확인. 루트파일 차이는 CRLF이며 두 변경대상에 substantive WIP없음 확인.
- 회귀테스트 추가 후 RED실행 예정. 자동생성 분기수정은 아직 미적용.
- Load0.06, available14.6GB, swap0. Docker실행불가, 로컬서비스 미기동.
- RED: 기존 handler로 신규3개 회귀테스트 모두 FAIL. 12강/8강 모두 조별리그 회전수 모달로 진입해 경기 생성0, 부전승 미지정 안내도 실행되지 않음.
- 수정: 녹아웃 판별을 group.phase !== 'group'으로 통일. 12강/8강 기존 시드페어링 및 부전승 검증 경로가 실행됨. 프로덕션 코드는 한줄 로직 변경.
- GREEN: bracket-tab15 + bracket-group-card7, 총22 PASS. 사용자 대진 생성 클릭에서 4개 경기, 고유 출전팀8개, 부전승팀 제외, 경기 목록 표시 및 부전승 직접 입력/자리수정 확인.
- 실행: apps/v1_web에서 node node_modules/vitest/vitest.mjs run --config ../../tmp/qa-round12-generation/vitest.config.mts src/app/admin/tournaments/[id]/bracket-tab.test.tsx src/app/admin/tournaments/[id]/bracket-group-card.test.tsx --maxWorkers=1 --minWorkers=1.
- root node_modules의 TanStack persist 패키지 누락으로 카드 suite 최초 import 실패. 공유 의존성 수정 없이 이전 QA에 준비된 lockfile버전 실제패키지를 임시 config alias로 연결해 해결. 추가 mock으로 오류를 숨기지 않음. production/source는 임시config를 import하지 않음.
- CRLF 원본 보존. git -c core.whitespace=cr-at-eol diff --check PASS, substantive diff 확인: 코드1줄 + 테스트3개. touched path debt marker0, 신규 production import없음. patch changeset 추가.
- CLI persona: 관리자 컴포넌트 클릭(jsdom), viewport 해당없음. 테스트 프로세스 정상종료, 브라우저·로컬Next·서비스·원격데이터 변경없음.
- Alpha 로그인 저장/자동생성/viewport 실측 NOT RUN. 사용자 실제 화면의 정확한 입력 실패 원인은 미확인, 자동생성 오류만 RED→GREEN으로 증명. commit/PR/push/배포없음, precommit typecheck/CI 및 committed-tree 검증 미실행.

- 격리작업트리 precommit frontend tsc PASS (incremental false). 실제배포대상4소스가루트검증본과개행정규화후동일. capture script node --check 및 git diff --check PASS, debt marker0.

- PR #1618의 committed9-file diff 검토 및 CI Gates/API/Web SUCCESS. dev merge ed0a4e85a 완료, Alpha37301483732 진행 중.
- 사용자 요청 범위는 코드의 Alpha 배포. 실제 기존대회 자동생성·팀배정·진출연결은 변경하지 않는다.

- dev commit ed0a4e85a의 CI37301483730 완료: Web/API/Gates SUCCESS. Alpha37301483732가 CI대기를 마치고 이미지빌드 시작.

- Alpha실제header ed0a4e85a 확인 및 공개대진표3폭 검증 PASS. 관리자 자동생성 실제저장 QA는 인증세션이 없고 기존사용자대회를변경하지 않으므로 NOT RUN. 미검증 항목을 mock성공/실제저장으로 대체하지 않음.
