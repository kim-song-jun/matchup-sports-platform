# Task 20261133: 운영 승격 준비 — 1.18.0 이력 및 #2353 포함 1.19.0 후보

Status: Review

**현행 범위 (2026-11-13 사용자 추가 승인)**: 기존 4개 기능에 #2353을 포함하고 main 성별 핫픽스 #2355를 보존한다. 현행 보고서: `docs/ops/release-readiness-1.19.0-2026-11-13.md`, 잠금: `docs/ops/release-1.19.0-scope-lock.json`. 아래 1.18.0 기록은 당시의 고정 후보 이력이며 현행 범위는 이 추가 승인 절을 따른다.
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

## #2353 추가 승인 — 1.19.0 승격 준비

사용자: “추가된 2353내용 포함해서 준비해줘”. 기존 4개 기능 + 정규 리그 시간 선택·경기 배정 #2353. main 성별 핫픽스 #2355(동등 dev #2354)는 보존한다. 기존 release/prepare-1.18.0 브랜치는 수정하지 않고 새 후보를 만든다.

### Scope / Ownership
- Source snapshot: `a5496263242ab72a51e1ca420b85bf6a8b351ed6`.
- Main baseline: `0a4a1b268f5c6612da6fd51fdeffc2e6d5179a1c`.
- Owned: 새 scope-lock의 metadata/docs 10개 경로. 앱 package는 version만 변경.
- Forbidden: 기능 코드·Prisma·migration·dependency·배포/workflow 수정, 후속 dev 변경 혼합, main PR/머지·운영 승인·DB 작업. #2355 한정 main 예외를 이번 승격에 재사용하지 않는다.

### Acceptance / Test Evidence
- [x] main→준비 브랜치 merge로 성별 핫픽스 이력 흡수; 충돌은 버전·CHANGELOG·기존 task 기록만, 런타임 차이 0.
- [x] 공식 prepare-only PASS (실제 Alpha가 source snapshot과 일치).
- [x] API/Web 1.19.0, 미소비 Changeset 2개 소비, 양쪽 CHANGELOG 및 main 1.17.1 변경 이력 보존.
- [x] main 릴리스 게이트 PASS, versioning 계약 24/24 PASS.
- [x] 준비 트리의 런타임/API/DB/배포 코드는 source snapshot과 동일.
- [ ] dev 대상 준비 PR 게시 및 최신 CI 상태 기록.
- [ ] 준비 PR 머지 후 새로운 dev/Alpha SHA 재확인 (현재 요청은 준비).
- [ ] 기존 #2347/#2350/#2348의 미완료 로그인 QA를 승격 전에 보완.

### Ambiguity / Risks
- #2353 최신 PR 본문은 CI·Alpha·headed 3폭 QA 완료를 기록한다. 소스에 남은 이전 “미배포” 기록을 현행 blocker로 오인하지 않는다.
- #2354 Changeset도 dev 릴리스에서 소비하지만 main에 이미 반영된 성별 수정이며 새 운영 기능으로 세지 않는다.
- no-changeset patch 계약상 manifest 1.19.0의 다음 배포 표시 예상은 1.19.1이다. 실제 승인 시 resolver와 serving SHA 재확인.
- main 핫픽스 머지는 완료됐지만 준비 시작 시 운영 공개 헤더는 이전 SHA였다. main 저장소와 실배포를 동일시하지 않는다.

### Progress Snapshot (current)
Branch `release/prepare-1.19.0-2353`, worktree `/tmp/teameet-release-2353-20261113`. Main absorption merge `120490f26`. Metadata/docs 작성 및 계약 검증 완료; dev 준비 PR 게시 단계. 기존 root shared WIP 미변경.
## 2026-11-13 최종 후속 QA / Progress Snapshot

- 후보/dev/Alpha `974ac541b7a2e5e82f2e9687840ce5bca26e462e`, 표시 `1.19.1-alpha.20261113.g974ac541b7a2`. CI/Alpha 배포 success와 공식 승격 gate PASS, 10/10 허용 경로·main 핫픽스 12/12·main diff 82/82 재확인.
- 사용자 승인 후 기존 QA 계정의 실제 owner 로그인과 headed Edge 클릭 QA 수행. 핵심 기능 3/3, 3폭 9/9 조합 확인. 홀수 9팀 예선16/5자리 결선4/부전승3, 조회 전용·실제10분만료403, 시간/구장 독립 저장·해제·복원·충돌·접힘·401실패 원값보존 확인. before 없음/after 12PNG 육안 확인.
- assignment 시나리오 1~7은 실제 확인, 8은 비인증 차단만 확인한 PARTIAL. support/철회/타 대회 총괄·비활성 구장 실제 계정 조합은 미재실행이며 기존 단위·통합 CI 근거와 구분한다. 전체 권한 QA 완료로 표시하지 않는다.
- 사용자 승인된 테스트 대회 cf4c362e-5a0f-44b1-b4a9-4c1e622d63fe는 cancelled/isPublic=false/신청0/공개404로 정리. 승인된 20경기·두 시간·전용A/B구장·감사 기록은 남는다. owner 세션은 유지, 별도 QA 브라우저 PID17336/11980 종료 확인.
- 승인된 두 폴더 ACL 보정 성공. CUA kernel/native inventory 복구, browser access host unavailable은 별도 잔여 도구 이슈. 실제 화면 QA는 허용된 headed Playwright 대안으로 수행.
- 근거 정본: docs/ops/release-readiness-1.19.0-2026-11-13.md의 후속 QA 절. 증거 브랜치를 후보에 혼합하지 않는다. main PR/merge와 production 승인은 사용자 전용.

- 사용자 최종 승인: 이번 후보 974ac541b7a2에 한해 미재실행 세부 권한 항목은 기존 CI 근거 인정. 실제 수동 PASS로 바꾸지 않으며 이번 후보의 QA 준비 조건은 승인과 함께 충족. main 실행은 사용자 전용.
