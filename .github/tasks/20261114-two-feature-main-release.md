# main 선택 승격: 빈 명단 익명 운영 + 퀸즈컵 순위 보정

Status: In Progress
Owner: Codex (single agent)
Created: 2026-11-14

## Context
사용자가 #2394 설명 후 범위를 "두개 내용만"으로 제한하고 테스트를 마친 main 머지 직전 상태를 요청했다. Copilot 리뷰 없이 진행하며 나머지 준비를 승인했다. dev 전체 승격은 이 요청을 충족하지 않는다.

## Goal
최신 main을 기준으로 #2392와 #2393만 포함한 검증된 main 대상 PR을 준비하고 머지하지 않는다.

## Original Conditions
- [x] main 900539b7c 기준으로 90479696b, 6030b9afb, e652493bc, c53714726만 cherry-pick(충돌 없음).
- [x] API/Web manifest 1.20.3, 양쪽 CHANGELOG에 두 항목만 반영하고 두 Changeset 소비.
- [ ] 선택 후보의 테스트·타입/빌드·DB 통합·릴리스 정책·CI 확인.
- [ ] main 대상 PR 준비. main 머지·운영 승인·운영 DB 쓰기는 금지.

## User Scenarios
1. 빈 홈/원정/양쪽 명단으로 경기 시작 → 익명 득점 → 종료 가능, 가상 선수와 개인 통계를 만들어내지 않는다.
2. 퀸즈컵의 저장 규칙을 공지 순서로 한 번 보정하며 결선 배정과 공식 결과는 보존한다.
3. main 대비 다른 dev의 SEO·로그인·개인정보/검색/지도 수정은 포함하지 않는다.

## Test Scenarios
- API games.service 및 Queens repair unit, Web operate-console/action-target 관련 테스트.
- API/Web typecheck, CI build 및 DB integration. 로컬 Docker 미가동으로 DB 통합은 CI가 수행한다.
- 승격 Changeset gate: 미소비 0, 두 버전/CHANGELOG 갱신, 소비 이력 두 건.
- main 대비 허용 경로·선택 커밋 patch 비교. schema/migration/lockfile/의존성 변경 0.

## Parallel Work Breakdown
에이전트 병렬화 없음. Owned: 위 두 PR의 원래 파일, 두 manifest/CHANGELOG, 소비한 Changeset 두 개, 이 문서와 선택 릴리스 검토 문서. 기존 #2394 원격 브랜치는 보존한다. 작업 중 만든 release-1203-queens worktree의 미푸시 merge는 승격 후보로 쓰지 않는다.

## Acceptance Criteria
- [ ] 두 기능 밖 runtime diff 0.
- [ ] 선택 후보 최신 head CI GREEN, 충돌 없음, 미해결 필수 검사 0.
- [ ] 릴리스/검증 근거와 사용자 main 머지 전 남은 동작을 명시한다.

## Tech Debt Resolved
dev 전체를 선택 승격으로 오인하는 릴리스 범위 혼동을 제거한다. #2394는 dev 전체 승격용 버전 PR이므로 이 선택 후보와 구분한다.

## Security Notes
사용자의 최신 지시가 이번 선택적 main PR 준비와 Copilot 생략을 승인한다. main 직접 push/머지, production environment 승인 및 운영 비밀값/DB 쓰기는 실행하지 않는다. .env 파일을 읽거나 출력하지 않는다.

## Risks & Dependencies
알파 e3d79cd07은 두 기능과 다른 dev 변경을 함께 포함한다. main 기반 선택 후보와 동일한 트리가 아니므로 기존 알파 성공을 이 후보의 실배포 검증으로 대체하지 않는다. 알파 DB의 퀸즈컵 대상은 absent로 확인됐다. 운영 공개 대회는 404여서 보정 전후 실측 미확인. main 자체에 이미 반영된 변경은 선택 제외 대상이 아니다.

## Ambiguity Log
2026-11-14: 앞선 #2394에 추가 요청은 "두개 내용만"이라는 후속 지시로 범위가 좁혀졌다. #2394의 dev ancestry를 main으로 가져오지 않고 새 main 기반 후보를 만든다. 버전 번호는 #2394의 1.20.3을 유지한다.

## Progress Snapshot
Phase 1 source selection complete. Phase 2 local validation complete. Phase 3 exact-head CI / main PR pending.

- API unit: 124/124 PASS (games.service + Queens repair), 2 suites, serial.
- Web unit: 117/117 PASS (operate-console-core + action-target-picker), 2 files, one worker. Existing act/key fixture warnings remain; not reported as browser console evidence.
- API `tsc --noEmit -p tsconfig.spec.json` / surface gate PASS; Web `tsc --noEmit` / pattern gate PASS.
- main release policy PASS (both versions/changelogs, 2 consumed Changesets, pending 0); versioning contract 24/24 PASS; deployment order/failure propagation 4 scenarios PASS; both deploy scripts bash syntax PASS; diff check PASS.
- Relevant runtime files are byte-identical to the alpha-tested e3d79cd07/dev files, but the candidate's full tree differs from alpha. No claim of candidate-wide alpha deployment verification.
- Browser adapter unavailable; native Chrome observation request ended `Computer Use app approval timed out`. No clicks/auth/game writes or screenshots were completed. Manual authenticated empty-roster flow / 390,768,1440 evidence remains unverified; this is a documented tooling blocker, not a test PASS.
- 2026-11-14 23:20 KST re-fetch: main remains 900539b7c, dev remains e3d79cd07. Local Docker is stopped; DB integration/build are assigned to exact-head CI.
