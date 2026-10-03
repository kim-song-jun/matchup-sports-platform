# Task 20261007: 개인매치 레일 키보드 포커스 카드 가시성 (#1569)

Status: Review (alpha after pending)
**Owner**: Codex issue fixer
**Created**: 2026-10-03

## Context
[원 이슈 #1569](https://github.com/kim-song-jun/matchup-sports-platform/issues/1569): CSS405×606의 추천 중간 카드 Tab/Shift+Tab에서76.8/276px만 보인다. 태블릿은272/276px, 데스크톱320/320px이며 Enter3목적지는 정상이다. base `dbb6468d81809649026e6a9c193d5a982f8a57b6`의 feature/nearby 두 레일은 overflow-x:auto+x mandatory+child start이며 포커스 가시성 보정이 없다. snap이 브라우저에서 관찰된 잘림의 원인 후보지만 실제 원인 실험을 한 판정은 아니다.

## Goal
레일보다 작은 카드의 키보드 포커스가 좌우 모두 카드·링까지 표시되도록 레일 안에서만 즉시 이동하며 기존 링크/마우스/모션 계약을 유지한다.

## Original Conditions (must all be satisfied)
- [ ] Tab/Shift+Tab 양쪽에서 들어갈 수 있는 카드와 포커스 경계가 전체 표시된다.
- [ ] 포커스 순서·Enter3목적지·from·목록 필터 유지.
- [ ] 태블릿/데스크톱 정상 표시 및 mouse/touch snap 유지.
- [ ] 별도 승인된 alpha 배포 후 동일3폭·양방향 실제 이미지/DOM 증거를 남긴다.

## User Scenarios
1. 마지막 종목 링크→추천 첫/중간/끝 링크 Tab, 역방향 Shift+Tab.
2. 이미 표시된 카드/데스크톱에서 불필요한 수평 이동 없음.
3. 마우스 클릭, Enter 활성화 및 from/필터 복귀.
4. 레일보다 큰 카드에서는 완전 표시를 가장하지 않고 native 탐색을 유지한다.

## Test Scenarios
### Happy path
- [x] 실제 MatchListPageView 두 레일에서 userEvent Tab/Shift+Tab, 동적 rect+scrollLeft로 좌우 카드·4px 링 가시 영역을 확인한다.
### Edge cases
- [x] first/middle/last, 이미 표시, oversize, 소수 geometry, mouse, Enter/from, instant 모션.
### Error paths
HTTP/쓰기 계약 변경 없음. 새 fallback·가짜 성공을 만들지 않는다.
### Mock data updates needed
Inline 합성 view model만 사용한다. 실제 view/카드/핸들러는 유지하고 jsdom에 없는 layout/scroll/focus-visible modality만 통제한다. native snap/실제 CSS viewport 검증으로 해석하지 않는다.

## Parallel Work Breakdown
- 메인 owned: matches-page.tsx의 두 rail focus 처리, globals.css의 해당 rail gutter/키보드 snap 예외, 전용 테스트, task, Changeset.
- 읽기 전용 조사/후속 리뷰 child: 관련 v1·공용 focus 계약 검토. 수정/실행/커밋0.
- Forbidden: API/DTO/추천 순서/링크/포커스 순서/공용 global focus 디자인/다른 미병합 PR/실제 데이터.
- 기존 기대 동작의 기계적 focus·4px gutter 교정이며 화면 구조·카드 크기·간격/디자인 결정은 유지한다. 새 UI 3안 선택 대상이 아니다.

## Acceptance Criteria
- [x] 초점 계약 RED→GREEN 및 기존 view 회귀 PASS.
- [x] lint/typecheck, 필수6gates, Changeset, diff/debt 확인 PASS. 명시5경로 커밋/clean-tree는 커밋 후 PR 기록에서 확인한다.
- [ ] Ready/dev PR·정확한 head CI·독립 정적 리뷰 결과 기록.
- [ ] 실제 alpha after 원 수용 조건은 승인 배포 뒤 별도 검증.

## Tech Debt Resolved
동일 카드로 구성한 feature/nearby 레일의 키보드 가시 영역 보정을 재사용한다.

## Security Notes
실제 사용자/합성 QA 데이터 쓰기0, QA179 명단/완료 결과/권한 변경0. 병합·자동병합·배포·유료 리뷰 재요청0. 새 저장값/API 없음.

## Risks & Dependencies
`:focus-visible`/`:has`/native focus scroll과 CSS ring/ancestor clip은 실제 alpha에서 확인해야 한다. JS-only snap 재선택을 피하도록 keyboard focus 동안 해당 rail의 snap만 해제한다. oversize는 전체 표시 PASS로 세지 않는다. 기존 outline2px+offset2px의4px gutter이며 페이지 세로 스크롤을 코드로 바꾸지 않는다.

## Ambiguity Log
| Date | Raised by | Question | Resolution |
|---|---|---|---|
| 2026-10-03 | geometry 검산 | tablet272는 rail 전체폭인가? | rail rect/client560이며 중간276card 교차272다. 카드+링284가 rail에 들어갈 수 있다. |
| 2026-10-03 | v1 코드 조사 | CSS만이면 충분한가? | keyboard snap 예외+레일 한정 bounded focus scroll로 계약을 검사하며 native after는 배포 대기다. |

## Progress Snapshot
- PR1570 exactCI 완료 뒤 최신 dev에서 `/tmp/teameet-issue-1569-20261003`, `fix/issue-1569-match-rail-keyboard-visibility` 생성. PR1570 미병합 코드는 포함하지 않는다.
- 실제 공개 증거SHA `8a460f9c03fbd5b5d9ecb13a96c4bc9163bcc296`, `docs/qa/2026-10-03-individual-rail-focus/`:10/10 HTTP/Gitblob/bytes, manifest9/9 SHA256, 실제4PNG pixels/raster/provenance, focused rect17/17 및 Enter destination3/3 검산 PASS. 별도 클릭 재실행0.
- 실제alpha 관찰03:52:42.164–03:57:36.039 UTC. CSS405×606/789×505/1183×758, crop373×251/565×250/992×276. 배포 serving SHA 미관측. 수정 after는 별도 승인된 alpha 배포 대기, 이슈 OPEN/Refs 유지.
- 수정 전 신규16계약 테스트8FAIL/8PASS → 수정 후16PASS. 기존 matches-page58PASS 포함 총74PASS. jsdom geometry/pseudo/scroll 경계 통제이며 실제 native snap/터치/3폭 alpha 검증이 아니다.
- 두 rail만 onFocus 재사용, focus-visible/direct card/이미 표시/oversize 경계, instant 수평 보정. CSS4px gutter와 keyboard snap:none; 카드276/320, gap12, href/from/순서/마우스 기본 snap 유지.
- lint(typecheck+v1 patterns), 필수6aggregate gate PASS. touched TODO/FIXME/HACK/XXX0. 전체 테스트/빌드는 정확한 원격 head CI에서 수행하고 PR에 결과를 기록한다.
