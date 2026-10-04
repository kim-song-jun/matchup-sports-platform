# Task 20261017: #1439 상금 입력 폭과 #1596 같은 단계 키보드 가림

Status: Review — keyboard candidate; alpha after pending
Owner: Codex bugfix session
Created: 2026-10-03

## Context

원 #1439는 대회 생성 상금·홍보 입력 밀도와 마지막 요약을 다룬다. PR1492는 꺼진 홍보 편집 접힘을 구현했고 PR1498은 토글 노브를 다뤘다. 새 alpha 증거 c6aa94b4f25d8f94842efb95a70ea61f8155fe1b의 step4 모바일402폭에서는 상금 내용161.287506px에 긴 현금/트로피 예시가 잘렸다. 태블릿373.208344px/desktop455.40625px는 넓다. 입력/저장 실패 증거가 아니다.

## Historical Width Goal

사용자가 어드민 UI 판단을 위임했으므로 추천 A를 구현한다. 모바일 내용 input에 전체폭을 주고 이름/내용/삭제 DOM 순서와 기존 제어형 입력·저장 계약을 유지한다. 최신 fetch origin/dev base8ec820cbb37f6d438cf1d8ca354cc9ad44675e8d의 새 WT /tmp/teameet-issue-1439-width-20261003-current, branch fix/issue-1439-prize-input-full-width에서 작업한다. 이전 planning WT와 로컬문서커밋3407c80bb는 보존한다.

## Original Conditions (must all be satisfied)

- 모바일에서 중요한 입력·미리보기 내용의 충분한 폭: 현재 상금 내용 폭이 잔여다.
- OFF 홍보 입력 부담, ON/OFF 값 보존, tablet/desktop 정렬, 최종 발행 요약은 원 이슈 전체 조건이다. 이 후속 폭 변경만으로 원 이슈 전체 완료를 선언하지 않는다.

## User Scenarios

운영자는 모바일 step4에서 상금 이름·현금 또는 물품 내용을 읽고 수정한다. 항목 추가/삭제·숫자 포맷·합계·불일치·disabled와 기존 상태 보존을 유지한다.

## Test Scenarios

### Happy path

실제 PrizeBreakdownEditor와 생성/편집 caller의 name/value/삭제 DOM, 반응형 class, 제어형 입력과 실제 outgoing payload 계약을 검증한다. jsdom은 CSS pixel이나 alpha after가 아니다.

### Edge cases

단일/12개 항목, 긴 물품 문자열, mobile→tablet→desktop, Tab 순서·연속 입력·단계 왕복·접기 선택이 있으면 값 보존을 확인한다.

### Error paths

기존 합계 불일치·pending/disabled·상금 parsing/직렬화 계약을 유지한다. 서버 오류/저장 실패 재현으로 현재 placeholder 현상을 해석하지 않는다.

### Mock data updates needed

단위 테스트의 합성 fixture만 사용한다. 실제 team/QA179/완료 QA/서버 데이터 변경0.

## Historical Width Parallel Work Breakdown

- Root owned: shared prize-breakdown-editor.tsx, 새 prize-breakdown-editor.test.tsx, 이 task, .changeset/tournament-prize-input-full-width.md.
- Agent owned: new/page.test.tsx, [id]/info-section.test.tsx의 create/edit 실제 caller 회귀. Root 승인 없는 test/lint/commit/push 실행 금지.
- 정확한 최종 scope는 6path다. 공유 runtime caller·API/DTO/schema·홍보 토글·최종 요약·저장 계약과 타이슈/실제데이터 변경은 Forbidden. merge/automerge/deploy/유료리뷰 재요청0.
- Root 직렬 RED→최소CSS class수정→GREEN→lint/gates→명시pathspec commit/Ready dev PR→exact-headCI/기존중복없는독립리뷰. 별도alphaafter대기.

## Acceptance Criteria

