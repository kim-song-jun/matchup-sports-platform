# Task 20261015: 개인 매치 상세의 desktop 제목 중복 정리

Status: Review
**Owner**: root → investigate_1535 (scoped frontend implementation)
**Created**: 2026-10-03
**Issue**: https://github.com/kim-song-jun/matchup-sports-platform/issues/1588
**Base**: `8167aaa86ed3cc787bd82568515ad1f9d21d0ef2`
**Branch**: `fix/issue-1588-match-detail-desktop-title`

## Context

개인 매치 상세는 desktop 페이지 헤드 H1과 hero H2에 같은 `match.title`을 표시한다. 원 이슈는 desktop CSS1183×758에서 관측한 제목 반복의 P3 위계 개선이며, 동일 제목 두 개만으로 WCAG 위반을 확정하지 않는다. 기존 PR1147의 제목 크기·굵기 정합성은 유지한다.

Before 출처는 공개 commit `877d4a4c0b4a495df88003ea78112981bcce1869`의 `docs/qa/2026-10-03-individual-copy-candidates/`이다. 상세 DOM 시점은 2026-10-03 08:48:18.949 UTC이며, 전체 package 관측 구간은 08:45:06.371–08:49:01.785 UTC다. screenshot/DOM 시점과 CSS789×505/raster788×505를 구분한다. Serving SHA는 미노출이며 source base를 당시 serving SHA로 단정하지 않는다. 공개 자료의 무결성·픽셀 검증은 부모의 기록이며 본 담당자의 독립 다운로드/브라우저 실행은 없다.

## Goal

사용자가 선택한 A안대로 desktop에는 Back+entity H1을 유지하고 hero H2만 숨기며, mobile/tablet 제목과 기존 상세·목록 동작을 보존한다. 실제 alpha after 검증 전에는 시각 완료로 보고하지 않는다.

## Approval / Source

- 2026-10-03: 부모가 실제 before 기반 A/B/C HTML을 제시한 뒤 사용자의 **A 선택·“ㄱㄱ” 승인**을 전달했다. 전달 식별자는 `Sentinel_00213ead9bc48191a51d515de871b9b6`이다.
- 승인된 A: desktop ≥1024 Back+H1 entity 유지, hero H2만 `tm-hide-desktop`으로 숨김. mobile/tablet H2, 목록 제목, Back/share/badge/CTA 유지. host·badge 간격은 기존 CSS 원칙 안에서 최소 정리한다.
- CLAUDE UI 선택 절차를 이 승인으로 충족한다. 새 문구·상태·API 설계는 하지 않는다.

## Original Conditions (must all be satisfied)

- [x] A/B/C 제시 → 사용자 A 선택을 구현보다 먼저 기록한다.
- [x] Desktop ≥1024 source 계약에 entity H1과 Back을 유지하고 동일 hero H2 숨김을 연결한다. Actual visibility는 아래 alpha gate로 남긴다.
- [x] Local contract에서 mobile/tablet H2·목록 제목·Back/from·공유·배지·CTA를 보존한다.
- [x] 숨긴 H2 뒤 host·badges 간격을 최소 조정하고 기존 타입·색·사진/그래픽 source 계약을 유지한다.
- [x] 실제 render+source CSS 계약으로 RED→GREEN을 남긴다. jsdom을 실제 viewport 검증으로 보고하지 않는다.
- [ ] 별도 승인 배포 이후 3폭 alpha before/after·console/network·focus/scroll/CTA를 확인한다.

## Ownership / Forbidden

Owned exact paths:
1. `apps/v1_web/src/components/matches/matches-page.tsx`
2. `apps/v1_web/src/components/matches/matches-page.test.tsx`
3. `apps/v1_web/src/app/globals.css` — 상세 title 설명 주석과 필요한 최소 spacing만
4. `.github/tasks/20261015-match-detail-desktop-title.md`
5. `.changeset/match-detail-desktop-title.md`

Forbidden: 다른 파일·worktree, API/DTO/mapper/mode, 비용, #1587 notice, 실제 데이터·권한·신청/명단/완료 변경, 브라우저/로컬 Next, install, 전체 tests/lint, GitHub 쓰기, 담당자 commit/push. RED/GREEN 실행과 후속 lint/gates/commit/PR/배포는 root가 소유한다.

## User Scenarios

### Scenario 1: Desktop 상세 identity

상세를 열면 Back 옆 H1이 경기 정체성을 나타내고 hero는 같은 제목을 반복하지 않는다. 공유·종목/레벨/상태 배지와 host는 유지된다.

