# Task 191: 팀 폼 고정 행동 영역의 포커스 가림 회복

Status: Review
**Owner**: issue #1534 수정 세션
**Created**: 2026-10-02

## Context
Refs #1534. 실제 alpha 빈 팀 만들기 폼에서 더 꾸미기→팀 소개→Tab 레벨의 하단19.333px가 fixed CTA 뒤로 가린다(CSS787×505). 중앙은 SELECT hit-test이며 수동 스크롤로 회복된다. P3 편의성 결함으로 다루며 전체 접근 불가/WCAG 위반으로 확대하지 않는다. [고정 원본3장/proof](https://github.com/kim-song-jun/matchup-sports-platform/tree/e00a154d2348e20bddb7c58d1e29e5f3acfb97cc/docs/qa/2026-10-02-team-level-focus)는 모두 before다.

## Goal
공통 팀 폼의 native focus 이동 후 실제 fixed CTA가 덮은 부분과 포커스 링 여유만 실제 scroller에서 회복한다. 배치/마크업/스타일/저장값/순서를 변경하지 않는다.

## Original Conditions (must all be satisfied)
- [ ] 실제787×505에서 Tab 레벨 직후 전체 선택칸/포커스가 CTA 위에 보임.
- [ ] Shift+Tab→Tab 반복 및 취소 후 빈 폼 재진입에서 재발 없음.
- [ ] 동일 입력의 실제 모바일402/태블릿787/데스크톱1180 키보드 이동·선택·이전 계약 확인.
- [ ] 승인된 alpha 배포 후 실제 after·UTC·CSS 크기·PASS 범위를 기록.
- [ ] 수용 조건 전체 확인 뒤만 종료, 현재 OPEN/Refs 유지.

## User Scenarios
1. Tab으로 더 꾸미기의 레벨에 이동해도 fixed CTA가 필드/링을 가리지 않는다.
2. 이미 보이는 필드는 스크롤하지 않으며 선택·포커스·취소 목적지를 유지한다.
3. 데스크톱의 숨겨진 CTA와 IME 전용 absolute CTA는 이 fixed reveal에서 제외된다.

## Test Scenarios
### Happy path
- [x] 실제 TeamFormPageView에서 팀 소개→키보드 Tab→레벨, 원본 geometry에 해당하는 최소 scrollBy.
### Edge cases
- [x] 반복 Tab/Shift+Tab·빠른 다음 포커스·가림 없음/숨긴 CTA/absolute CTA·create/edit·unmount/reentry 예약 cleanup.
### Error paths
- [x] 기존 오류 reveal/focus·선택/저장 재시도/중복 제출/취소 계약 회귀를 유지.
### Mock data updates needed
- 실제 form view와 인메모리 view model 사용. 브라우저 layout rect/scroll/rAF 경계만 합성, 실제 레벨/포커스/이벤트/핸들러는 대체하지 않는다. API/fixture/MSW/DTO/schema 변경 없음.

## Parallel Work Breakdown
- Read-only 조사 에이전트: 원본3장/proof와 actual main/CTA/scroller/IME/desktop CSS 대조 완료, 코드/테스트/데이터 쓰기 없음.
- Owned: `apps/v1_web/src/components/teams/teams-page.tsx`, `teams-page.test.tsx`, 이 task, `.changeset/team-form-focus-reveal.md`.
- Forbidden: 다른 worktree/미병합 PR, shared shell/CSS/soft-keyboard/reveal helper, API/저장/권한/가입/실제 팀/QA179/완료 결과, merge/deploy/main/유료 리뷰 재요청.

## Acceptance Criteria
- [x] 실제 view 회귀 RED/GREEN·관련 폼 회귀·scope type/lint·6 aggregate/Changeset/diff/tech-debt 검사.
- [ ] 명시 pathspec 커밋·전용 push·Ready/dev PR·exact-head CI/독립 리뷰 구분.
- [ ] 원본 before와 수동 회복 대조/수정 after PENDING을 구분.
- [x] jsdom 로직 테스트를 실제 브라우저 가림 PASS로 확대하지 않음.

