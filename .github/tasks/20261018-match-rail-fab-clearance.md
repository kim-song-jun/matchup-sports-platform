# Task 20261018: 개인 매치 추천 레일의 FAB 가림 보정

Status: Review
**Owner**: Codex delegated implementation → root review/commit/QA
**Created**: 2026-10-04

## Context

부모가 실제 alpha CSS402×606에서 마지막 사진 추천 카드의 비용 메타와 만들기 FAB 교차를 관찰했다. 관련 비용 의미 작업은 #1586 / PR1592, 원래 키보드 수평 가시성은 #1569 / PR1572다. 부모 이슈 담당자가 생성한 [#1601](https://github.com/kim-song-jun/matchup-sports-platform/issues/1601)에 Refs로 연결하며 이 구현 작업자는 중복 이슈를 생성하지 않는다.

공개 before 정본: [MOBILE-FAB-OBSERVATION.md](https://github.com/kim-song-jun/matchup-sports-platform/blob/399dee0831ab2c7034cbd0bc8c0694554926ab9f/docs/qa/2026-10-04-individual-cost-label-after/MOBILE-FAB-OBSERVATION.md), [실제 crop](https://raw.githubusercontent.com/kim-song-jun/matchup-sports-platform/399dee0831ab2c7034cbd0bc8c0694554926ab9f/docs/qa/2026-10-04-individual-cost-label-after/mobile-last-photo-cta-overlap.png). 이 커밋은 evidence 버전이며 serving SHA가 아니다. 이 작업자는 문서만 원격 read했으며 PNG pixel/hash 검증은 publisher/부모의 관측으로 구분한다.

공개 기록의 list DOM은 2026-10-04 07:27:08.874 UTC, overlay DOM .890, screenshot 호출 .894–.914이다. CSS402×606, main scroll0/rail scrollLeft490.399994이며, 마지막 `t` 카드는 별도 합성 overlap fixture다. 비용 detail 3폭 대조의 primary numeric fixture와 동일하다고 주장하지 않는다. Metadata x122.400002–364.800011/y477.200012–493.200012와 FAB x325.600006–381.600006/y458–514의 **39.200005×16px** 교차는 metadata block의 rect이며 글리프별 paint 가림 치수가 아니다. Publisher는 실제274×68 crop에서 마지막 숫자의 일부 가림을 확인했다. 다른 숫자는 보이며 값의 완전 유실/결제 영향/PR1592의 인과 회귀나 모든 폭의 결함은 입증하지 않았다. Child 실제 browser/독립 pixel 확인0, 새 after 없음.

최신 origin/dev fetch 직후 생성한 전용 worktree base는 `45b9f0756b70d3b80801d5f5f2b43c692e007d1a`이다. 부모가 관찰한 `5372ea9c3640621eb270d15c54c70a822b97d536`과 관련 matches page/test/client/mapper·globals·shell/frame/test 8개 blob은 같다. 공개 증거 SHA와 serving SHA를 혼동하지 않는다.

## Goal

기존 만들기 FAB·카드 폭·간격·원문·상세 링크를 유지하고 모바일 레일 끝 및 키보드 초점에서 FAB와 읽을 카드가 겹치는 범위를 보정한다.

## Original Conditions (must all be satisfied)

- [x] 기존 FAB·작성 목적지·비용 원문/라벨·카드276/320px·gap12px·crop·상태/인원/필터/from를 유지한다.
- [x] 레일 끝에는 FAB 토큰을 사용하는 여백을 두며 desktop은 기존값을 유지한다.
- [x] 키보드 초점은 같은 frame의 실제 FAB와 카드가 세로로 겹칠 때만 FAB 앞의 유효 가시 범위를 사용한다.
- [x] 실제 FAB가 없거나 숨겨짐/겹침없음/마우스이면 기존 계약을 유지한다. 축소 폭·scroll bound에서는 불가능한 전체 표시를 성공으로 표현하지 않는다.
- [ ] 부모 단독 alpha before/after·3폭·Tab/ShiftTab·manual 끝 스크롤·console/network로 시각 판정을 남긴다.

## User Scenarios

사용자는 추천 레일의 끝 카드를 넘겨 비용 원문을 읽고, Tab/ShiftTab으로 카드에 이동해 만들기 버튼 아래에 가려진 내용을 확인한다. Enter로 원래 상세에 들어가며 만들기 버튼도 기존 작성 경로로 이동한다.

## Test Scenarios

### Happy path

- [x] 실제 MatchListPageView와 AppShellFrame의 FAB/링크를 실행하여 두 rail의 정·역 Tab에서 가시 범위를 확인한다.
- [x] 말미 여백은 실제 CSS source의 FAB token contract와 synthetic manual maxScroll을 함께 검증한다.

### Edge cases

- [x] 작은 폭, 마지막 카드, FAB와 세로 교차하지 않는 카드, 숨겨진 FAB, mouse, Enter/from, instant motion을 대조한다.
- [x] 수평으로 온전히 들어갈 수 없는 FAB 제외 폭은 actual scroll container의 bounded 보정/부족한 범위를 구분한다.

### Error paths

읽기/스크롤 표시 전용이다. API mutation·실패 fallback·권한 변경을 추가하지 않는다.

### Mock data updates needed

신규 fixture는 test 내부 합성 카드/geometry뿐이다. 실제 API/DB/seed/MSW는 변경하지 않는다. jsdom geometry와 focus-visible modality/Next navigation은 통제된 경계이며 실제 CSS/native snap·alpha 픽셀 증명이 아니다.

## Parallel Work Breakdown

- UI 선택: 부모가 사용자 위임 `너가 알아서 다 고치고`와 함께 **A(기존 FAB 유지·레일/키보드 노출 보정)를 명시 승인**했다. 기존 PR1284 A 승인을 이번 새 레이아웃 승인으로 대신하지 않는다.
- Child: 전용 worktree의 아래 5개 경로 구현·초점 RED/GREEN·후보 인계.
- Root: 별도 팀매치 소스, 독립 리뷰·lint/gates·명시 commit/PR/CI·부모 단독 alpha 검증.

### Owned files

- `apps/v1_web/src/components/matches/matches-page.tsx`
- `apps/v1_web/src/components/matches/matches-rail-focus.test.tsx`
- `apps/v1_web/src/app/globals.css`
- `.github/tasks/20261018-match-rail-fab-clearance.md`
- `.changeset/match-rail-fab-clearance.md`

### Forbidden files/actions

다른 파일·shared shell·team-matches·API/DTO/model/DB·실데이터·브라우저/로컬 Next·전체 suite·commit/push/GitHub 게시/issue 생성·merge/deploy·유료 review. 다른 세션 변경이 보이면 멈추고 부모에게 보고한다.

## Acceptance Criteria

- [x] fresh origin/dev base·clean dedicated worktree·중복 조사 고정.
- [x] A 승인 선행. CLAUDE337의 레이아웃 A/B/C 규칙 대상이며 logic-only 예외로 간주하지 않는다.
- [x] 실제 renderer의 집중 RED→GREEN 및 기존 #1569 회귀.
- [x] 정확 5path candidate·diff check·새 debt marker·dependency link cleanup.
- [ ] Root lint/gates·committed-tree/CI·독립 review.
- [ ] 실제 alpha 시각 after/3폭 검증. 로컬 테스트 PASS는 전체 QA 완료가 아니다.

## Tech Debt Resolved

기존 FAB 끝 여백과 rail focus 보정이 서로 다른 가시 영역을 쓰는 범위를 정리한다. 공유 FAB/shell 정책을 재설계하지 않는다.

## Security Notes

합성 view/geometry·공개 GitHub read만 사용한다. `.env*`, 비공개 사용자 기록/비밀은 읽지 않고 API/DB 쓰기 0이다.

## Risks & Dependencies

끝 padding은 수평 scroll 종착점을 늘릴 뿐 모든 중간 viewport 교차를 자동 해소하지 않는다. 기존 PR1284의 shell 세로 하단 여백도 임의 스크롤 위치의 겹침 방지 계약은 아니다. 축소 폭은 같은 main을 위로 드러내되 scroll range가 부족하면 clamp 상한에서 교차가 남을 수 있다(회귀 fixture로 명시). 카드가 rail보다 큰 기존 oversize 조건도 보정하지 않는다. 매우 긴 카드의 세로 가시 영역·실제 native snap/physical keyboard/IME/다크모드/resize는 alpha 후속 검증 경계다. 공용 shell 변경은 없다.

## Ambiguity Log

| Date | Raised by | Question | Resolution |
|---|---|---|---|
| 2026-10-04 | Parent | 실제 crop의 마지막 금액 가림 | Public before399dee0831ab2c7034cbd0bc8c0694554926ab9f 확정. Publisher 확인, issue는 부모 전달 대기. Child 독립 픽셀 검증 아님. |
| 2026-10-04 | Codex | 기존 FAB 수정과 중복 | PR1284 merged는 세로 끝 여백, #1569 closed/PR1572 merged는 수평 keyboard ring. 열린 FAB/rail 가림 검색 각각0건. 새 issue 생성0. |
| 2026-10-04 | Codex | 축소 폭에서 full-card+ring | FAB 제외 수평 폭이 부족하면 bounded vertical 대안을 검증하고 scroll limit의 잔여를 기록한다. |

## Progress Snapshot

2026-10-04: 부모 A 승인 후 latest origin/dev `45b9f0756b70d3b80801d5f5f2b43c692e007d1a`에서 `/tmp/teameet-match-rail-fab-clearance-20261004`, branch `fix/match-rail-fab-clearance`를 만들었다. 현재 정확5path dirty candidate이며 commit/push/GitHub 게시/browser/DB 0이다. 실제 alpha after 미검증.

- RED: 실제 view+AppShellFrame에서 신규12 중 **9 FAIL / 3 PASS**, 기존16 SKIP. 실제 FAB 교차/축소 폭 보정 부재, 말미 CSS·desktop 복원 부재로 실패했다. Provider/fixture 오류 없음. 1worker, 2.49초, session22116 exit1.
- GREEN: 같은 집중 file **28/28 PASS**(기존16+신규12), 1worker, 7.10초, session84502 exit0. 제품은 실제 frame FAB rect의 세로 교차에서만 수평 right를 좁히고, 카드가 FAB 제외 폭에 안 들어가면 같은 main을 instant/clamp로 위로 드러낸다. Style source의 말미 var 토큰과 synthetic manual maxScroll을 검증하며 실제 CSS 해석/native snap/alpha pixel PASS로 확대하지 않는다.
- 좁은 scroll range fixture는 main 상한68에서 멈추고 카드/FAB 교차가 남는 것을 확인한다. 이것을 전체 노출 성공으로 세지 않는다. Mouse/숨김/no-overlap/desktop/FAB 작성 href/Enter/from 및 기존 oversize·reduced motion 계약 유지.
- Preflight 07:52:45 UTC:12cores, load12.77/11.10/11.06, swap4856.5/6144MB, Node/browser162 CPU합계52.4%, Docker8Up/6healthy. 부모가 root 검증을 멈춘 slot에서 좁은 작업만 직렬로 실행했다. 테스트 도구 timezone의16:53/16:54는 UTC07:53/07:54와 구분한다.
- 직접 생성한 node_modules/app node_modules symlink2개만 원래 target을 확인하고 제거했다. 다른 process/container를 종료하지 않았다. Diff check PASS, touched TODO/FIXME/HACK/XXX0, 5path만 변경. Lint/build/fullsuite/브라우저는 실행하지 않았고 root 후속 소유다.

### Root integration and independent review

- Root가 공개274×68 PNG를 직접 열어 마지막 숫자 일부 가림을 확인했다. SHA256 `e1207aa75c5ef83bf48595f132355d261e6aa39950b3a8a70c6853d577a79aea`. private 원본→crop equality는 별도 collector attestation이며 직접 확인하지 않았다.
- Child가 작성한 실제 renderer·padding·focus algorithm과 bounded geometry fixture를 root가 독립 정적 검토했다. 기록한 작은 폭/scroll bound/oversize 한계는 남으며 전체 pixel/QA PASS로 확대하지 않는다.
- 외부 PR1600 병합 이후 fresh dev4c81d071ede5bba14575f2aeb1097326797cbd08로 전용 branch FF, own3path patch만3-way 복원했다. conflict0. 성별 표시 변경은 이미 병합된 base이며 이번 PR diff에 재구현하지 않는다. stash/reset/restore0.
- User 승인 commit/push/Ready dev PR은 root가 수행한다. 위 Forbidden의 commit/push/GitHub 금지는 child 범위이며 root 인계 후 승인된 작업을 막지 않는다.
- 정확한 committed head CI/6guard/lint와 최종 root review는 후속 기록. 실제 alpha after는 별도 승인된 배포와 부모 QA 대기. 이슈를 자동 종료하지 않는다.

### Final local verification on integrated dev4c81

- Root 실행: 실제 matches page·AppShellFrame·rail3file **117/117 PASS**(rail28/page84/shell5), 1worker 직렬8.48초. Child base45의 집중28PASS와 root117PASS는 서로 다른 tree의 실행이며 유니크 총145로 합산하지 않는다.
- Root lint(typecheck+v1-pattern) PASS1회, 필수6guard(Android Play/v1 DB/prod security/compose parity/alpha seed/alpha immutable) PASS. 전체 unit/integration/build와 CI 계약은 exact remote head CI 소유.
- Root independent static review: keyboard-only/direct rail child/gutter/FAB actual rect/hidden·vertical overlap 조건, 같은 main의 bounded instant fallback, native clamp·desktop restoration·원래 destinations를 대조. 현재 scope의 유효 추가 P1/P2 지적0. 이것은 browser/native snap proof가 아니다.
- 최신 preflight12cores/load16.68/27.38/38.61, swap11118.38/12288MB, Node205/browser47/Docker8up5healthy. 1worker직렬, 남의 프로세스/container 정리0.
- Diff check/debt marker/정확5path와 owned dependency symlink2개 cleanup을 완료하고 pathspec commit한다. after/3폭/native 키보드/수동 end snap·console/network는 별도 alpha 대기.
- PR은 Refs #1601·Ready/dev로 만들고 정확 head CI 결과는 PR 기록에 구분한다. merge/automerge/deploy/유료 review0.