### Scenario 2: Mobile/tablet와 목록 복귀

1024 미만 상세에서는 기존 hero H2가 유지된다. 필터가 있는 목록에서 상세로 들어온 Back/from과 목록 제목은 바뀌지 않는다. CTA의 허용 동작과 실제 저장 계약은 바뀌지 않는다.

## Test Scenarios

### Happy path
- [x] 실제 `MatchDetailPageView`의 entity H1/hero H2를 사진·그래픽 두 fixture로 확인한다.
- [x] 실제 import chain의 `_shell.css` 1024px hide/show 규칙과 렌더된 클래스 연결을 확인한다.
- [x] 실제 Back/from·공유 callback·배지/host·desktop/mobile CTA를 확인한다.

### Edge cases
- [x] Mobile/tablet H2에 전역 hidden/aria-hidden을 부여하지 않는다.
- [x] 기본 host 8px 간격을 보존하고 desktop에서만 제목 뒤 여백을 정리한다.
- [x] 기존 목록 from/카드 제목, header/share, 그래픽·타입 테스트를 함께 실행한다.

### Error paths
- [x] 기존 상세 액션 오류·재클릭 및 disabled 계약을 관련 suite에서 유지한다. 새 오류 fallback이나 요청 경로는 추가하지 않는다.

### Mock data updates needed
- 기존 API/DTO/MSW/schema fixture 변경 없음. 새 테스트는 공개 계정·명단·연락처 없이 합성 entity만 사용한다.

## Parallel Work Breakdown

### Frontend
- [x] A/B/C 제시 → 사용자 A 선택 기록.
- [x] Task+tests 작성 → root의 후속 실행 승인으로 담당자가 worker 1 직렬 RED 실행.
- [x] RED 결과 확인 후 승인된 product/CSS 최소 수정.
- [x] 담당자 GREEN 69 PASS, root lint/typecheck·6 gates·changeset 정책 PASS 및 5path candidate 검토. Committed tree와 CI는 root 후속 확인.

### Backend / Infra
- 범위 없음. root의 다른 이슈·worktree를 변경하지 않는다.

### Sequential
- [ ] Root 검토·명시 pathspec commit/PR/CI.
- [ ] 별도 승인 배포 이후 alpha 실측과 공개 after 기록.

## Acceptance Criteria

- [ ] Original conditions 충족 및 새로운 UI 선택 없음.
- [x] 실제 renderer와 실제 source CSS에 연결된 RED/GREEN 기록.
- [x] 기존 header/share/list/CTA 회귀와 touched-path debt/diff 검사 통과.
- [x] 정확한 5path candidate·추가 runtime import/의존성 없음 확인. 명시 커밋 뒤 committed tree/원격 CI는 후속 확인.
- [x] API·권한·mapper/mode·상태 copy·저장 계약 변경 0.
- [ ] Alpha actual after와 local contract 결과를 분리해 보고.

## Tech Debt Resolved

- Desktop에서 불필요하게 반복되던 entity 제목을 승인된 반응형 utility로 정리한다.
- 상세 title의 이전 중복 설명·오래된 source line 번호 주석을 현재 역할에 맞춘다.
- 신규 보류·우회 marker를 추가하지 않는다.

## Security Notes

권한·서버 호출·데이터 저장은 변경하지 않는다. 합성 fixture의 실제 view 렌더만 검증하며 API hooks의 가짜 성공을 실제 저장/권한 검증으로 세지 않는다. 공개 before에는 민감한 원본이나 계정 정보를 추가하지 않는다.

## Risks & Dependencies

- Root가 후속으로 담당자의 host preflight → worker 1 직렬 RED/GREEN 실행을 승인했다. 전체 suite·lint·타 작업 테스트는 실행하지 않는다.
- `tm-hide-desktop`는 실제 `desktop/_shell.css`에 있고 root layout→desktop/index.css import chain으로 제공된다. 이 공유 파일은 읽기만 하며 변경하지 않는다.
- jsdom은 media query layout·실제 AX/SR·3폭 pixels·scroll/focus 순서를 증명하지 못한다. source visibility 계약은 해당 utility/class 배선의 제한된 증거다.
- 사진/그래픽 hero 높이·host/badge 간격의 실제 시각 균형과 native 공유는 alpha after 미검증이다.

## Ambiguity Log