## Tech Debt Resolved
- 이미 있는 bottom padding은 수동 스크롤 공간만 제공하고 일반 키보드 focus reveal에서 fixed CTA를 고려하지 않는 공백.

## Security Notes
- 저장/선택/권한/명단/서버 상태/실제 데이터를 수정하지 않는다.
- 인증/환경 파일·비밀값 읽기/기록 없음.

## Risks & Dependencies
- 원본 페이지 serving SHA/실제 기기/IME/모바일 사진은 미확보. desktop은 긴 QA LOCAL 입력으로 빈 tablet과 동일 조건이 아니다.
- CTA의 실제 rect/position을 사용한다. desktop 숨김과 IME absolute 흐름은 기존 계약이 맡는다.
- CLAUDE.md UI §(337행)의 ‘백엔드/로직 전용 변경’ 예외를 적용한다. 스타일/배치 재설계 없이 focus event/scroll logic만 수정한다.

## Ambiguity Log
| Date | Raised by | Question | Resolution |
| --- | --- | --- | --- |
| 2026-10-02 | 조사 에이전트 | bottom padding124px가 있어도 왜 가리는가? | 실제 scroller는 .tm-scroll-area; padding은 최종 scroll range이며 일반 Tab의 viewport reveal에서 CTA를 제외하지 않는다. |
| 2026-10-02 | 수정 세션 | CSS 선언만으로 완료 가능한가? | 실제 view+synthetic geometry로 로직을 증명하고, 실제 Chromium 가림 해결/전 폭 alpha after는 승인된 배포 후 대기한다. |

## Progress Snapshot
- Fresh origin/dev e0f58632821bb12296541219f748bcee7cbd185f, `/tmp/teameet-issue-1534-20261002`, branch `fix/issue-1534-team-form-focus-reveal`.
- 기존 #1430/#1437/#1528(PR1529)과 다른 같은 단계의 키보드 focus 재현. 중복 구현 없음.
- 원본 select top387.333/bottom435.333,height48; CTA top416; partial19.333px. 수동 회복 bottom275.333은 수정 after가 아니다.
- 실제 view/rAF/geometry 경계 테스트 RED4 FAIL/3 PASS(7신규, 기존56 SKIP), 4.10s. edit의 기존 가입정책 두 버튼을 실제 Tab 순서대로 통과한 후 확인. GREEN 관련3 suite108 PASS(7신규+101기존), 8.39s, 1 worker.
- native focus 뒤 rAF에서 실제 activeElement와 CTA position/rect를 확인하고 closest .tm-scroll-area에 overlap+4px만 instant scrollBy. 새로운 포커스/폼 unmount는 이전 예약 취소; desktop 숨김과 IME absolute/이미 보이는 경우 no-op. API/선택/저장/배치/스타일 수정 없음.
- typecheck+pattern lint, DB/production security/compose/seed/Android/immutable deploy 6 aggregate, patch Changeset policy/diff check/새 tech-debt marker 없음 PASS.
- Host preflight load14.54/14.88/16.58, 앞선 Node/Chrome/Docker/메모리 확인과 함께 최소 worker 검증만 실행. 로컬 UI 서버/DB/실제 데이터 쓰기 없음.
- 원본3장/proof는 조사 에이전트가 픽셀 확인. 태블릿08:59:55.209→수동회복09:00:07.907, desktop09:00:54.030 UTC. 둘 다 수정 전이며 mobile 사진/원 페이지 serving SHA는 미확보.
- 4 명시 pathspec 커밋·Ready/dev PR/exact-head CI/독립 리뷰는 PR에 후속 기록. 실제 동일 빈 입력의 세 폭 키보드/재진입/rect/hit-test/console/network·수정 after는 별도 승인된 alpha 배포까지 PENDING. #1534 OPEN/Refs 유지.
