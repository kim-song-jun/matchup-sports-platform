# Task 20261050: QA #49 신청·참여 팀매치 시각 일치

Status: In Progress
Owner: root → frontend worker → root review/Git/PR
Created: 2026-10-08

## Context
[리포트 #49](https://teameet.jmandu.kr/issues/49/): /my/matches/joined의 ㅇㅇ(5feba932-7018-4a4f-a006-bc1b63f03438) 시작 시각 04:48과 같은 상세의 20:48이 16시간 차이. 원문·재현·댓글0·미배정 접수 및 현재 task/WT/열린 PR 부재 대조 후 root 김성준 확인 중 선점 저장 확인. 완료 #27 관리자 대회 시각 표본과 다른 경로이며 기존 KST helper 현재 계약은 재사용 검수.

## Goal
동일 경기의 날짜·시작 시각이 시청자 기기 시간대와 무관하게 제품의 현재 KST 표시 계약에 일치하도록 가장 작은 수정.

## Original Conditions
- [x] 담당자 없는 전체/접수 원문·진행 부재 대조 및 선점
- [ ] 목록/상세 실제 startsAt 값과 formatter/시간대 계약 대조
- [ ] 실제 시간대가 다른 좁은 consumer 회귀 RED → GREEN
- [ ] 독립 리뷰·base dev PR·원 리포트 댓글 저장 확인

## User Scenarios
기존 E2E 관리자/1188×760에서 신청·참여 팀매치 카드 → 상세 → Back → refresh 후 같은 시작 시각. 신청·명단·경기 데이터는 수정하지 않는다. 잘못된 날짜는 현재 오류 정책을 유지.

## Test Scenarios
- [ ] 실제 API consumer/model/card/detail 또는 공유 formatter를 통해 KST/UTC/America-Los_Angeles 동일한 날짜·시각
- [ ] UTC 자정/일자 경계, explicit offset/naive 계약, invalid date, 개인·팀 목록 관련 caller
- [ ] query/필터/Back/권한/오류/retry 상태 보존
- [ ] 실제 alpha before/수정 SHA 배포 후 after 별도
Mock data updates needed: 실제 timestamp fixture를 사용하며 저장 API/DTO 변화는 의도하지 않음.

## Parallel Work Breakdown
Phase A root: 선점·fetch origin/dev·managed WT·task.
Phase B worker Owned: components/my/my-matches-client.tsx와 기존 my-matches-client.query.test.tsx 또는 인접 작은 날짜 consumer spec. lib/date-utils.ts는 기존 helper 재사용 read-only, 필요시 root 단일 owner 승인 후 변경. my-page shared 계약이나 hooks/types/MSW/API는 read-only.
Forbidden: 다른 source/WT/task/Git/browser/selfcommit/전역 CSS/새 formatter복제/.env. 혼자가 아니므로 타인 변경 보존.
Phase C root: 직렬 최소 검사·Changeset·committed exacthead 독립 리뷰·feature push/dev PR/attach·원 리포트 댓글.

## Acceptance Criteria
- [ ] 현재 KST 표시 계약에 모든 해당 caller 일치, 저장 값 불변
- [ ] actual RED/GREEN 및 타입/패턴/debt/committed scope 검수
- [ ] Critical0 Warning0 독립 리뷰/정확한 PR 상태·댓글 표시 확인
- [ ] 실제 alpha after를 코드 테스트로 대신 표현하지 않음

## Tech Debt Resolved
조사 가설: 로컬 formatDateTime의 toLocaleString에 timeZone 미지정. 현행 date-utils 단일 formatter 규칙과 상세 모델의 shared helper를 대조한다.

## Security Notes
날짜 표시만 조사/수정. 인증·권한·실데이터 변경/시간대 설정 변경/.env 읽기 없음.

## Risks & Dependencies
최소 검증 slot root 승인 후 worker1만. 외부 리뷰/머지/배포 후 실제 QA는 가능한 범위까지 수행, 자동 merge나 Done 금지.

## Ambiguity Log
| Date | Raised by | Question | Resolution |
|---|---|---|---|
| 2026-10-08 | report | 어느 시각이 정본인가? | 현재 실제 API timestamp와 date-utils KST 계약 확인, 16시간 숫자만으로 timezone 단정하지 않음 |

## Progress Snapshot
- WT C:/Users/kinso/.codex/worktrees/mdqa-49-team-match-kst/matchup-sports-platform, branch fix/mdqa-49-team-match-kst, base origin/dev ffec5fd355dca129a9019e0e8260bbcfc9fc4820 fetch 직후 managed 생성.
- 원 checkout 0550/report49-before.txt 및 report49-claimed.txt/png, 실제 김성준·확인 중 표시.
- Phase investigation/test authoring. PR없음, alpha after pending.

- 2026-10-08 Phase B 완료: 실제 HTTP consumer RED 2실패/16개날짜 assertion오류 → 같은3/3 GREEN(단일worker). 공유formatter/API/타입/MSW 불변. Root 기존인증IAB E2E관리자1280×720에서 실제5feba932의 목록·상세 API가 동일한2026-10-08T11:48:00.000Z임을 확인했고 LA 임시시간대에서 목록04:48/상세20:48 실제FAIL을 재현했다. 원래Asia/Seoul에서는20:48일치. 임시override는즉시해제했다. serving SHA미노출/미확인. Root committed타입/패턴·exact-head 독립리뷰후PR게시예정.
- 실제 alpha After 및 dev 머지는 별도 대기. 완료/삭제/자동머지 실행하지 않음. 테스트 합성 fixture와 실제 API/브라우저 증거를 구분해 원 checkout0550에 보존한다.
