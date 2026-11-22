# Task 20261139 — 어드민 개인 매치 숨김·복원
Status: In Progress (백엔드 완료, 웹 대기)
**Owner**: Planning team → backend-data-dev → frontend
**Created**: 2026-11-22

## Context
운영에 시험으로 만든 개인 매치 2건(취소됨·보류)이 사이트맵에 남아 있다. 어드민 「보관」은 상태 이름만 바꿀 뿐 공개 목록·사이트맵이 거르는 `deletedAt` 을 건드리지 않고, 어드민에는 숨김·삭제 기능이 없다. 결정 페이지: `/Users/sungjun/.cache/teameet-audit-seo-aeo-kakao-20261113/week3/admin-match-hide/index.html`.

## Goal
owner·ops 가 개인 매치를 사유와 함께 숨기고(soft delete) 다시 공개할 수 있고, 숨긴 매치가 모든 사용자 화면·후기·상태 변경에서 일관되게 빠진다. DB 구조 변경 없음.

## Original Conditions (must all be satisfied)
사용자 결정(2026-11-22):
- [x] 0. 화면 안: A — 상세 「위험 영역」 카드 + 사유 확인 모달 (웹 단계)
- [x] 1. 권한: owner·ops (support 거부)
- [x] 2. 사유 입력: 필수(500자)
- [x] 3. 복원: 같이 만듦
- [x] 4. 참가자 있는 진행 예정 경기: 막음(먼저 취소) — 409 `MATCH_HIDE_HAS_PARTICIPANTS`
- [x] 5. 숨긴 상세 직접 진입: 404 (공개 상세가 이미 404)
- [x] 6. 주최자 「내 매치」: 사라짐(확인) — `deletedAt` 필터가 이미 처리
- [x] 같이 고칠 빈틈 3개: 후기 쓰기 API 거부, 어드민 상태 변경 거부(`MATCH_HIDDEN`), 어드민 목록·상세 숨김 표시와 필터

## User Scenarios
### Scenario 1: 시험 경기 숨기기
운영자가 상세에서 「이 매치 숨기기」 → 사유 입력 → 확인. 공개 목록·사이트맵에서 사라지고 어드민 목록에 「숨김」 배지가 뜬다.
### Scenario 2: 잘못 숨김 복원
상세 배너의 「다시 공개하기」 → 사유 입력 → 숨기기 전 상태로 돌아온다. 주최자가 직접 삭제한 매치는 복원 버튼이 없다.
### Scenario 3: 참가자가 있는 예정 경기
숨기기가 409 로 막히고 「먼저 매치를 취소해 주세요」가 보인다. 취소한 뒤 숨길 수 있다.

## Test Scenarios
### Happy path
- [x] owner·ops 숨김·복원, 사유·이전 상태 감사 기록, 알림 0건
- [x] 숨기면 공개 목록·상세·내 매치·신청 자격·후기 대상·후기 쓰기·상태 변경·홈 대기 신청 건수에서 빠지고 복원하면 돌아옴
### Edge cases
- [x] 안 숨긴 매치는 숨긴 매치 옆에서 계속 보임(양쪽 fixture)
- [x] 시작 지난·취소된 매치는 참가자가 있어도 숨김 가능
- [x] visibility `public|hidden|생략` 이 목록과 상태 칩 집계에 같이 적용
### Error paths
- [x] support·일반 사용자 403, 비로그인 401, 사유 없음·공백·501자 400
- [x] 참가자·신청자 있는 예정 매치 409, 이미 숨김 409, 숨기지 않음 409, 주최자 삭제 매치 복원 409, 없는 매치 404
### Mock data updates needed
- [ ] `apps/v1_web/src/test/msw/`·`apps/v1_web/src/types/` 어드민 매치 목록·상세 응답(`hiddenAt` 등) — 웹 단계 (`API.md` 참고)

## Parallel Work Breakdown
### Backend
- [x] `POST /admin/matches/:id/hide|unhide`, `visibility` 필터, 목록·상세 숨김 필드, `changeMatchStatus` 거부, 후기 대상·쓰기 거부, 홈 대기 신청·어드민 대시보드 집계
### Frontend (Backend 계약 확정 뒤)
- [ ] 상세 위험 영역 카드·배너·사유 확인 모달(`AdminReasonConfirmDialog`), 목록 배지·`AdminVisibilityFilter`
### Sequential
- [ ] 머지 후 alpha 에서 시험 경기로 숨김·복원 확인, 운영 2건 숨김은 승격 뒤 사용자가 직접

## Acceptance Criteria
- [x] 3안 제시 → 사용자 선택(A) 완료
- [x] Original conditions(백엔드 몫) 충족
- [x] 서비스 단위·통합 시험 green, 변이 4개로 시험이 깨짐을 확인
- [x] DB 마이그레이션 없음, 새 부채 0
- [ ] 웹 단계, dev PR·CI, alpha 실측

## Tech Debt Resolved
- 후기 쓰기 API 가 `deletedAt` 을 보지 않던 빈틈, 홈 「대기 중인 신청」 건수와 어드민 대시보드 매치 집계가 숨긴 매치를 세던 빈틈.

## Security Notes
- 모든 쓰기는 `getMutationAdmin`(활성 owner·ops)을 거치고 매치 행 잠금 안에서 판정한다. 사유는 서버에서 trim·길이 검증 후 감사 기록에만 저장하며 응답·알림으로 노출하지 않는다.

## Risks & Dependencies
- 숨김은 「내 매치」·채팅에서도 사라져 주최자에게는 「경기가 없어졌다」로 보인다(이유 안내 경로 없음). 앱 심사 계정의 시연 매치를 숨기면 그 화면에서도 없어진다.
- 숨긴 동안 생긴 일(채팅을 못 읽음 등)은 복원해도 되돌릴 수 없다.
- 주최자가 직접 삭제한 매치는 복원 대상이 아니다(어드민 숨김 감사 기록으로 구분).

## Ambiguity Log
| Date | Raised by | Question | Resolution |
|------|-----------|----------|------------|
| 2026-11-22 | backend | 이미 숨김 재요청: 409 vs 멱등 | 409 `MATCH_ALREADY_HIDDEN`(복원도 같은 방식) — 감사 기록 중복을 막는다 |
| 2026-11-22 | backend | 어드민 목록의 「숨김」에 주최자 삭제 매치 포함 여부 | 포함(`deletedAt` 기준). 상세의 `hiddenBy` 로 구분, 복원은 `canUnhide` |
| 2026-11-22 | backend | 복원 사유 | 목업에 입력란이 없지만 결정 2(사유 필수)·페이지 서버 동작(`unhide {reason}`)에 따라 필수 |