- [x] 원 이슈와 PR1492·실제 현행 v1 공유 editor를 읽어 잔여 조건 분리.
- [x] 새 실제 alpha 상금3폭 PNG·공개 Git blob/manifest/픽셀·proof 대조.
- [x] A/B/C 서로 다른 원칙·장단점·추천·규모/공유 editor 재사용을 제시.
- [x] 실제 v1 토큰·Pretendard·44px 필드 기반 HTML artifact, 합성 제안과 actual before 분리.
- [x] A/B/C 비교 뒤 최신 사용자가 “머 어드민은 알아서해”로 해당 어드민 UI 판단을 위임했다. 답변ID Sentinel_80adafb6ef408191ab3128bae217fcae, 부모의 추천 A 구현 지시를 적용한다. 서버/정책/권한/실제데이터/파괴행동 승인이 아니다.
- [x] 승인된 A 구현과 생성·편집 초점 RED/GREEN.
- [x] v1_web lint(typecheck+pattern)와 필수 aggregate6종/changeset-policy PASS.
- [ ] 명시 커밋·Ready dev PR·정확한 head CI. PR 게시 이후 CI 결과는 같은 PR 기록으로 남긴다.
- [ ] 별도 승인 배포 뒤 실제 alpha after와 원 이슈 전체 AC 재검증.

## Tech Debt Resolved

기존3열 grid가 모바일에도 적용돼 내용 폭이 줄어드는 지점을 mobile2행/내용전체폭으로 변경했다. sm(640px)부터 기존3열을 명시적으로 유지한다. runtime 변경은 shared editor CSS class3곳이며 DOM/handlers/저장 계약을 바꾸지 않았다.

## Security Notes

공개 safe crops와 합성 데모만 사용한다. .env/신원/비밀/실제 저장·권한·경기 상태/명단을 변경하지 않는다.

## Risks & Dependencies

최종 step5, ON/OFF 입력 값 보존, actual keyboard/SR/console/network는 새 근거의 PASS 범위 밖이다. Runtime serving SHA 미관측. Layout 수정은 실제3폭 after 전 전체 완료가 아니다.

## Ambiguity Log

| Date | Raised by | Question | Resolution |
| --- | --- | --- | --- |
| 2026-10-03 | Parent | 기존1439 A 승인이 새 폭 layout에 적용되는가? | 기존 A는 OFF 홍보 접힘이었다. 별도 새 비교안을 제공한 뒤 최신 직접 위임(“머 어드민은 알아서해”)으로 추천 A를 구현한다. |

## Progress Snapshot

### Historical planning (implementation approval 전)

2026-10-03: 승인된1587/1588/1586을 우선 진행하면서 새1439 실제 근거와 shared editor의 grid minmax(0,.8fr)/minmax(0,1.2fr)/44px을 대조했다. 제품 수정0, 서버 쓰기0. 사용자 선택 전 private 비교안만 준비한다.

- 비교안: A추천(기존 input/DOM 이름→내용→삭제를 유지하며 mobile내용 전체폭2행), B(명시적 라벨·전체폭 세로), C(행별 요약→접기/편집). C는 추가 클릭·focus·값 보존 검증이 늘며 이전1492 A 승인을 새 layout 승인으로 확대하지 않는다.
- Private source 기반 HTML `teameet-1439-prize-input-width-options.html`을 Library에 저장했다. 실제 토큰·Pretendard와 unchanged v1 prize 순수 formatter,44px input/삭제를 사용한다. actual before3장 bytes/SHA256 동일. 공개Gitblob7/7, 선택한3PNG manifest3/3·직접 픽셀 확인;18장 전체를 검증했다고 주장하지 않는다.
- Artifact 자체 core jsdom: 미선택·A/B/C·JS모바일분기·raw입력 identity·현금/물품 미리보기·추가/삭제focus·12개제한·접기값보존·frame폭402/787/1181와dark 전환 PASS. 처음 빌드의 JS newline escaping을 수정했으며, jsdom의 기본innerWidth1024에 의한 C분기 testfixture를402로 명시한 뒤 PASS했다. 이 결과는 CSS pixel/native키보드/browser/alphaafter 검증이 아니다.
- Independent read-only 검토는 A를 권고했다. 공유 editor는 생성step4와 기존대회info-section에도 사용되며 stable row.id·input identity·12개제한·pending·권한·parser/합계/직렬화를 보존해야 한다. Header wrapper로DOM을 이름→삭제→내용으로 바꾸지 않는 CSS배치를 우선한다.80자전체가 한 번에 보인다고 보장하지 않는다.
- 제품변경/실제서버/API/브라우저/데이터 쓰기0. 선택 전 이 task 계획문서만 유지한다. 구현·새PR·배포·after는 대기하며1439원문 전체조건의완료/종료판정은하지않는다.

- 최신 승인 반영: 이전 비교안 단계의 “선택대기/제품0”는 historical snapshot이다. 지금 A의 mobile2행/내용전체폭을 구현하며 640px이상 기존3열을 유지한다. 이름→내용→삭제 DOM·row.id/input identity는 그대로 둔다. 이전1439승인을 추론한 것이 아니라 새 직접위임을 적용했다.

