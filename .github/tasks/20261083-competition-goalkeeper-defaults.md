# Task 20261083: 대회 GK 유지와 어드민 관리
Status: In Progress
**Owner**: Codex
**Created**: 2026-10-14

## Context
PR #1919는 경기별 GK 저장을 제공하지만 어드민 출전 표에 GK가 없고 다음 경기에서 다시 선택해야 한다.
## Goal
대회·리그 참가 명단에 GK를 한 번 저장하면 이후 경기에도 유지하고 어드민에서 같은 설정을 관리한다.
## Original Conditions
- [ ] 어드민 출전 관리 표에서 GK 상태 조회 및 지정·해제.
- [ ] 여러 GK 허용, 해당 대회·팀에 한정해 유지.
## User Scenarios
팀장 또는 어드민이 GK를 저장하면 해당 대회의 시작 전 경기와 이후 생성 경기에서 동일한 GK를 사용한다. 시작·종료 기록은 당시 명단을 유지한다.
## Test Scenarios
- [ ] 저장/해제 전파, 다른 대회 격리, 시작된 기록 불변, 복수 GK, 제외/복귀 보존.
- [ ] 어드민 실제 API 저장/재조회, 조회 전용 권한, 실패 초안 보존.
## Parallel Work Breakdown
단일 에이전트 순차 작업. Owned: v1 roster API/loader/sync/matrix, 참가 선수 Prisma 필드 및 migration, release schema pins, hooks/MSW/어드민 표/테스트/문서. Forbidden: 타 작업트리/WIP/main.
## Acceptance Criteria
- [ ] UI A/B/C 비교와 사용자 선택 후 UI 구현.
- [ ] 좁은 계약 검증, CI, dev 머지, alpha 390/768/1440 실측 증거.
## Tech Debt Resolved
GK를 출전 여부와 분리해 참가 선수에 유지하고 캐시 무효화 범위를 전파와 맞춘다.
## Security Notes
기존 팀/대회 쓰기 권한과 경기 시작 잠금을 재사용. support/member 쓰기 금지.
## Risks & Dependencies
V1TournamentPlayer goalkeeper nullable 필드와 additive migration 필요. null은 기존 경기별 GK를 보존하는 호환 상태, 명시 true/false 저장 후에는 참가 명단이 정본.
## Ambiguity Log
대회 전체 시작 전 경기와 이후 생성 경기에 반영. 이미 시작·종료된 참가자 position snapshot은 수정하지 않는다. 사용자 A안 선택 완료: 출전 표에 대회 공통 GK 열과 기존 Button 재사용.
## Progress Snapshot
origin/dev 3542691e4 기반 feat/competition-goalkeeper-defaults 격리 작업트리. backend/frontend/docs 범위. 사용자 추가 지시로 어드민 조회뿐 아니라 GK 지정·해제를 포함.

## Validation Evidence
- 사용자 A안 선택 완료. 어드민 실제 hooks/MSW POST·재조회·복수 GK·출전 동시 저장·개별 해제·실패 초안 보존 14 tests PASS. 기존 팀장 GK 4 tests PASS.
- API 관련 108 unique tests PASS(loader 1 추가/기존, matrix 8, GK service, league admin 생성 회귀). 양쪽 tsc PASS, Web pattern/API surface PASS, DB guardrails PASS.
- DB Docker 미가동: 실제 migration replay/drift와 통합 시나리오는 CI에서 검증. additive nullable 컬럼이며 destructive SQL 없음.
- schema LF SHA 4f236e5869208c55b916f3a3b4308d719e7d565afccafd92cf477e4466c2ce86. M11 변경 없음. 이전 SHA도 stored manifest allowlist에 보존.
- 단계: 구현 완료 → PR/CI/Copilot → dev merge/alpha → 실제 UI·전파·원복 검증 → 완료 문서.
