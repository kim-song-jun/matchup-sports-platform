# Task 20261026: 빈 팀·유저 아바타 전체 점검 및 기본 아이콘 통일

Status: Implemented — review / alpha pending
Owner: Codex (single agent)
Created: 2026-10-05

## Context
사용자가 대회·팀 관련 모든 빈 팀/유저 이미지 표현을 점검하고 GitHub식 무늬를 제거하도록 요청했다. ID/UUID 표시 문제는 범위가 아니다.

## Goal
로고/사진 없음·빈 문자열·로드 실패에 팀/사람 기본 아이콘을 사용하고 실제 업로드 이미지는 유지한다.

## Original Conditions
- [x] 사용자 확인: 빈 이미지 표시이며 GitHub식 무늬를 없애고 기본 아이콘으로 변경.
- [x] 대회·팀 관련 소비부 전체 inventory 및 M/N 점검.
- [x] 미정 팀·멤버·신청/초대·명단·후기·시상·리그·팀매치·관련 프로필/마이 표시 동기화.
- [x] 기존 이미지·동작·링크·저장 계약 유지.

## User Scenarios
이미지가 없는 팀·유저 또는 이미지 로드 실패는 중립 기본 팀/사람 아이콘으로 보인다. 새 URL은 이전 오류에 갇히지 않고 정상 사진을 보여준다. 대진 미정/부전승 라벨과 권한은 바뀌지 않는다.

## Test Scenarios
- TeamAvatar 전 사이즈 null/빈 문자열/공백, seed 독립 아이콘, 로드 성공→실패→새 URL→제거.
- UserAvatar 및 기존 ProfileAvatar 호출부의 이미지 수명주기, 팀 대신 사람 아이콘.
- 실제 명단/멤버/시상/대진 소비 컴포넌트 회귀.
- 팀 create logo 미선택 null 저장 및 직접 선택한 preset/custom 이미지 유지.
- alpha 390/768/1440 화면과 console/network 확인. 로그인 표면은 자격증명 없으면 정확히 미검증으로 기록.

## Parallel Work Breakdown
단일 에이전트 순차: audit → shared icons → 직접 avatar 소비부 → 좁은 tests/lint → review/alpha QA/docs.
Owned: v1_web avatar 공유 컴포넌트, 아래 inventory의 직접 빈 이미지 표면, 관련 tests, task, patch changeset.
Forbidden: API/Prisma/DB 데이터 변경, 후원사/대회 타이틀 브랜드 변경, 이름/ID fallback 변경, 사용자 업로드 삭제, main 승격.

## Acceptance Criteria
- [x] GitHub identicon 생성 코드 0.
- [x] 전체 inventory 처리 M/N, 이미지 없는 실 엔티티는 팀/사람 아이콘.
- [x] 이미지 교체·실패 회복·비어짐에 stale 그림 없음.
- [x] 기존 크기·레이아웃·클릭/키보드·사진/로고 저장 유지, 관련 테스트 및 lint PASS.
- [ ] alpha 검증 결과와 미검증 범위 명시.

## Tech Debt Resolved
팀원에 TeamAvatar를 쓰던 의미 혼선, URL 변경 때 loaded boolean이 남던 수명주기, 이니셜/빈 원 표시를 함께 정리한다.

## Security Notes
기존 auth/권한/민감정보 공개 gate 유지. 기본 이미지에 seed·이니셜을 노출하지 않는다. DB/실데이터/사용자 사진 쓰기 없음.

## Risks & Dependencies
공용 TeamAvatar는 홈/마이/공개 소개의 팀 카드에도 전파된다. 공용 프로필은 다른 유저 표면에도 영향을 주므로 기존 크기/사진 로드 계약을 검증한다. alpha admin 세션 미확보. 신규 팀은 로고 미선택 null로 시작하되 직접 선택한 preset과 기존 저장 이미지는 유지한다.

