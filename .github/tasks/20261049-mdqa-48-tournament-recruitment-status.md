# Task 20261049: QA #48 대회 목록과 상세 모집 상태 일치

Status: In Progress
Owner: root → frontend worker → root review/Git/PR
Created: 2026-10-08

## Context
[리포트 #48](https://teameet.jmandu.kr/issues/48/): /tournaments 카드의 모집 중 배지와 상세의 모집 마감/비활성 신청이 다르다. 실제 363a481c-9b33-446f-b848-c78bd1d0ad7d 표본. 완료 #18의 캠페인 표본과 경로가 달라 중복 작업으로 만들지 않고 해당 공통 helper/현재 v1 계약을 검수한다. 원문·재현·댓글0·미배정 접수와 열린 PR/활성 task/WT 부재를 대조하고 root 김성준 확인 중 선점 저장을 확인했다.

## Goal
목록 배지·접근성 이름과 실제 상세의 현재 신청 가능 여부를 같은 계약으로 표시한다. 오류를 성공/빈 상태로 숨기거나 신청 권한을 우회하지 않는다.

## Original Conditions
- [x] 모든 담당자 미완료/접수 원문 읽기 및 선점 저장 확인
- [ ] API 목록/상세 deadline/status/eligibility 현재 계약 대조
- [ ] 실제 실패하는 consumer 회귀 RED → GREEN
- [ ] 최소 수정·독립 리뷰·base dev PR·같은 리포트 댓글 저장 확인

## User Scenarios
1188×760 alpha /tournaments 새로고침 후 BUFF 백석대 카드 모집 중 → 상세 모집 마감. 신청·문의·결제는 실행하지 않는다. 목록 새로고침/뒤로가기 반복에도 동일 기준을 보여야 한다.

## Test Scenarios
- [ ] 현재 시각 직전/경계/이후 마감, open/nonopen/누락 deadline, 카드 accessible name
- [ ] 실제 소비자·현재 공유 helper/응답을 사용하고 fixture의 성공 고정으로 숨기지 않음
- [ ] 현재 desktop/mobile 및 오류·재시도·필터/paging 보존
- [ ] 실제 alpha before / 배포 SHA 확인 후 after 별도
Mock data updates needed: 계약 변경 시 실제 types/MSW/API 문서 동기화 필요성을 root와 먼저 고정.

## Parallel Work Breakdown
Phase A root: 선점·fetch origin/dev·managed 전용 WT·canonical task.
Phase B worker Owned: app/tournaments/tournament-card.tsx 및 해당 card regression spec. 필요한 현재 registration helper의 변경은 root scope 승인 뒤 단일 작업자가 수행. API/hooks/types/MSW는 조사 read-only.
Forbidden: 다른 작업 WT/source, shared contracts 임의수정, 전역 CSS/design 재선정, Git/browser/selfcommit/task/정책/.env. 혼자가 아니고 타인 변경 보존.
Phase C root: 직렬 최소 검증·Changeset·explicit scope commit·정확한 HEAD 독립 리뷰·feature push/dev PR·원 리포트 댓글.

## Acceptance Criteria
- [ ] 목록/상세 모집 상태와 실제 가능 액션 일치, 상태/시간 경계 및 오류 유지
- [ ] 좁은 실제 RED/GREEN, 타입/패턴, debt/untracked import/committed diff 확인
- [ ] 독립 Critical0 Warning0, 모든 새 PR attach, 원 리포트 댓글 실제 확인
- [ ] 머지/alpha after 전 해결 완료로 표시하지 않음

## Tech Debt Resolved
조사 중. 기존 공통 helper 재사용 우선, 임의 deadline 복제 금지.

## Security Notes
신청/권한/결제 계약을 우회하거나 테스트 데이터 변경 없음. .env/비밀 읽기 및 출력 금지.

## Risks & Dependencies
serial 최소 worker slot root 승인 후만 실행. 최신 외부 리뷰 오류/지적은 실제 blocker로 유지. dev 머지는 사용자/기존 dev-pr-5 대기.

## Ambiguity Log
| Date | Raised by | Question | Resolution |
|---|---|---|---|
| 2026-10-08 | report | 정확한 마감 시각/원인은? | 제목만으로 추정하지 않고 API/공통 helper 현재 계약 대조 |

## Progress Snapshot
- WT C:/Users/kinso/.codex/worktrees/mdqa-48-tournament-recruitment-status/matchup-sports-platform, branch fix/mdqa-48-tournament-recruitment-status, base origin/dev ffec5fd355dca129a9019e0e8260bbcfc9fc4820 fetch 직후 managed 생성.
- 원 checkout 0550/report48-before.txt 및 report48-claimed.txt/png. 실제 담당 김성준·확인 중 표시 확인.
- Phase investigation/test authoring. PR없음, alpha after pending.

- 2026-10-08 Phase B 완료: 실제 카드 RED 3실패/11통과 → 전체48/48 GREEN(단일worker). API/공유helper/타입/MSW는 불변. IAB 인증 E2E관리자1280×720에서363a481c의 목록 모집중·상세 모집마감/비활성 신청을 실제 재확인했다. 마감 시각의 공개 API 관찰은 아직 보완 중이며 serving SHA미노출/미확인. Root committed 타입/패턴 및 exact-head 독립 리뷰 후 PR 게시 예정.
- 실제 alpha After 및 dev 머지는 별도 대기. 완료/삭제/자동머지 실행하지 않음. 테스트 합성 fixture와 실제 API/브라우저 증거를 구분해 원 checkout0550에 보존한다.
