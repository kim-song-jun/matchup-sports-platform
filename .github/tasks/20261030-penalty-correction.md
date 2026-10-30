# 운영 콘솔 승부차기 결과 정정

Status: Alpha PR Preparation (main hotfix prepared separately)
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

## 2026-10-30 alpha 반영 요청

- 사용자가 main 핫픽스와 함께 alpha 반영도 명시 승인. 최신 origin/dev2708c6149 기준 전용 브랜치 `fix/six-team-penalty-alpha-20261030`에 소스 커밋만 적용. main용 1.12.3 버전/Changeset 소비는 포함하지 않음.
- 원본 dev WIP와 25개 source/test/API docs가 개행을 제외하고 전부 일치. 기존 원본 dev 검증과 main 기준 frontend280/backend61 및 타입·패턴 PASS를 참조. 동일 로컬 전체 검증은 반복하지 않으며 dev 기준 CI를 실행.
- 두 Changeset 유지, diff --check PASS. main 핫픽스는 별도 브랜치/PR, 최종 main 머지·production 승인은 사용자 직접 수행.
- dev PR 검사·Copilot 완료 후 dev 머지와 alpha 배포 SHA 확인. 실제 사용자/admin 390/768/1440 및 승부차기 저장·공식화는 접근 가능한 인증/안전한 시나리오 전제하에 검증하고, 미실행 항목은 별도 표시.