### Historical width implementation — 2026-10-03 UTC

- A: 모바일 이름+삭제 1행, 내용 전체폭2행; sm부터 기존3열. 기존 이름→내용→삭제 DOM/Tab 순서와44px control, stable row.id, input identity, maxLength20/80를 유지한다. 모바일 시각 위치에 따른 Tab 이동은 내용 아래→삭제 위로 이어지며 native keyboard/SR 평가는 alpha 잔여다.
- RED: 공유 editor 신규7 중 layout1 FAIL/기존6 PASS, 실제 생성+편집 신규5 중 layout2 FAIL/나머지3 PASS(기존72 skipped). 최초 ARIA fixture가 datalist 이름을 textbox로 찾은 오류는 combobox로 수정했다. 그 fixture 오류는 제품 결함으로 세지 않는다.
- GREEN: editor7 + 생성65 + 편집12 + prize formatter27 + 생성model19 =5파일130 PASS. 실제 editor/route state와 mutation 경계 payload를 검증하며 HTTP/실제 저장/재조회/서버권한을 증명하지 않는다.
- 새 증거의 before3장 공개 raw URL은 OS curl TLS 검증으로 다운로드 성공했으며 검증된 local bytes/SHA256와3/3 일치한다. Python urllib의 로컬 issuer 인증서 오류는 OS trust curl로 해결했으며 TLS 우회0. 공개 증거 source는 c6aa94b4f25d8f94842efb95a70ea61f8155fe1b이다.
- create before는 실제 alpha CSS402×606 /787×505 /1181×757, serving SHA 미관측. 기존 대회 edit의 matching alpha before는 미확보다. 새 alpha after는 별도 승인 배포 후 같은 조건으로 수행해야 한다. 최종요약·홍보 ON/OFF 값 보존·native keyboard/SR·전체 console/network는 이 변경으로 PASS를 선언하지 않는다.
- Peer static review: editor CSS3곳·주변 v1 계약에서 scoped actionable0. 검토자가 추가한caller2test 자체의 독립성을 주장하지 않으며 test/build/browser 실행0. 정적 검토는 실제 alpha PASS 또는 Sonnet 리뷰가 아니다.
- 관련 없는 WIP/다른 세션/실제 서버 데이터 쓰기0. #1439 전체 원 수용 조건이 남아 OPEN/Refs 유지한다. merge/automerge/deploy/유료리뷰 재요청0.

- Commit 직전 검증: v1_web lint/tsc+pattern PASS 1회, DB guardrails/production deploy security/compose parity/alpha seed runtime/Android policy/alpha immutable deploy6종과 changeset-policy PASS. 신규 debt marker0/diff whitespace0. Root 소유 deps symlink2개만 회수; local Next/브라우저/서버 프로세스 생성0.

## Current Goal — Same-Step Keyboard Reveal (2026-10-04)