## Ambiguity Log
사용자는 기본 아이콘 변경을 명시 선택했다. 기존 슬롯 안의 기계적 아이콘 교체이며 새 레이아웃·모달 설계로 확대하지 않는다(CLAUDE.md UI착수 규칙의 기계적 수정 예외).

## Progress Snapshot
origin/dev 9d7869721에서 격리 branch fix/team-user-empty-avatar-consistency 생성. 소비부 33/33 정적 점검 완료. identicon 생성 코드 제거, 팀/사람 슬롯 통일, 팀 생성 logo 미선택 null 유지. 공용 TeamAvatar RED 10건 → GREEN 10건. 관련 7 suite 중 사진 load 비동기 assertion 1건 보정 후 재검증 중.

## Audit Inventory

기본 이미지 consumer source 33개. 텍스트/타입/후원사/대회 타이틀은 아바타와 구분한다.

| Source | Verdict |
|---|---|
| `apps/v1_web/src/app/admin/tournaments/[id]/reviews-tab.tsx` | PASS: 공용 아이콘 전파/직접 슬롯 확인 |
| `apps/v1_web/src/app/league-matches/[leagueId]/awards/league-awards-page-client.tsx` | PASS: 공용 아이콘 전파/직접 슬롯 확인 |
| `apps/v1_web/src/app/league-matches/[leagueId]/fixtures/[fixtureId]/league-fixture-detail-client.tsx` | PASS: 공용 아이콘 전파/직접 슬롯 확인 |
| `apps/v1_web/src/app/league-matches/[leagueId]/league-match-standings-client.tsx` | PASS: 공용 아이콘 전파/직접 슬롯 확인 |
| `apps/v1_web/src/app/tournaments/[id]/apply/tournament-apply-client.tsx` | PASS: 공용 아이콘 전파/직접 슬롯 확인 |
| `apps/v1_web/src/app/tournaments/[id]/awards/awards-page-client.tsx` | PASS: 공용 아이콘 전파/직접 슬롯 확인 |
| `apps/v1_web/src/app/tournaments/[id]/registrations/[registrationId]/roster/tournament-roster-client.tsx` | PASS: 공용 아이콘 전파/직접 슬롯 확인 |
| `apps/v1_web/src/app/tournaments/[id]/tournament-detail-client.tsx` | PASS: 공용 아이콘 전파/직접 슬롯 확인 |
| `apps/v1_web/src/components/landing/v4/landing-v4-bento.tsx` | PASS: 공용 아이콘 전파/직접 슬롯 확인 |
| `apps/v1_web/src/components/landing/v4/landing-v4-now-fx.tsx` | PASS: 공용 아이콘 전파/직접 슬롯 확인 |
| `apps/v1_web/src/components/landing/v4/landing-v4-stage-scenes.tsx` | PASS: 공용 아이콘 전파/직접 슬롯 확인 |
| `apps/v1_web/src/components/my/my-dissolved-teams-section.tsx` | PASS: 공용 아이콘 전파/직접 슬롯 확인 |
| `apps/v1_web/src/components/my/my-api-clients.tsx` | PASS: 프로필 편집 사진 없음/실패 아이콘 |
| `apps/v1_web/src/components/my/my-page.tsx` | PASS: 공용 아이콘 전파/직접 슬롯 확인 |
| `apps/v1_web/src/components/reviews/reviews-page.tsx` | PASS: 팀/대회/팀매치 공용 후기의 팀/유저 기본 아이콘·작성자 이미지 구분 |
| `apps/v1_web/src/components/public-game-records/team-records-content.tsx` | PASS: 공용 아이콘 전파/직접 슬롯 확인 |
| `apps/v1_web/src/components/team-matches/team-match-detail-sheets.tsx` | PASS: 공용 아이콘 전파/직접 슬롯 확인 |
| `apps/v1_web/src/components/team-matches/team-match-now-card.tsx` | PASS: 공용 아이콘 전파/직접 슬롯 확인 |
| `apps/v1_web/src/components/team-matches/team-match-shared-record.tsx` | PASS: 공용 아이콘 전파/직접 슬롯 확인 |
| `apps/v1_web/src/components/team-matches/team-matches-page.tsx` | PASS: 공용 아이콘 전파/직접 슬롯 확인 |
| `apps/v1_web/src/components/team-schedules/team-schedules-page.tsx` | PASS: 공용 아이콘 전파/직접 슬롯 확인 |
| `apps/v1_web/src/components/teams/dissolved-team-view.tsx` | PASS: 공용 아이콘 전파/직접 슬롯 확인 |
| `apps/v1_web/src/components/teams/team-invite-landing-client.tsx` | PASS: 공용 아이콘 전파/직접 슬롯 확인 |
| `apps/v1_web/src/components/teams/team-members-section.tsx` | PASS: 공용 아이콘 전파/직접 슬롯 확인 |
| `apps/v1_web/src/components/teams/teams-form-client.tsx` | PASS: 공용 아이콘 전파/직접 슬롯 확인 |
| `apps/v1_web/src/components/teams/teams-page.tsx` | PASS: 공용 아이콘 전파/직접 슬롯 확인 |
| `apps/v1_web/src/components/tournaments/competition-entry-card.tsx` | PASS: 공용 아이콘 전파/직접 슬롯 확인 |
| `apps/v1_web/src/components/tournaments/tournament-bracket.tsx` | PASS: 공용 아이콘 전파/직접 슬롯 확인 |
| `apps/v1_web/src/components/tournaments/tournament-event-hub-sections.tsx` | PASS: 공용 아이콘 전파/직접 슬롯 확인 |
| `apps/v1_web/src/components/tournaments/tournament-standings-table.tsx` | PASS: 공용 아이콘 전파/직접 슬롯 확인 |
| `apps/v1_web/src/components/users/player-card.tsx` | PASS: 공용 아이콘 전파/직접 슬롯 확인 |
| `apps/v1_web/src/components/users/public-profile-client.tsx` | PASS: 공용 아이콘 전파/직접 슬롯 확인 |
| `apps/v1_web/src/components/v1-ui/team-avatar.tsx` | PASS: 공용 아이콘 전파/직접 슬롯 확인 |

