# Task 20261058: MD-QA #58 홈 추천 팀매치 시각 일치

Status: In Progress
**Owner**: root → scoped frontend owner
**Created**: 2026-10-08

## Context
원 리포트 https://teameet.jmandu.kr/issues/58/ 는 홈 오늘의 추천 팀매치87328d95-dae5-4548-918f-7954a24b7fcd가 10월9일07:02, 같은 상세가23:02–23:59를 표시한다. 새로고침·재진입으로 반복했다. 기존 #49/PR1671은 마이 목록 경로만 수정하고 실제 원 범위 PASS로 이미 dev 머지됐으므로 홈 소비자의 별도 결함을 조사한다. 현재 열린 PR/진행 task에 같은 홈 시간 수정은 없다. Root UI 선점 김성준·확인 중 저장을21:47KST 확인했다.

## Goal
홈 추천의 같은 API 경기 시작 시각이 상세의 현행 KST 표시 계약과 일치하도록 가장 작은 수정, 실제 RED/GREEN, 독립 리뷰, base-dev PR과 기존 리포트 댓글까지 완료한다. alpha AFTER는 정확한 배포 후 별도다.

## Original Conditions (must all be satisfied)
- [ ] 같은 경기 ID·API startsAt의 홈 날짜/시각과 상세가 일치한다.
- [ ] 브라우저 timezone에 의존하거나 날짜 경계에서 다른 날짜를 표시하지 않는다.
- [ ] 기존 추천 선택·필터·이미지·상세 링크·신청 가능·리그/개인매치 소비자 계약을 보존한다.
- [ ] 실제 경기/신청/채팅 데이터를 변경하지 않고 원 리포트 상태·첨부를 보존한다.

## User Scenarios
1. 홈 추천 팀매치에서 실제 같은 상세로 이동·복귀해 일관된 경기 날짜/시간을 읽는다.
2. UTC·미국·한국 timezone과 KST 날짜 경계에서도 동일한 경기 시각을 읽는다.

## Test Scenarios
- [ ] 실제 홈 추천 model/card 소비자, 현재 v1 상세 포맷 계약을 교차 확인한다.
- [ ] source-unchanged 실제 소비자 RED → 최소 GREEN; KST 날짜 경계/시각/링크와 기존 추천 회귀를 확인한다.
- [ ] 최소worker1·직렬; root preflight/committed Web types/pattern, full suite/build/localNext 없음.
- [ ] API 계약 불변이면 fixture/MSW/schema/API 문서 수정은 불필요. 필요한 정확한 test fixture는 같은 scope에서 맞춘다.

## Parallel Work Breakdown
- Phase A root: 원문/중복/claim, fresh fetch 직후 managed origin/dev worktree, task/dependency 준비.
- Phase B frontend owner Owned: apps/v1_web/src/components/home/home-client-model.ts 와 해당 scoped 실제 model/card test만. 기존 date-utils 포맷 재사용 우선. 새 scoped test 허용; 다른 파일 필요하면 root에 근거를 먼저 전달한다.
- Forbidden: shared hooks/types/MSW/date-utils/global tokens/shell, API/DTO/schema, 다른 route/task/자동화/state/.env, browser/Git mutation/self-commit/dependency install. 혼자가 아니므로 타인 변경을 되돌리지 않는다.
- Phase C root: 검수·Changeset·최신dev안전통합·committed 검증·독립리뷰·Git/PR·원 댓글 저장·alpha after 구분. root가 exact pathspec 승인 없이 subagent commit 금지.

## Acceptance Criteria
- [ ] 실제 v1 계약 근거·RED/GREEN·committed narrow/types/pattern PASS.
- [ ] latest exact-head 전체경로 독립 Critical0 Warning0/FindingsNone.
- [ ] 한국어 base dev PR 게시/attach·기존 리포트 댓글 저장/실제 표시 확인.
- [ ] 실제 alpha AFTER 미검증을 코드 tests/review/CI/merge PASS로 대신하지 않는다.