| Date | Raised by | Question | Resolution |
|------|-----------|----------|------------|
| 2026-10-03 | root | UI 선택 없이 구현 가능한가? | 사용자 A/ㄱㄱ 승인 전달을 기록하고 그 범위만 구현한다. |
| 2026-10-03 | investigate_1535 | jsdom에서 실제 폭별 숨김을 주장할 수 있는가? | 실제 DOM+import된 source media rule 연결만 증명한다. 실제 가시성·AX/픽셀은 alpha pending이다. |
| 2026-10-03 | investigate_1535 | #1587 상태 안내도 함께 바꿀 것인가? | 별도 승인/WT 작업이므로 이 task에서 변경하지 않는다. |

## Progress Snapshot

- 2026-10-03: 새 worktree의 branch/base와 clean 시작 상태를 확인했다. 사용자 승인과 exact 5path ownership을 고정했다.
- Root가 #1587 GREEN/lint 종료와 고부하 검사 없음 확인 뒤 담당자의 RED→제품 수정→관련 GREEN 1회를 명시 승인했다.
- Host preflight: 12 cores, load 4.51/4.67/4.80, memory free 67%, Node 76/browser 35, 기존 Docker 서비스 Up/healthy. 다른 프로세스·서비스를 종료하거나 DB에 접속하지 않았다. GREEN 직전 load 3.47/4.42/4.69, memory free 68%였다.
- RED(제품 수정 전): `apps/v1_web`에서 `pnpm exec vitest run src/components/matches/matches-page.test.tsx --maxWorkers=1 --minWorkers=1 -t 'desktop 제목 중복 정리' --reporter=dot` → 새 6개 중 **3 FAIL / 3 PASS**, 기존 58 SKIP, exit 1, 1.24s. 사진·그래픽 H2의 `tm-hide-desktop` 부재 2건, host 인라인 `8px` 여백 1건을 실제 view에서 재현했다(실행 세션 7806).
- Product: H2에 기존 `tm-hide-desktop`만 연결했다. host의 기존 인라인 8px은 같은 scoped CSS로 옮기고 ≥1024에서 0으로 조정했다. 배지 행의 기존 8px, H1/Back/공유/CTA, 타입·색·사진/그래픽은 유지했다. 상세 title 설명 주석만 현재 역할로 갱신했다.
- GREEN: `pnpm exec vitest run src/components/matches/matches-page.test.tsx src/components/matches/matches-graphic-stack.test.tsx --maxWorkers=1 --minWorkers=1 --reporter=dot` → **2 files / 69 PASS**(새 6 + 기존 page 58 + graphic 5), exit 0, 2.16s, 세션 5532. 전체 suite·lint/typecheck/build는 실행하지 않았다.
- 기존 graphic-stack의 Next Link stub이 `prefetch=true`를 DOM에 전달하는 경고 1건이 남았다. 허용 범위 밖 test mock을 수정하지 않았고 이를 새 실패/실제 브라우저 오류로 보고하지 않는다.
- 담당자가 만든 worktree `node_modules`, `apps/v1_web/node_modules` 링크 2개는 대상 확인 후 모두 제거했다. 테스트 프로세스는 종료되었으며 install·브라우저·실제 API/DB/데이터 작업은 0이다.
- Source CSS guard는 실제 root layout→desktop/index→_shell import와 ≥1024 `display:none !important` 배선을 확인한다. 브라우저 CSS cascade/시각 가시성/AX·SR 실행이나 screenshot snapshot 검증으로 세지 않는다.
- 현재 단계: 5path candidate를 root에 인계한다. Root lint/typecheck·필수 gates·독립 review·명시 commit/PR/CI는 pending. 실제 alpha after·3폭 간격/스크롤/focus·console/network/native share는 별도 승인 배포 이후 pending이다.

- Root 독립 검토: 제품/공유 CSS·테스트 diff와 H1/hero/host·실제 desktop utility import 관계를 대조해 새 결함0. 담당자 GREEN을 자체 테스트 재실행으로 세지 않았다. Root `pnpm --filter v1_web lint`(tsc+v1-pattern) 1회 PASS, 필수 aggregate gates 6/6와 changeset policy PASS. 정확한 원격 head CI와 실제 alpha after는 후속 대기다.

## 2026-10-04 latest-dev reconciliation

PR #1591 remains Ready/base dev. Its original exact-head CI and static review passed, but current dev 27a021fc7650672d5af25217108b101dc856c8d5 adds the completed-match notice regression at the same test insertion anchor. Relocate only this issue's unchanged describe group (and #1592's two imports) to avoid that textual conflict, then integrate current dev without dropping either test contract. No runtime correction or new UI choice is introduced. The other unmerged PR's feature is excluded.

The original tests/CI above belong to their recorded SHA. Focused tests, lint and exact new-head CI after integration remain pending; actual alpha after remains with the parent's browser QA.
