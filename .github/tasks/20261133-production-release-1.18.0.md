# Task 20261133: 운영 승격 — #2364 포함 1.20.0 후보

Status: Review

**최신 범위 확장(2026-11-13)**: 사용자가 '해당 내용까지 main 승격에 포함해줘'라고 지시해 등록 시간·구장 이름 인라인 수정 PR #2364를 이번 운영 승격 범위에 추가했다. 아래 1.19.0/표시 1.19.1 잠금은 이전 후보 이력이며, 확장 후보의 완료 근거로 재사용하지 않는다. 새 후보 SHA·버전은 #2364 dev 반영·CI·Alpha QA와 Changeset 소비 후 고정한다.

**현행 범위 (2026-11-13 최종 사용자 위임)**: 기존 5개 기능 + #2364 인라인 수정, main 핫픽스 #2355/#2362 보존. 현행 보고서 `docs/ops/release-readiness-1.20.0-2026-11-13.md`, 잠금 `docs/ops/release-1.20.0-scope-lock.json`. 아래 1.18.0/1.19.0 제한은 당시 준비 이력이며 이번 main·운영 실행 위임은 최신 승인 절을 따른다.
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

## #2364 추가 승인 — 확장 승격 후보 준비

- 사용자 승인: 2026-11-13 “해당 내용까지 main 승격에 포함해줘”. 기존 포함 기능 #2347/#2350/#2348/#2351/#2353 + #2364 등록 시간·구장 이름 수정.
- 기능 PR: https://github.com/kim-song-jun/matchup-sports-platform/pull/2364 (base dev). 구현 task: `.github/tasks/20261132-fixture-time-court-assignment.md`.
- #2364는 시간 항목과 연결 경기·팀 일정을 원자적으로 이동하고 구장 이름과 배정 경기 표시를 동기화한다. 구장 ID/주소/좌표/시간·기존 권한/감사는 보존하며 추가 migration은 없다.
- 관측 기준: dev `bc1d92475e03b876d23023cb13fba623611b5b24`, main `6675a8a00ec80b54af0674ebf366bfd7865c0d33`. main 성별 핫픽스 #2355와 타 팀 신청 핫픽스 #2362를 보존한다. #2361은 #2362와 동등한 dev 변경으로, 새 운영 기능으로 중복 집계하지 않는다. 최종 diff에서 동등성과 main 전용 변경 유실 여부를 다시 확인한다.
- 이전 scope-lock JSON/준비 브랜치는 이력으로 유지한다. 미완료 #2364를 이전 QA 완료/범위 잠금에 덧붙여 승인된 고정 SHA처럼 표시하지 않는다. 이후 무관한 dev 기능을 자동 포함하지 않는다.
- 로컬 API 53/Web 14 테스트와 양쪽 타입·패턴 검사 PASS. 접기 후 편집 복원 회귀 1 PASS. 최신 기능 head `23c1ef2d5b87e3656e447faf2385300eb0f78e28`의 CI 43386715474 진행 중(아래 문서 커밋 반영 시 최신 PR head를 기준으로 재확인).
- Copilot 전용 API 422 ACTOR_INELIGIBLE로 #2364 한정 리뷰 예외 답변 대기. 새 Alpha 테스트 대회 생성/수정/취소/숨김 승인 답변 대기. 기존 PR2356의 예외와 QA 증거를 새 기능의 완료로 확대하지 않는다.
- [x] 사용자 범위 확장 기록 및 #2364 연결
- [ ] #2364 최신 CI(실제 PostgreSQL 일정/rollback 통합 포함), 리뷰 조건 충족, dev 머지
- [ ] 정확한 새 Alpha SHA에서 로그인·실제 저장과 390/768/1440 화면/console/network 검증 및 테스트 cleanup
- [ ] source snapshot/main baseline과 최종 후보 SHA 고정, 변경 경로 전수 분류 및 기존 main 핫픽스 보존
- [ ] 공식 prepare-only로 Changeset 소비, API/Web 버전·CHANGELOG 및 main 릴리스 게이트 검증, dev 대상 새 준비 PR
- [ ] 준비 PR CI·새 Alpha 버전/SHA 확인 후 사용자에게 고정 후보 비교와 승격 근거 전달
- main PR 생성·머지 및 production 승인은 저장소 사용자 전용 규칙을 따른다. 범위 포함 지시는 운영 승격 완료를 뜻하지 않는다.
### 최신 실행 승인 / CI 수정 cursor
- 사용자가 “리뷰가 아마 안될거야 그러니까 단계별로 문제 없으면 바로바로 진행해줘”라고 지시해 이번 승격의 Copilot 리뷰 예외를 승인했다. 이어 “전체 main 운영적용까지 바로 해줘 급해서 계속 승인 못해줘”라고 명시해 이번 고정 6개 기능의 main PR 생성·머지·production 배포 승인과 결과 검증까지 위임했다. 이는 앞의 사용자 전용 실행 제한에 대한 이번 세션의 명시적 예외다. 전역/저장소 정책을 영구 변경하거나 보호 규칙을 우회하지 않는다.
- 앞서 구체적으로 안내한 QA2364 테스트 생성·수정·취소/숨김도 단계별 진행 범위로 진행한다. CI·실제 Alpha QA·릴리스/보안 게이트는 생략하지 않는다.
- 501cfe07c CI 43387338076: Web/Gates/security PASS. DB integration 207 suites 중 신규 assignment-option-edit 준비 코드 1 suite/2 tests 실패, 나머지 206 suites/1562 tests PASS. league_knockouts에서 금지된 일반 createGroup 호출이 원인이므로 실제 MultiFinalsService.setup → TournamentBracketService.updateFixture 경로로 수정했다. 관련 API 타입 PASS, DTO 검증 6 PASS.
- 정규 N개 예선은 표준 템플릿과 달리 240경기 초과도 지원하므로 legacy expectedFixtureIds의 불필요한 240개 제한 제거, 275 UUID DTO 회귀 PASS. 최종 실제 DB 결과는 다음 CI에서 확인한다.
- 브라우저: CUA host unavailable, 일반 격리 headed Chrome은 ERR_NETWORK_ACCESS_DENIED. 별도 권한 상승 QA Chrome 실행이 자동 승인 검토에서 거절돼 사용자에게 해당 실행 방식의 구체 승인을 요청했다. 거절을 우회하지 않고 화면 QA는 이 승인 대기 상태로 유지한다. 일반 QA 브라우저는 close했고 사용자 Chrome은 유지했다.
- 현재 관측: Alpha bc1d92475/1.19.1-alpha, production 6675a8a00/1.17.3 HTTP200. 아직 기능 dev 머지·main 승격·운영 변경 없음.

## 1.20.0 현행 준비 cursor
- #2364 사용자 전체 실행 위임에 따라 dev 머지 및 Alpha QA 완료. Source 7c288bd0985bd58beb68f7f72155107c0c58d377, main baseline6675a8a00ec80b54af0674ebf366bfd7865c0d33. source CI 43392588398/Alpha43392588395 SUCCESS.
- 2패널×3폭 before/after 6/6 및 실제 저장·취소·중복/stale/auth PASS. 테스트 cancelled/private·실제등록0, 전용Chrome38408/helper51176 종료. 이전 브라우저 실행 차단은 사용자 구체 승인 후 해결됐다.
- 공식 prepare-only PASS. API/Web1.20.0 및 두 Changeset 소비, 기존 main 핫픽스/CHANGELOG 유지. 현행 보고서 docs/ops/release-readiness-1.20.0-2026-11-13.md, 새 scope lock release-1.20.0-scope-lock.json. 이전1.19.0 잠금은 이력 보존.
- 다음: metadata/docs 준비 PR CI→dev/Alpha 검증→고정 main PR/CI/머지→production 승인/배포→실제운영 SHA/버전/health 대조. 사용자 승인 재요청 없이 정상 게이트로 진행한다. 아직 main/production 미변경.
