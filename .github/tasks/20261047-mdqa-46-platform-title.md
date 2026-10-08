# Task 20261047: QA #46 좁은 화면 플랫폼 팀매치 제목 복원

Status: In Progress
**Owner**: root → frontend-ui worker → root review/Git/PR
**Created**: 2026-10-08

## Context
[기존 리포트 #46](https://teameet.jmandu.kr/issues/46/)의 502×760 화면에서 실제 플랫폼 매치 제목이 사라진다. 담당 없음·접수·댓글 0과 활성 task/PR 부재를 대조한 뒤 root가 김성준 담당·확인 중으로 선점하고 저장 성공을 확인했다.

## Goal
기존 v1 상세 디자인·토큰을 유지하면서 좁은 화면에서도 실제 현재 매치의 제목을 읽을 수 있게 하고 같은 리포트에 검증과 dev PR 상태를 기록한다.

## Original Conditions
- [x] 기존 미선점 리포트 확인 및 담당·확인 중 저장 성공
- [ ] 실제 매치 제목을 좁은 화면과 desktop 모두 보존
- [ ] 신청·돌아가기·기존 상태별 상세 흐름 유지
- [ ] 실제 실패하는 좁은 회귀 검증과 독립 리뷰
- [ ] base dev PR 및 기존 리포트 댓글 저장 확인

## User Scenarios
E2E 관리자에서 /team-matches/7b63bb6e-8949-4aa4-8731-b901b79b17a6 방문. 1188×760에서는 제목이 보이나 502×760에서는 제목의 h1이 desktop-only wrapper 안에 있어 사라진다. 좁은 화면에서도 현재 매치 '(QA) 플랫폼 채팅 숨김 확인 1008'을 읽고 신청 sheet를 열고 닫을 수 있어야 한다. 신청 제출·실제 엔티티 변경은 하지 않는다.

## Test Scenarios
- [ ] 실제 view와 모델을 사용하는 제목 회귀 RED → GREEN
- [ ] 현재 모델 제목·긴 제목·플랫폼 및 일반 팀매치·기존 신청/상태 흐름
- [ ] 현재 desktop heading 유지·mobile 제목·overflow/CSS 규칙 검증
- [ ] alpha 502/1188 및 390/768/1440 before, 실제 배포 SHA 확인 후 after
Mock data updates needed: 실제 모델 fixture의 현재 제목을 사용. API/공유 MSW 계약 변경 없음.

## Parallel Work Breakdown
- Phase A root: 선점·최신 origin/dev·전용 WT·task·before 증거.
- Phase B frontend-ui worker: `apps/v1_web/src/components/team-matches/team-matches-page.tsx`, 새 `team-match-responsive-title.test.tsx`만 Owned. 필요한 route-local CSS는 root 승인 후에만 추가.
- Forbidden: shared hooks/types/MSW/DTO/schema, global shell/CSS/token, 다른 route/WT/task/Git mutation. 혼자가 아니므로 다른 사람 변경을 되돌리지 않는다. self-commit 금지.
- Phase C root: 직렬 최소 검증·Changeset·정확한 committed diff 독립 리뷰·feature push·dev PR·기존 tracker 댓글.

## Acceptance Criteria
- [ ] 원 제목과 desktop/mobile 정보 위계·safe Back 보존
- [ ] real regression 실패 후 통과 및 타입/패턴 확인
- [ ] Critical 0 / Warning 0 독립 리뷰
- [ ] 신규 debt marker·untracked import·무관 파일 변경 없음
- [ ] alpha 실제 after 전까지 해결 완료로 표시하지 않음

## Tech Debt Resolved
- 조사 중: desktop-only 제목이 mobile 대체 제목 없이 숨겨지는 범위.

## Security Notes
인증·권한·신청 API를 변경하거나 우회하지 않는다. 비밀 및 .env를 읽지 않는다.

## Risks & Dependencies
테스트는 serial slot root 승인 후 최소 worker로만 실행한다. dev 머지는 사용자 또는 기존 dev-pr-5가 수행한다. alpha after는 수정 SHA 배포 확인 뒤 수행한다.

## Ambiguity Log
| Date | Raised by | Question | Resolution |
|---|---|---|---|
| 2026-10-08 | root | 디자인 재선정 필요 여부 | 사용자가 기존 버그의 최소 수정을 승인했고 기존 DESIGN/프리미티브 유지 범위로 구현 |

## Progress Snapshot
- Base: origin/dev `1e4da237740bb6ada81c74fa8d16b34503633107`, fetch 후 actual dev branch=dev clean 및 FF 확인.
- Worktree: C:/Users/kinso/.codex/worktrees/mdqa-46-platform-title/matchup-sports-platform
- Branch: fix/mdqa-46-platform-title
- Tracker evidence: 원 checkout tmp/qa/mdqa-assigned-monitor/2026-10-08-heartbeat-0550/report46-before.txt 및 report46-claimed.txt/png.
- Code cause: actual h1이 `tm-desktop-page-head tm-show-desktop`에 있고 route chrome 상세 title은 빈 문자열. Backend metadata title은 브라우저 문서 제목에만 적용됨.
- Implementation: 기존 desktop heading을 보존하고 mobile 본문에 실제 현재 제목을 추가. 긴 제목은 기존 토큰과 overflow-wrap으로 줄바꿈. 전역 CSS/API/신청 계약 변경 없음.
- Regression: 실제 model/view와 production responsive CSS를 사용하는 새 spec RED 12 FAIL / 4 PASS → GREEN 16/16 PASS. 기존 상세 spec 135/135 PASS. worker1/no-file-parallelism 직렬 실행. 타입/패턴/committed 검증과 독립 리뷰는 root 대기.
- Actual alpha before: 동일 실제 매치, 인증된 E2E 관리자, 390/502/768/1188/1440×760. 실제 DOM innerWidth를 CDP 요청 폭과 대조한 결과 390/502/768 h1 rect=0, 1188/1440 visible. horizontal overflow 없음. Emulation override 해제 완료. 원 checkout 0550/report46-alpha-before-{width}.json/png. 첫 viewport capability가 기존 탭에 적용되지 않은 시도는 근거에서 제외하고 실제 폭 확인본으로 교체함.
- Phase: source GREEN / root committed verification and independent review pending. PR 없음. alpha after pending이며 코드 테스트를 실제 배포 해결로 표현하지 않음.
