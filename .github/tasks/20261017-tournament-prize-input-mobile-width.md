# Task 20261017: #1439 잔여 모바일 상금 내용 입력 폭

Status: In Progress — A delegated approval
Owner: Codex bugfix session
Created: 2026-10-03

## Context

원 #1439는 대회 생성 상금·홍보 입력 밀도와 마지막 요약을 다룬다. PR1492는 꺼진 홍보 편집 접힘을 구현했고 PR1498은 토글 노브를 다뤘다. 새 alpha 증거 c6aa94b4f25d8f94842efb95a70ea61f8155fe1b의 step4 모바일402폭에서는 상금 내용161.287506px에 긴 현금/트로피 예시가 잘렸다. 태블릿373.208344px/desktop455.40625px는 넓다. 입력/저장 실패 증거가 아니다.

## Goal

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

## Parallel Work Breakdown

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

### Current implementation — 2026-10-03 UTC

- A: 모바일 이름+삭제 1행, 내용 전체폭2행; sm부터 기존3열. 기존 이름→내용→삭제 DOM/Tab 순서와44px control, stable row.id, input identity, maxLength20/80를 유지한다. 모바일 시각 위치에 따른 Tab 이동은 내용 아래→삭제 위로 이어지며 native keyboard/SR 평가는 alpha 잔여다.
- RED: 공유 editor 신규7 중 layout1 FAIL/기존6 PASS, 실제 생성+편집 신규5 중 layout2 FAIL/나머지3 PASS(기존72 skipped). 최초 ARIA fixture가 datalist 이름을 textbox로 찾은 오류는 combobox로 수정했다. 그 fixture 오류는 제품 결함으로 세지 않는다.
- GREEN: editor7 + 생성65 + 편집12 + prize formatter27 + 생성model19 =5파일130 PASS. 실제 editor/route state와 mutation 경계 payload를 검증하며 HTTP/실제 저장/재조회/서버권한을 증명하지 않는다.
- 새 증거의 before3장 공개 raw URL은 OS curl TLS 검증으로 다운로드 성공했으며 검증된 local bytes/SHA256와3/3 일치한다. Python urllib의 로컬 issuer 인증서 오류는 OS trust curl로 해결했으며 TLS 우회0. 공개 증거 source는 c6aa94b4f25d8f94842efb95a70ea61f8155fe1b이다.
- create before는 실제 alpha CSS402×606 /787×505 /1181×757, serving SHA 미관측. 기존 대회 edit의 matching alpha before는 미확보다. 새 alpha after는 별도 승인 배포 후 같은 조건으로 수행해야 한다. 최종요약·홍보 ON/OFF 값 보존·native keyboard/SR·전체 console/network는 이 변경으로 PASS를 선언하지 않는다.
- Peer static review: editor CSS3곳·주변 v1 계약에서 scoped actionable0. 검토자가 추가한caller2test 자체의 독립성을 주장하지 않으며 test/build/browser 실행0. 정적 검토는 실제 alpha PASS 또는 Sonnet 리뷰가 아니다.
- 관련 없는 WIP/다른 세션/실제 서버 데이터 쓰기0. #1439 전체 원 수용 조건이 남아 OPEN/Refs 유지한다. merge/automerge/deploy/유료리뷰 재요청0.

- Commit 직전 검증: v1_web lint/tsc+pattern PASS 1회, DB guardrails/production deploy security/compose parity/alpha seed runtime/Android policy/alpha immutable deploy6종과 changeset-policy PASS. 신규 debt marker0/diff whitespace0. Root 소유 deps symlink2개만 회수; local Next/브라우저/서버 프로세스 생성0.
