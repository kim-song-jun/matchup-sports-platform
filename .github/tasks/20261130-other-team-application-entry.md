# 대회 상세 다른 팀 신청 진입
Status: Review

## Context
한 팀을 신청하면 대회 상세의 신청 CTA가 사라져 다른 팀 신청을 발견하기 어렵다.
## Goal
기존 팀 카드를 유지하고 미신청 운영 팀이 있으면 다른 팀으로 신청하기를 표시한다.
## Original Conditions
- 사용자 승인: 기존 신청 카드 아래 보조 버튼. PR 생성 요청이며 머지는 요청하지 않았다.
## User Scenarios
팀장인 A/B/C 중 A 신청 후 상세에서 버튼을 눌러 팀별 신청 목록으로 이동한다. 단일 팀은 기존 UI 유지.
## Test Scenarios
추가 팀, 단일 팀, 권한, 종목, 전체 신청, 마감, 정원, 조회 실패 조건을 검증한다.
## Parallel Work Breakdown
단일 에이전트. Owned: 상세 client/CTA test, changeset, 이 문서. Forbidden: API와 다른 세션 변경.
## Acceptance Criteria
- [x] 기존 카드 유지 및 조건부 추가 진입 구현
- [x] 좁은 테스트 및 타입 확인
- [x] dev 대상 PR 제출
- [ ] 머지 후 alpha 390/768/1440 시각 검증
## Tech Debt Resolved
추가 팀 신청 진입 누락 수정. 기존 목록/권한/접수 판정 재사용.
## Security Notes
팀장/매니저, 동일 종목 확인. 서버 권한은 기존 그대로 적용.
## Risks & Dependencies
Alpha는 dev 머지 후 변경을 렌더한다. 이번 요청은 PR 생성까지이므로 머지 전 시각 검증은 보류.
## Ambiguity Log
사용자가 제안한 방향을 승인했으므로 별도 디자인 선택 절차를 반복하지 않음.
## Progress Snapshot
origin/dev 974ac541b 기반 fix/tournament-other-team-apply. 상세 CTA 테스트 83/83 PASS (추가 9개 포함). 기존 LeagueSections act 경고가 있으나 테스트는 통과. tsc --noEmit --incremental false PASS. git diff --check PASS. 초기 의존성 누락은 작업 전용 /tmp/teameet-other-team-qa로 보완; 다른 세션 의존성 불변.