Refs [#1596](https://github.com/kim-song-jun/matchup-sports-platform/issues/1596); related #1439. #1596은 actual alpha after 전까지 OPEN을 유지한다. 이 담당자의 새 issue 생성/게시0.

폭 변경 PR1593은 2026-10-03 17:07:04 UTC에 병합됐다. 이후 부모의 실제 alpha 검사(2026-10-04 05:47:30.351 UTC, CSS402×606)에서 첫 상금 이름부터 Tab7을 누르면 3번 내용에 focus하지만 scrollY947.20이 그대로이며 input y539.26–583.26 전체가 fixed footer y536.80–605.60 뒤에 가린다. 약85초 뒤와 Shift+Tab 재진입에도 유지되고 직접 스크롤하면 회복된다. 같은 경로의 tablet788×505(input bottom378.17/footer top436)와 desktop1182×757(bottom504.5/top688)은 가림 없음이다. 이 관측은 부모의 브라우저 실행이며 이 구현 담당자의 독립 실행이 아니다.

공개 고정 원본: [README](https://github.com/kim-song-jun/matchup-sports-platform/blob/044a2798fb4a9c1fdbfc968ade11fe8375c32b56/docs/qa/2026-10-04-prize-footer-focus/README.md), 같은 폴더 proof.json 및 mobile-third-content-tab.png. 부모가 원격16파일 hash와4PNG 픽셀을 검증했다. 정확한 mobile bottom583.2625122070312/footer top536.7999877929688에 ring margin4를 더한 최소 이동은50.4625244140625px다. Mobile raster402×605와 CSS402×606을 구분한다. 수동 scroll 회복은 새 fix after가 아니다. 이 담당자는 이를 자체 이미지/HTTP 검증으로 세지 않는다. Serving SHA는 unknown이며 zoom CSS 검사에서 실제 물리 모바일 키보드·IME·SR 및 viewport resize는 미검증이다. #1439 전체 잔여와 별도 키보드 issue #1596을 구분한다. 부모 issue worker가 #1596을 등록했으며 이 담당자는 issue를 생성/게시하지 않았다.

현재 목표는 같은 단계에서 실제 활성 control이 footer/visual viewport에 가릴 때만 최소 스크롤로 드러내는 것이다. 단계 제목/첫 오류 focus, 입력 identity/값, DOM/Tab 순서, mobile2행/sm3열, 생성·저장·업로드·권한 계약은 유지한다. 부모가 fresh fetch 직후 생성한 base27a021fc7650672d5af25217108b101dc856c8d5의 /tmp/teameet-issue-1439-prize-focus-20261004, fix/issue-1439-prize-keyboard-reveal에서 작업한다. 이전 폭 변경의 Goal/병렬 소유권/검증 결과는 위 historical snapshot이다.

## Parallel Work Breakdown — Current Follow-Up

- 구현 담당 owned6: apps/v1_web/src/app/admin/tournaments/new/page.tsx, wizard-stage-viewport.ts, 신규 wizard-stage-viewport.test.ts, page.test.tsx, 이 task, .changeset/tournament-prize-keyboard-reveal.md.
- Forbidden: shared editor/globals/admin shell/API/DTO/create model/DB/browser/다른 WT/GitHub 게시/commit/push/merge/deploy/creator 퇴장 정책. 부모가 새 이슈·증거 업로드와 후속 lint/gates/커밋/PR/CI를 소유한다.
- 사용자 계속 진행 승인(2026-10-04, 부모 전달)을 적용한다. 화면/CSS 재설계 없이 focus/scroll event 로직만 보정하므로 CLAUDE.md337의 로직 전용 예외를 적용한다. 이전 폭 layout의 A 승인을 새 디자인 선택으로 확대하지 않는다.
- 실제 page Tab7 RED 후 최소 구현, host preflight·worker1 직렬 초점 RED→GREEN만 승인됐다. full suite/lint/build/install 금지. 작업 WT에 만든 deps symlink2개만 기록 후 회수한다.

## Acceptance Criteria — Current Follow-Up

- [x] 실제 page/editor Tab7 가림 RED→GREEN 및 기존 stage/error focus 회귀.
- [x] 활성 control에 한해 cancelable RAF/current activeElement/connected/fields containment와 실제 scroller/footer/visual viewport/ring/clamp/cleanup 적용.
- [x] tablet/desktop no-op·Shift+Tab 재진입·연속 입력·예약 취소·footer 제외·mutation0을 좁게 검증.
- [x] owned6 candidate/검증수/한계·deps 회수를 root에 인계. lint/gates/committed-tree/PR/CI와 alpha after는 root 후속이다.
- [ ] 별도 승인 배포 후 actual after를 검증하며 #1439 전체 QA 완료는 주장하지 않는다.

## Test Scenarios — Current Follow-Up

실제 생성 page와 공유 editor를 렌더하고 첫 이름에서 userEvent Tab7로 3번 내용에 진입한다. focus와 scroll에 연결된 rect 가시성을 검증한다. 문서/내부 scroller, tablet/desktop no-op, 역방향 재진입, 빠른 focus 취소, 단계 이동·unmount cleanup, visual viewport와 scroll 최대 범위를 검사한다. API hook/viewport/RAF/scroll geometry는 합성 경계이며 실제 CSS·키보드·저장 proof가 아니다. 기존 단계 제목/첫 오류 focus와 create/update/upload/status mutation0을 유지한다.

## Progress Snapshot — Current Follow-Up

- Base27a021fc7650672d5af25217108b101dc856c8d5, 새 WT/branch는 부모가 생성했고 착수 시 clean이었다. 부모 단독 브라우저 관측 외 구현 담당자의 browser/DB/실제 mutation/remote writes0.
- 원인: stage helper는 state.step 전환에만 실행되고 form pb-28은 마지막 스크롤 공간만 만든다. 같은 단계 Tab focus에는 fixed footer 가림 보정 handler가 없다. #1437(PR1473/1493/1562)의 stage/error focus, #1464(PR1589)의 row identity 유실과는 다른 경계다. 관련 열린 dev PR 검색에 중복이 없었다; 새 이슈 생성0.
- 정본 RED: 기존 runtime 그대로 신규 page11 중6 FAIL/5 PASS, 기존65 SKIP. Document/internal Tab7과 Shift+Tab에서 active 내용3 bottom583.2625가 footer-ring532.801보다 아래여서 실패하며 rapid focus/visual viewport/예약 cleanup도 실패한다. 처음 실행7FAIL에는 real Providers의 별도 KeyboardViewportBridge RAF와 불완전 viewport fixture 오류가 섞였다. 그 오류를 제품 결함으로 세지 않고 실제 bridge API/shared RAF에 맞춰 fixture를 보정한 뒤6FAIL 결과를 정본으로 남겼다. 보정된 신규11 RED에서 act 경고0.
- 제품2: field wrapper focus capture가 native focus 뒤 RAF에 현재 active/connected/contained control만 확인한다. 이전 예약과 unmount 예약을 취소하며 실제 scroller에서 header/footer/visual viewport bounds와4px ring margin을 사용해 필요한 만큼 instant scroll,0/maxScroll clamp한다. Stage reveal의 기존 계산은 공통 private bounds로 이동했으며 stage/error behavior를 바꾸지 않는다. 첫 오류 flag는 try/finally로 control.focus 동안 true를 유지해 새 capture가 기존 smooth center 이동을 덮지 않게 하고, 경로 종료/예외 시 false로 회수한다.
- GREEN: worker1/file serial로 page.test.tsx76(기존65+신규11) + wizard-stage-viewport.test.ts 신규8 =2파일84/84 PASS,7.56s. ValidatorPID47388/PPID17715, exec session90312은exit0으로 종료됐다. 새 page11에서 act 경고가 없었으며 전체 page 실행 중 기존 테스트명들에는 PersistQueryClientProvider act 경고가 출력됐다. Warning-free 전체 검증으로 주장하지 않는다. Helper8은 document/nested·ring-only·이미 보임·위쪽 appbar·visual viewport·max bound·in-flow footer를 검사한다. 부족한 scroll 범위의 테스트는 full visibility를 주장하지 않는다.
- Host preflight: CPU12,load15.34/11.09/8.85,swap used3312.12MB,Node121/browser40, 기존 타 프로젝트 Docker 상태만 조회했다. 명시 진행 승인에 따라 최소worker1만 실행했고 다른 process/서비스를 변경하지 않았다. root의 기존 dependency 디렉터리에 연결한 작업 WT 소유 node_modules 및 apps/v1_web/node_modules symlink2개만 생성해 사용 후 회수했다. Install/local Next/browser/DB0, full suite/lint/build0.
- 현재는 base27a021 위 owned6 미커밋 candidate다. 부모 rect는 geometry fixture로만 사용했으며 실제 CSS/alphaafter/native mobile keyboard/IME/resize/SR/HTTP 저장·권한을 검증하지 않는다. 공개 proof/issue 등록은 부모 담당이고 정본 #1596을 refs로 연결했다. Root가 최신 dev 동기화·독립 review/lint/gates/명시 commit/PR/CI를 이어간다.

### Root integration and verification cursor — 2026-10-04

Root read the public fixed-SHA README/proof rows7/8/10/12/20/30 and directly inspected the mobile PNG (SHA256 9750a00b4a8d4999af21340795f00d292be7d45fea6078e9c5a35623af8d88a5). The image hides the field; active identity is established by the paired DOM/Tab ledger, not by guessing its pixels. Manual recovery is not a deployed after. Parent owns issue1596 and browser; no new issue or browser session is created here.

Root static review preserves the original stage bounds calculation in its extracted private helper and the existing first-error center/smooth contract through a true-during-focus flag. The candidate adds no CSS/form order/input serializer/API contract. Root corrected the reverse re-entry test to exactly follow the observed content3 → Tab delete3 → Shift+Tab content3 path. The implementer's84PASS belongs to its dirty base27a candidate; root will verify the final committed tree after current dev606977780cd758b20b23cd78614a9693098153fa integration. Only this task's6paths are implementation-owned; the Git merge brings already-merged base changes, never another open PR. Final focused tests/lint/6gates/changeset policy/remote CI and independent PR review follow. Actual alpha after, physical IME/resize/SR and save outcomes remain pending.
