# Task 20261056: QA #56 팀 일정 상세 참석·모집·운영 정보 구조

Status: In Progress
**Owner**: root → frontend UI owner
**Created**: 2026-10-08

## Context
[기존 QA #56](https://teameet.jmandu.kr/issues/56/)의 실제1180/768 관측: 내 참석·현황·모집·운영이 한 큰 surface에 세로로 모이고 데스크톱 참가자 행이560px에서 끝난다. 기능 장애나 overflow 주장은 없다. Root가20:36KST 김성준/확인 중 선점 저장·실제 표시를 확인했다. 원문/댓글/첨부와 현재 v1만 근거로 쓴다.

## Goal
기존 토큰과 액션 계약을 보존하면서 내 응답, 참석 현황, 모집/운영의 관계와 desktop 공간 사용을 명확히 한다.

## Original Conditions (must all be satisfied)
- [x] 실제 선점 성공과 담당·상태 표시 확인; 중복 task/worktree/PR 없음.
- [ ] desktop은 현황을 주 영역, 모집/운영은 보조 영역으로; tablet/mobile은 의미가 분리된 단일 열.
- [ ] 참가자 이름과 상태는 해당 행 양끝에 정렬; 응답 변경과 조회 필터의 위계 구분.
- [ ] 실제 권한·RSVP 잠김·모집 없음/진행/종료·오류·대리참석·관리자 액션 계약 보존.
- [ ] 원문1180/768 plus390/1440 실제 alpha before/after 증거; before는 root, after는 dev merge/serving SHA 뒤 별도.

## User Scenarios
1. 멤버는 개인 참석 상태를 확인·변경하고 전체 참석 상태를 별도 영역에서 필터링한다.
2. 관리자에게만 모집과 운영 제어를 표시하고 오류/마감/진행 상태를 유지한다.
3. 긴 이름·빈 현황·다인원에서도 tablet/mobile 줄바꿈과 desktop 행 정렬이 안정적이다.

## Test Scenarios
- [ ] Source-unchanged 실제 소비자 회귀 RED → 최소 GREEN; 상태·권한·버튼/필터 계약을 확인한다.
- [ ] 기존 schedule page와 관련 계약 스펙을 한 번 최소 worker로 실행한다.
- [ ] 커밋된 narrow tests·Web types/pattern; full suite/build/local Next 없음.
- [ ] 독립 코드·디자인 리뷰, 실제 viewport verdict와 제한 기록.
- [ ] Fixture/API 계약 불변이므로 shared mock/schema 변경은 불필요; 변경이 필요한 경우 root에 알린다.

## Parallel Work Breakdown
- Phase A root: 원문·기존 디자인·alpha before 확인, 선택안을 현재 토큰/레시피에 고정.
- Phase B UI owner: `apps/v1_web/src/components/team-schedules/team-schedules-page.tsx` detail view/helper sections ONLY; 필요시 새 scoped detail CSS module 및 새 narrow layout consumer spec. 기존 page spec은 실제 깨진 계약을 보완할 때만.
- Forbidden: `team-schedules-client.tsx` form/query/mutation, shared hooks/types/MSW, API/DTO/schema, shared shell/global tokens, 다른 자동화, Git mutation, browser/state mutation.
- Phase C root: 통합·committed checks·independent reviews·base-dev PR·기존 리포트 댓글. No subagent self-commit.

## Acceptance Criteria
- [ ] 원 조건/실제 소비자 계약 보존, 좁은 RED/GREEN 증거.
- [ ] 기존 DESIGN.md·토큰·SectionTitle와 solid surface, no decorative rail/deep shadow/new dependencies.
- [ ] Critical0 Warning0 latest-head code review; design review with before evidence.
- [ ] 실제 PR/comment 저장과 표시; alpha after는 별도, 첨부 삭제·자동 merge 없음.

## Tech Debt Resolved
- 예정: monolithic detail surface와 한정된 참가자 행 너비, 필터/응답 역할 혼동. 전역 정리 없음.

## Security Notes
API 인증·권한·payload 변경 없음. UI 숨김·상태/실패 안내를 보존하고 새 권한/인증 우회 없음.

## Risks & Dependencies
#53은 같은 client 파일 form을 수정 중이나 이 작업은 view만 소유한다. #54가 실제 같은 일정 alpha 검증 중이므로 데이터 변경/중복 시나리오를 하지 않는다. 사용자 화면 동일성과 다인원 실제 fixture는 미확인. dev merge/배포와 alpha after는 외부 대기다.

## Ambiguity Log
| Date | Raised by | Question | Resolution |
|------|-----------|----------|------------|
| 2026-10-08 | root | UI A/B/C와 same-run 자동 버그 처리 | 기존 DESIGN/detail recipe 안에서 A 상단응답+현황main/관리aside, B 전부singlecard, C 모두equalcolumns를 검토; 원문 공간·역할 요구에 맞는A를 고정. 사용자의 동일 실행 수정 승인 범위에서 진행, 새로운 스타일/토큰 결정 없음. |
| 2026-10-08 | root | frontend skill generic deps/Lighthouse 반복 | 사용자 최소수정·범위 제한·minimal serial 검증·alpha-only 지시 우선; unrelated tooling 설치와 반복 full audit 없음. 수치/시각 PASS를 꾸며내지 않는다. |

## Progress Snapshot
- Base origin/dev c3dadbe38c582abe4a06bd1ed0ba866c46aadbde, fresh fetch immediately before managed creation; branch fix/mdqa-56-schedule-sections. Root own SSOT run0550 retains earlier reports/PRs/alpha histories.
- Discovery/alpha before, implementation, narrow validation, review, PR and comment pending. No Done/merged/alpha PASS claim.
- PhaseB 완료: 기존 SectionTitle/useId·토큰으로 개인 응답 상단, 참석 현황 main + 380px 모집/운영 aside(1024px부터), tablet/mobile stack; neutral aria-pressed filters, full-width attendee row/name wrapping/proxy second track. API/client/shared/global 변경 없음.
- Actual view source-unchanged RED3/3 (named role regions 부재) → GREEN3/3. 기존 page26 및 unchanged view-model38 PASS, unique67. 중간 combined66/67의 단일 old monolithic lastChild assertion은 실제 complementary/region/edit-link 계약으로 좁게 교체하여 page26+new3=29 재실행 PASS; assertion 삭제/성공고정 없음. 최초 runner 옵션 거부는 RED로 인정하지 않는다.
- Root actual readonly alpha before: 1180×757/768×757/390×844/1440×1000 측정·DOM·CDP PNG0550/report56-before-*-cdp.png. 원 넓은 카드/560px row/blue filter 혼동 확인; 다인원/긴 이름/모집 진행 실측은 미확인. IAB 일반 screenshot390축소/전체캡처 실패는 보존하고 측정 CDP capture로 보완했다. 어떤 일정·정원·RSVP도 변경하지 않았고 viewport 원복했다.
- Root Changeset·scope 체크, latest dev 통합 및 committed tests/types/pattern·독립 코드/디자인 리뷰·PR/댓글 pending. 실제 alpha after는 dev merge/served SHA 후 별도, before나 CSS/단위 검증을 pixel PASS로 사용하지 않는다.
- 21:10KST independent code/design each Warning1: scoped sticky top16 overlapped fixed64 desktop nav with long attendance/history. Only module top changed to calc(var(--spacing-12) + var(--spacing-8))=80, existing teams/matches offset; no shared tokens/shell edits. CSS:false jsdom cannot establish scroll geometry, so no mirrored fake CSS assertion was added. Committed narrow/types/gate and fresh exact-head reviews pending; real alpha after remains pending.

- Root committed3c2040da vs latest origin/dev696aa: page26+layout3+viewmodel38=67/67 PASS, Web TypeScript and primary pattern PASS; all6 intended paths tracked, diffcheck clean, marker0. Independent full6 exact3c2040 code Critical0Warning0 FindingsNone and design source Critical0Warning0 OK; sticky80 source repair accepted. Root own0550/report56-final-committed-tests.txt / report56-final-gate.txt and report56-final-committed-result.json. Actual BEFORE fourviewports inspected; alpha AFTER (viewport/sticky/dark/densefixture) PENDING until devmerge/deployment. Base dev PR publication pending; task-only checkpoint changes no product/test blobs and final checkpoint HEAD re-review before publication.

- Root publication checkpoint 2026-10-08 21:40:03+09:00: PR https://github.com/kim-song-jun/matchup-sports-platform/pull/1682, base dev. Committed product/test head 48f48abb4288c5e26b4e2a9172c6f19e03f44cb1 vs origin/dev d0f57f01ce95ed12d9d7508594f03b15be0efa72: 67/67 narrow tests PASS, Web TypeScript and primary pattern PASS; exact full6 independent Critical0 Warning0 FindingsNone. Primary evidence: own0550/report56-publish-committed-tests.txt, report56-publish-committed-result.json, report56-publish-gate.txt. Product/test blobs unchanged by this task-only checkpoint; final checkpoint head independent review before final publication.
- Exact48f design source Critical0 Warning0; actual alpha BEFORE 4 viewports inspected, AFTER including sticky/dense/dark remains PENDING. PR1682 initially draft; readiness follows final checkpoint review. Original report comment not yet saved at this checkpoint; no merge/alpha/Done claim.

- 21:49KST latest actual PR1682 head f056c4d4 external connector findings4219113789/4219113798/4219113806 supersede the previous source-review snapshot: unbounded sticky aside with tall editor/applicants, long proxy-button traversal before visually adjacent management, cancelled reason history buried after attendees. Root accepted minimal ordinary document-flow aside (no nested scroll), history before attendance, desktop keyboard jump to named focusable aside preserving mobile sequence; real consumer cancel50/proxy50 focus regressions prepared. Old67/source/design OK retained as history; fresh follow-up RED/GREEN/exacthead review/CI/alpha pending. Original report PR comment1 saved21:45, evidence own0550/report56-final-pr-comment-confirmed.txt/png. No merge/alpha/Done claim.
- 22:05KST same-PR follow-up: unchanged f056 production source with new2 actual consumer regressions failed2/2 (cancel reason order and missing keyboard jump), then minimal page/module patch yielded layout5+page26+viewmodel38=69/69 PASS. Ordinary aside removes position:sticky/top completely so tall controls follow document flow; history moves before roster/attendance; desktop-only ghost jump before proxy buttons focuses actual named aside tabIndex=-1 and next Tab reaches the actual first recruitment action. Member has no aside/jump; below1024 hidden jump preserves mobile DOM order. No shared token/API/client/payload/permission/dependency edits. CSS geometry/pixels remain alpha pending; keyboard focus contract is actual DOM/userEvent evidence, not viewport simulation. Root latest dev integration, committed69/types/pattern and fresh exact-head code/design review pending.