## Tech Debt Resolved
홈 시간 변환과 상세 KST 표시의 drift를 scoped 소비자에서 해소한다. 전역 timezone 재설계는 범위 밖이다.

## Security Notes
읽기/표시만 변경한다. 인증·권한·신청/경기 payload·DB를 변경하지 않는다. .env/토큰/비밀 읽기·출력 금지.

## Risks & Dependencies
원 실제 환경 CSS500×757/Cray Linux/E2E관리자/배포37776097712(8050cec4)이며 정확한 API/DB 원인은 원문에서 미확인이다. 기존 #49 머지 branch에 새 fix를 push하지 않는다. dev-pr-5의 실제 #52/team focus QA와 중복하지 않는다.

## Ambiguity Log
| Date | Raised by | Question | Resolution |
|------|-----------|----------|------------|
| 2026-10-08 | report58 | 정본 시각/브라우저 시간대 원인 | 현재 v1 상세/date-utils/API startsAt 계약을 교차 확인하고 실제 다른 TZ 소비자 실패로 입증한다. 시간대 설정·데이터는 변경하지 않는다. |

## Progress Snapshot
- Fresh origin/dev d0f57f01ce95ed12d9d7508594f03b15be0efa72 직후 managed worktree C:/Users/kinso/.codex/worktrees/mdqa-58-home-match-time/matchup-sports-platform, branch fix/mdqa-58-home-match-time.
- Root own0550/report58-initial-detail.txt 및 report58-claimed-confirmed.txt/png; 다른 진행 없음 확인·선점 저장 성공. 이전 초기 조사 기록이며 아래 최신 커서로 이어간다.
- 2026-10-08 22:06 KST: 홈 private formatDate/formatTime은 기기 timezone, 같은 상세 toTeamMatch는 공유 KST formatCardDate/Time을 사용함을 확인했다. API list/detail startsAt는 모두 같은 startAt(Date) 계약이다. 공유 formatter alias import와 private 두 함수 삭제만 적용했다. 홈 개인 매치 두 API 모양·리그 마감·공지·팝업 날짜 소비자도 동일한 KST 계약으로 통일되며 invalid 날짜 원문/빈 시각 정책은 보존한다.
- source-unchanged 실제 native Intl timezone/hours 증명과 model·상세·actual HTTP 홈 카드10건: America/Los_Angeles 7 FAIL/3 PASS, UTC 7 FAIL/3 PASS, Asia/Seoul10 PASS. 수정 후 같은 실제 matrix LA10/10, UTC 신규10+기존home-page20+home-wave8 8=38/38, Seoul10/10. raw logs는 own worktree tmp/qa/mdqa-58/red-{la,utc,seoul}.txt 및 green-{la,utc,seoul}.txt, base Vitest 전체 상속·test.env.TZ만 변경한 ignored config를 보존한다. formatter/HTTP hook/view를 mock하지 않는다. 원 실제 경기 ISO 값·원 브라우저 timezone을 합성 fixture로 확정하지 않는다.
- Root가 실제 alpha 원 첨부2/2 pixels(natural500×757)과 배포37776097712/head8050cec4/public identity SUCCESS를 검수했다. 실제 홈07:02/상세23:02–23:59 BEFORE 증거이며 API raw·원 browserTZ·수정 AFTER는 미검증이다.
- Root fresh fetch 및 feature 초기 FF로 실제 dev bfecbd122af2bde295ab054fc3d77136d0d19ddc(1673 merge)을 안전하게 통합했다. 들어오는6명단 경로와 본 source/spec의 overlap0, 타인 WIP 변경 없음. root explicit4 paths commit 후 committed narrow/types/pattern·독립 full4 review·dev PR/attach/원 댓글을 진행한다. 현재 PR/alpha/Done은 아직 없다.
