# Task 20261057: QA #57 후기 화면 쿠키 세션 안내

Status: In Progress
**Owner**: root → frontend owner
**Created**: 2026-10-08

## Context
[기존 QA #57](https://teameet.jmandu.kr/issues/57/)는 #47 dev 머지 c3dadbe 뒤 원 not-found가 해소됐지만, 동일 브라우저/동일 탭의 My가 E2E관리자 로그인 상태인데 후기 화면은 로그인하라는 안내를 표시한다. Cray1180×757 실제 관측/최근 댓글을 읽고 root20:41KST 김성준·확인 중 선점 저장과 표시를 확인했다. 참가 팀장/매니저 자격은 미확인이다.

## Goal
실제 인증 상태와 후기 작성 자격을 구분하여 유효한 쿠키 세션에 잘못된 로그인 안내를 표시하지 않는다.

## Original Conditions (must all be satisfied)
- [x] 기존 원문/댓글·현재 task/branch/PR 중복 확인, 실제 선점 성공.
- [ ] localStorage 힌트 없는 쿠키 인증과 기존 개발 인증을 실제 auth/me 계약으로 판단.
- [ ] 참가 자격·작성 완료·익명·인증 확인 중·서버 실패를 구분, 실패를 로그인이나 성공으로 숨기지 않는다.
- [ ] 후기/시상 두 shared gate 소비자와 fixture 후기 조회의 인증 계약을 보존.
- [ ] 독립 리뷰·base dev PR·원 리포트 댓글까지 진행; alpha after 별도.

## User Scenarios
1. 유효한 쿠키 사용자에게 역할에 맞는 안내/작성 액션을 표시한다. 로그인 여부만으로 권한을 부여하지 않는다.
2. 익명은 로그인 안내를, 아직 인증 확인 중인 사용자에게는 확정된 익명 안내를 표시하지 않는다.
3. auth/me 5xx 및 참가/내 후기 조회 실패에서 실제 오류를 보존한다.

## Test Scenarios
- [ ] 실제 소비자+HTTP 계약의 source-unchanged cookie-session RED → GREEN.
- [ ] 익명401·대기·서버 실패·자격 없음/있음·기작성·fixture 후기를 좁게 검증.
- [ ] serial 최소 worker, committed tests/types/pattern; 전체 suite/build/localNext 없음.
- [ ] mock auth/participant/review 상태는 기존 계약에 맞춰 같은 scoped spec에서 조정.

## Parallel Work Breakdown
- Phase A root: before/auth 원문, managed fresh origin/dev c3dadbe, task/deps setup.
- Phase B frontend owner: `apps/v1_web/src/app/tournaments/[id]/awards/awards-page-client.tsx` shared review gate 및 안내, `reviews/reviews-page-client.tsx` 인증 의존 소비자와 두 경로 scoped specs. 필요시 같은 도메인의 새 작은 helper/spec만 허용.
- Forbidden: shared hooks/types/MSW/session-storage/API/DTO/schema/global shell, 다른 자동화/다른 task, Git mutation/self-commit/browser mutation/dependency install. 공유 계약 변경 필요하면 root에게 근거를 보고한다.
- Phase C root: integration·committed checks·독립 리뷰·Git/PR·기존 댓글. No merged #47 branch push.

## Acceptance Criteria
- [ ] 실제 인증과 역할 구분, 권한 우회 없음, narrow RED/GREEN 및 기존 회귀 PASS.
- [ ] latest exact-head Critical0 Warning0 독립 리뷰, CI/외부 리뷰는 해당 SHA 근거만 사용.
- [ ] 한국어 dev PR과 기존 QA 저장/표시 확인; merge/alpha/영구 삭제 승인 별도.

## Tech Debt Resolved
- 예정: 후기 gate와 fixture 후기의 localStorage-only 인증 추론 제거; 전역 인증 재설계 없음.

## Security Notes
실제 auth/me 서버 결과만 신뢰한다. localStorage/cookie 존재만으로 권한을 부여하지 않으며 auth/participant/review gate를 보존한다. 비밀 파일/브라우저 토큰을 읽거나 출력하지 않는다.

## Risks & Dependencies
#47 원 not-found와 별도 후속 증상. participant 역할 미확인, alpha serving UI SHA 미노출은 원 관측 한계로 보존한다. dev-pr-5의 같은 실제 QA는 중복하지 않는다. 새 auth 조회가 익명·서버 오류를 숨기거나 너무 일찍 권한을 열지 않아야 한다.

## Ambiguity Log
| Date | Raised by | Question | Resolution |
|------|-----------|----------|------------|
| 2026-10-08 | root | 실제 로그인과 참가 자격 | My의 실 로그인 증거는 자격 증거가 아님. 로그인 안내만 고치고 쓰기 권한은 실제 participant check 유지. |

## Progress Snapshot
- Base fresh origin/dev c3dadbe38c582abe4a06bd1ed0ba866c46aadbde, managed worktree mdqa-57-review-session-hint, branch fix/mdqa-57-review-session-hint. Root own SSOT run0550 보존.
- Primary source gate uses hasStoredV1Session; production implementation only localStorage active hint while shouldProbeV1Session permits actual cookie probe. root 조사/worker 구현·검증·리뷰·PR·댓글 pending.

- 21:08KST frontend implementation: shared awards review gate uses real auth/me via shouldProbeV1Session + existing transient retry, participant and my-review must both succeed/settle before write. Reviews fixture consumer shares confirmed auth. Anonymous401/checking/503+retry/unqualified/already-written/pending my-review stay distinct, no auth/permission/API bypass. Actual HTTP source-unchanged RED2 cookie-only UI assertions -> GREEN new20+existing reviews5+awards17+team-select4=46/46. New spec deferred-response cleanup adjusted after GREEN; root committed recheck pending. Owned4 paths only; no shared hooks/types/MSW/session-storage/backend edits. Root same-tab My E2E admin -> back still wrong login hint evidence saved; participant role not proven; alpha after pending.