## Validation evidence
- TeamAvatar RED 10 failures on previous implementation; GREEN 10. ProfileAvatar initial RED import was blocked by missing workspace dependency; not counted as RED.
- Core/form 43 PASS; broader consumer suites 103 PASS after correcting Next Image asynchronous load assertion; unique tests 197 PASS across 9 suites; TeamsPage 63 includes explicit preset selection and upload paths.
- `tsc --noEmit` PASS. Pattern checker required elevated execution after sandbox shell EPERM; obsolete font-size baseline reduced 1→0; final pattern checker PASS.
- Touched-path tech-debt markers: none. No API/DB/schema/permissions changes.
- Alpha before QA: Chromium initial missing libs resolved using existing /tmp libraries; networkidle timeout on polling page; headed session closed in finally. DOMContentLoaded headed capture PASS: 3 public routes × 3 widths = 9/9 before screenshots, commit 9d7869721, no horizontal overflow; baseline teams has 190 SVG pattern rects at every width. Browser closed in finally. Authenticated admin/roster remains unverified.

- Final extended audit: 공용 후기 화면을 추가해 33/33. Ops 대회 타이틀/후원사/채팅방 카테고리 썸네일/전술판 이름 라벨은 엔티티 아바타가 아니며 범위 외. Admin 팀/유저 테이블에는 기존 avatar 슬롯 없음.
- User approved this PR only: Copilot quota 402 대신 직접 review + 검증 후 alpha 배포. PR CI appeared after delay; merge awaits CI.

- 공용 후기 회귀 RED 1 → GREEN 1; 후기 팀 우선/빈 상태 8 tests PASS. 총 unique 205 tests across 11 suites PASS. 추가 후 tsc PASS / pattern PASS.

- CI Web 6418/6419 PASS; remaining failure was the old TeamMembersSection initials contract, intentionally superseded by user-requested person icon. Updated to verify neutral person glyph plus unchanged full display names; 3 member tests PASS.
