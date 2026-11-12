# Task 20261133: 현재 alpha와 main 비교 및 1.18.0 승격 준비

Status: Review
Owner: Codex
Created: 2026-11-13

## Context
사용자가 현재 alpha 배포 내용을 main과 비교하고 승격 준비를 요청했다. 실제 dev→main 승격은 사용자 전용이다.

## Goal
고정한 배포 SHA의 비교·DB 영향·검증 제한을 정리하고 두 앱의 버전/변경 이력을 소비한 dev 대상 준비 PR을 제공한다.

## Original Conditions
- [x] 최신 main/dev와 실제 alpha/production 공개 헤더 교차 확인
- [x] 공유 WIP·main·운영 DB를 변경하지 않음
- [x] main 전용 과거 승격 merge는 main→dev 방향 준비 브랜치에 흡수
- [x] 공식 prepare-only 실행, Changeset 4개 소비 및 API/Web 1.18.0/CHANGELOG 생성
- [ ] 준비 PR의 최신 CI/리뷰 결과 확인
- [ ] 로그인 기반 alpha QA와 새 버전 dev/alpha 검증 후 사용자 main 승격 판단

## User Scenarios
운영자가 릴리스 PR의 포함 기능 4개, 신규 additive migration 1개, QA 미완료 항목을 검토하고 증거가 충족되면 직접 main 승격을 진행한다.

## Test Scenarios
배포 헤더/SHA 일치, main 전용 merge의 runtime diff 없음, 고정 버전 일치, Changeset 소비/CHANGELOG, release commit shape 및 main promotion gate, net dev PR의 runtime 소스 변경 없음.

## Parallel Work Breakdown
단일 에이전트 순차 실행. Phase 1 비교/근거 확인 완료 → Phase 2 버전 준비 완료 → Phase 3 보고서/PR/검증 진행. 서브에이전트 없음.
Owned: `.changeset` 4개 소비, API/Web package.json·CHANGELOG, 이 task와 `docs/ops/release-readiness-1.18.0-2026-11-13.md`.
Forbidden: 기능 구현·schema/migration 변경·main PR 개설/머지·운영 배포·운영 DB·타 작업트리.

## Acceptance Criteria
- [x] 변경 경로 67/67 분류, 포함 PR 4/4·DB migration 확인
- [x] 미완료 로그인 QA를 완료로 표시하지 않음
- [x] 현재 alpha 1.18.0-alpha와 준비 후 계산될 1.18.1-alpha/운영 1.18.1을 매니페스트 1.18.0과 구분
- [x] dev 대상 Draft PR #2352 및 최신 CI 진행 상태 제공
- [x] 사용자용 비교는 고정 후보 SHA 기준으로 제공하며 움직이는 main…dev 승격 링크는 사용하지 않음

## Tech Debt Resolved
main에만 있던 과거 승격 merge 3개 흡수. 릴리스 미소비 Changeset 4개 정리. 기존 task의 stale 미머지/미배포 표기는 새 고정 SHA 보고서로 설명하며 타 기능 task를 임의 완료하지 않는다.

## Security Notes
인증정보/세션/.env 읽기·노출 없음. 프로덕션은 공개 헤더만 조회. Copilot 예외는 PR별 사용자 승인이고 이전 예외를 이번 PR에 확대하지 않음.

## Risks & Dependencies
신규 시간 테이블 migration 필요. 홀수팀 생성·관리자 회원 조회·시간/구장 배정의 로그인 QA 증거 미완료. 버전 PR 이후 고정 후보 CI/alpha 증거 재확인 필요. 후속 dev 변경이 있으면 전체 dev 승격 금지. 실제 승격은 사용자만 수행.

## Ambiguity Log
준비 요청은 main 승격 실행 권한이 아니다. 현재 준비 PR은 메타데이터/문서만 포함하고 기존 alpha 배포 기능을 새로 수정하지 않는다. 공식 resolver의 no-changeset patch 규칙으로 다음 운영 표시는 1.18.1 예상이다.

## Progress Snapshot
비교 main `6d12d118ebf3fee7f7c970b7a7f18c72c9fe5edf`, alpha/dev `c339f1ee9901b6393c3aaa9d026d30ac4fe1043d`. dev CI 43246621638, alpha 배포 43246621387 모두 success. prepare-only PASS. version commit `d90c723a3`, main 흡수 merge `cf5d777be`는 runtime tree 변경 없음. 시스템 jq 부재는 `/tmp`의 공식 바이너리를 SHA256 검증해 사용하여 해결했으며 시스템/프로젝트 도구 설정은 변경하지 않았다. 보고서 및 PR 게시/검증 단계. 이후 CI/리뷰/배포 상태는 준비 PR에서 최신 head 기준으로 기록한다.

## 준비 PR / 외부 차단
- Draft PR: https://github.com/kim-song-jun/matchup-sports-platform/pull/2352 (base dev). 공식 Copilot API는 HTTP 422 `ACTOR_INELIGIBLE`: 연결 계정 라이선스 또는 조직 정책으로 code review 불가. 요청 반복·정책 변경 없이 기록하며 clean으로 표시하지 않는다.
- 준비 PR은 버전/변경 이력/문서 10개 파일만 포함하며 main은 미변경. 최신 CI는 PR checks에서 확인한다.
- 이후 최신 dev 전체를 승격하지 않는다. 사용자용 비교는 main과 고정된 release 후보 전체 SHA 사이의 diff다.

## 사용자 범위 고정 — 2026-11-13
- 기능 기준 `c339f1ee9901b6393c3aaa9d026d30ac4fe1043d`, 포함 PR #2347/#2350/#2348/#2351. 이후 dev 기능·API·migration·의존성·배포 변경 및 Changeset 제외.
- `release/prepare-1.18.0`에 후속 dev merge/rebase/cherry-pick 금지. 허용 차이는 scope-lock JSON의 release metadata/docs 경로뿐이며 package.json은 version 외 변경 불가.
- 새 Changeset이 생겼다는 이유로 이번 릴리스에 재소비하지 않는다. dev가 범위 밖으로 전진하면 최신 dev→main 승격을 중단하고 고정 후보 검증/사용자 승격 경로를 분리해 준비한다.
- Owned에 `docs/ops/release-1.18.0-scope-lock.json` 추가. 범위 고정은 기존 QA/리뷰 게이트 면제가 아니며 main은 변경하지 않는다.
