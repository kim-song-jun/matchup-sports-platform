# Task 20261123: 사용자 모바일 안전 영역 전면 검수

Status: In Progress
**Owner**: Codex main
**Created**: 2026-11-03

## Context
Android WebView 로그인, 작성 취소 모달, 대회 필터의 하단 가림 제보. iOS 앱과 모바일 웹의 동작도 함께 확인한다. 기준 Alpha `fbf6fb9b139e0be49955103be867a900a55b5879` (2026-11-03 조회).

## Goal
사용자용 모바일 경로와 관련 상태를 빠짐없이 기록하고 Android WebView, iOS WKWebView, 모바일 웹의 안전 영역·스크롤·키보드 가림을 검수해 확인된 결함을 수정하고 Alpha에 반영한다.

## Original Conditions
- [ ] 제보한 로그인·팀 생성 확인창·대회 필터를 재현하고 수정 전후 확인한다.
- [ ] 모든 사용자용 모바일 화면의 경로 및 상태를 정하고 누락 없이 검수한다.
- [ ] Android 앱, iOS 앱, 일반 모바일 웹 결과를 분리한다.
- [ ] 확인된 범위의 결함을 검증 후 dev PR·Alpha에 반영한다.

## User Scenarios
사용자가 각 모바일 경로에서 화면 끝까지 읽고 필드·버튼을 시스템 영역에 가려짐 없이 조작하며, 긴 시트와 키보드 열린 폼도 사용할 수 있다.

## Test Scenarios
- [ ] Android 3버튼·제스처, iOS 앱, Android Chrome·iOS Safari에서 각각 일반·스크롤 끝·시트·모달·입력 키보드 확인.
- [ ] 화면 높이가 작은 경우 및 확대된 글자에서 고정 CTA·마지막 항목 확인.
- [ ] 인증·역할·데이터 필요 경로는 정상 진입한 실제 상태를 확인하고 불가능한 항목은 미검증으로 기록.
- [ ] 회귀 테스트는 실제 가시·터치·스크롤 계약을 검증하며 부하 작업은 최소 worker로 직렬 실행.

## Parallel Work Breakdown
- Main only: 범위 산정·실제 Alpha 관찰·공통 화면 수정·검증·PR·Alpha. 사용자의 명시적 병렬 지시 없음.
- Owned: 이 task, 검수에 의해 원인이 확인된 `apps/v1_web` 및 필요 시 `apps/v1_android`, `apps/v1_ios`의 관련 파일과 테스트.
- Forbidden: 레거시 앱, 무관한 변경, 실제 사용자 데이터 변경, 다른 세션 작업.

## Acceptance Criteria
- [ ] 사용자용 144개 경로의 실제 경로/상태·플랫폼별 결과와 근거가 확정되고 미검증이 없다.
- [ ] 제보 및 발견된 가림/스크롤 결함이 각 플랫폼에서 해결되고 전후 증거와 console/network 확인이 있다.
- [ ] 최소 회귀 검증, 리뷰, PR 및 exact-head CI, Alpha serving SHA/health 확인.

## Tech Debt Resolved
- 진행 중.

## Security Notes
기존 계정과 운영 데이터를 수정하지 않는다. 인증정보와 `.env`를 읽거나 기록하지 않는다.

## Risks & Dependencies
- 연결된 Android 기기 없음, 실행 중인 iOS 시뮬레이터 없음(첫 조사). 앱 실기기 증거는 브라우저 크기 재현으로 대체하지 않는다.
- 브라우저 화면과 앱 빌드·서빙 SHA가 다를 수 있다.
- 동적 route는 실제 객체와 적절한 역할이 필요하다.

## Ambiguity Log
| Date | Question | Resolution |
| --- | --- | --- |
| 2026-11-03 | `/admin-content-preview`, `/tournament-ops-demo`의 사용자용 여부 | 소스에서 전자는 관리자 권한 전용 미리보기라 제외, 후자는 공개 체험 페이지라 포함. |

## Progress Snapshot
- 2026-11-03: 원격 dev/Alpha `fbf6fb9b139e0be49955103be867a900a55b5879`; Alpha API health DB true.
- 211개 page 파일 중 admin 66과 관리자 권한 전용 `/admin-content-preview` 1을 제외한 사용자 대상 144개. 대회 운영진이 쓰는 `tournament-ops` 6개와 공개 체험 `/tournament-ops-demo`도 포함한다. 상태별·플랫폼별 검수는 미완료.
- 일반 Chromium 모바일 크기 390x844, 로그인된 Alpha 팀 만들기에서 임시 텍스트 입력 후 뒤로가기 확인창을 열고 native bottom 48px을 CSS로 모사: 버튼 하단 y=804, 안전 경계 y=796으로 8px 겹침. 실제 Android/iOS 기기 재현 아님. 저장은 하지 않음.
- 대회 필터를 390x844 Chromium 터치 입력으로 재현: 시트 높이 619px, 콘텐츠 696px, 위 스와이프 후 scrollTop 0. 브라우저에서 `touch-action: pan-y`를 임시 적용하고 동일 스와이프 시 scrollTop 77. 공통 시트의 본문 drag 가드를 수정하고 관련 단위 테스트 RED 1/15 → GREEN 15/15. 실제 기기의 터치 검증은 아님.
- 확인창에 48px inset과 하단 padding을 임시 적용한 브라우저 실험: 버튼 하단 y=756, 안전 경계 y=796. 제품 코드 수정 후 Alpha 재검증은 아직 하지 않음.
- 390x844 Chromium 주요 경로 화면을 캡처했으나 일부가 인증 확인이나 데이터 skeleton 상태였으므로 전체 경로 검수 PASS로 세지 않는다.
- 로그인 없는 Chromium 자동 회귀 기준 Alpha: 390x640에서 native inset 48 모사 시 로그인 사업자 링크 하단 616 > 안전 경계 592 (RED). 대회 필터 touch swipe 후 scrollTop 0 (RED; 등장 transform 종료 대기 후도 재현). 수정본이 아직 Alpha에 없으므로 GREEN 미확인.
- `/my` 계열 19개 경로에서 390x844 Chromium 초기/스크롤 끝 캡처를 시도했다. `/my/reviews/received`는 `/my/reviews`로 이동, `/my/team-contacts`는 이동 중 화면을 캡처했다. 각 상태·상호작용·플랫폼을 완료한 증거는 아니며 144개 전면 검수 수치에 포함하지 않는다. 임시 결과 `/tmp/teameet-mobile-audit-20261103/my-captures.json`.
- 로컬 변경 단위 검증: BottomSheet 15/15, ConfirmModal 12/12, AuthFrame 10/10, globals 90/90. 범위별 사용자 화면 실제 검증 및 변경 후 Alpha는 아직 미실행.
- `pnpm --filter v1_web lint`: TypeScript 및 v1 pattern 검사 통과. E2E 세 시나리오 수집 성공. 수정 전 Alpha의 로그인·필터 두 시나리오는 의도한 레이아웃/스크롤 주장으로 실패했고 수정 후 Alpha GREEN은 미확인.
- 사용자는 실기기 연결 불가, 시뮬레이션으로 진행하고 실기기는 나중에 확인하기로 했다. Android 에뮬레이터와 iOS Simulator runtime 미설치 상태를 확인했고, iOS 27.1 simulator runtime 다운로드 진행 중. Android/iOS 실기기/OS/키보드는 미실행.

## Route inventory (0/144 fully audited; 67 admin-only exclusions)
각 항목은 route 템플릿이며 객체·권한·상태·플랫폼별 검수는 따로 기록해야 한다. 체크는 전 플랫폼과 필요한 상태 검증이 끝난 경우에만 한다.

- [ ] `/account-deletion` — 미검수
- `/admin-content-preview` — 범위 제외: 관리자 권한 전용 미리보기
- [ ] `/auth/account-conflict` — 미검수
- [ ] `/auth/blocked` — 미검수
- [ ] `/auth/find-account` — 미검수
- [ ] `/auth/location-denied` — 미검수
- [ ] `/auth/password-reset` — 미검수
- [ ] `/auth/provider-denied` — 미검수
- [ ] `/auth/withdrawal-cancel` — 미검수
- [ ] `/callback/kakao` — 미검수
- [ ] `/chat/[id]` — 미검수
- [ ] `/chat` — 미검수
- [ ] `/contact` — 미검수
- [ ] `/events` — 미검수
- [ ] `/faq` — 미검수
- [ ] `/for/organizers` — 미검수
- [ ] `/for/players` — 미검수
- [ ] `/for/teams` — 미검수
- [ ] `/help/glossary` — 미검수
- [ ] `/help/guides/[slug]` — 미검수
- [ ] `/help` — 미검수
- [ ] `/home` — 미검수
- [ ] `/invite/[token]` — 미검수
- [ ] `/landing` — 미검수
- [ ] `/league-matches/[leagueId]/awards` — 미검수
- [ ] `/league-matches/[leagueId]/fixtures/[fixtureId]` — 미검수
- [ ] `/league-matches/[leagueId]` — 미검수
- [ ] `/league-matches` — 미검수
- [ ] `/login/email` — 미검수
- [ ] `/login/email/verify` — 미검수
- [ ] `/login` — 미검수
- [ ] `/matches/[id]/applications` — 미검수
- [ ] `/matches/[id]/edit` — 미검수
- [ ] `/matches/[id]` — 미검수
- [ ] `/matches/new/confirm` — 미검수
- [ ] `/matches/new` — 미검수
- [ ] `/matches/new/place-time` — 미검수
- [ ] `/matches/new/sport` — 미검수
- [ ] `/matches` — 미검수
- [ ] `/my/inquiries/[id]` — 미검수
- [ ] `/my/inquiries/new` — 미검수
- [ ] `/my/inquiries` — 미검수
- [ ] `/my/invitations` — 미검수
- [ ] `/my/join-applications` — 미검수
- [ ] `/my/leagues` — 미검수
- [ ] `/my/matches/created` — 미검수
- [ ] `/my/matches/joined` — 미검수
- [ ] `/my` — 미검수
- [ ] `/my/phone-verify` — 미검수
- [ ] `/my/profile/edit` — 미검수
- [ ] `/my/reviews/[sourceType]/[sourceId]` — 미검수
- [ ] `/my/reviews` — 미검수
- [ ] `/my/reviews/received` — 미검수
- [ ] `/my/schedule` — 미검수
- [ ] `/my/settings/legal` — 미검수
- [ ] `/my/settings/location` — 미검수
- [ ] `/my/settings/login-methods/email` — 미검수
- [ ] `/my/settings/login-methods` — 미검수
- [ ] `/my/settings/notifications` — 미검수
- [ ] `/my/settings` — 미검수
- [ ] `/my/settings/player-card` — 미검수
- [ ] `/my/settings/record-consent` — 미검수
- [ ] `/my/settings/sports` — 미검수
- [ ] `/my/settings/theme` — 미검수
- [ ] `/my/settings/tournament-real-name` — 미검수
- [ ] `/my/settings/withdrawal` — 미검수
- [ ] `/my/team-contacts/[contactId]` — 미검수
- [ ] `/my/team-contacts` — 미검수
- [ ] `/my/teams/[id]/members` — 미검수
- [ ] `/my/teams/[id]` — 미검수
- [ ] `/my/teams` — 미검수
- [ ] `/my/tournament-staff/[tournamentId]` — 미검수
- [ ] `/my/tournament-staff` — 미검수
- [ ] `/notices/[id]` — 미검수
- [ ] `/notices` — 미검수
- [ ] `/notifications` — 미검수
- [ ] `/onboarding/confirm` — 미검수
- [ ] `/onboarding/level` — 미검수
- [ ] `/onboarding/region` — 미검수
- [ ] `/onboarding/resume` — 미검수
- [ ] `/onboarding/sport` — 미검수
- [ ] `/` — 미검수
- [ ] `/search/new` — 미검수
- [ ] `/search` — 미검수
- [ ] `/signup/complete` — 미검수
- [ ] `/signup` — 미검수
- [ ] `/signup/social` — 미검수
- [ ] `/team-matches/[id]/edit` — 미검수
- [ ] `/team-matches/[id]/edit/rules` — 미검수
- [ ] `/team-matches/[id]/lineup/opponent` — 미검수
- [ ] `/team-matches/[id]/lineup` — 미검수
- [ ] `/team-matches/[id]/operate` — 미검수
- [ ] `/team-matches/[id]` — 미검수
- [ ] `/team-matches/[id]/record` — 미검수
- [ ] `/team-matches/[id]/result/approval` — 미검수
- [ ] `/team-matches/[id]/result` — 미검수
- [ ] `/team-matches/new/condition` — 미검수
- [ ] `/team-matches/new/confirm` — 미검수
- [ ] `/team-matches/new/info` — 미검수
- [ ] `/team-matches/new` — 미검수
- [ ] `/team-matches/new/place-time` — 미검수
- [ ] `/team-matches/new/rules` — 미검수
- [ ] `/team-matches/new/sport` — 미검수
- [ ] `/team-matches/new/team` — 미검수
- [ ] `/team-matches` — 미검수
- [ ] `/teams/[id]/contact/new` — 미검수
- [ ] `/teams/[id]/contact/settings` — 미검수
- [ ] `/teams/[id]/dissolve` — 미검수
- [ ] `/teams/[id]/edit` — 미검수
- [ ] `/teams/[id]/game-rosters` — 미검수
- [ ] `/teams/[id]/games/[gameId]/roster` — 미검수
- [ ] `/teams/[id]/invite` — 미검수
- [ ] `/teams/[id]/members` — 미검수
- [ ] `/teams/[id]` — 미검수
- [ ] `/teams/[id]/records` — 미검수
- [ ] `/teams/[id]/schedules/[scheduleId]/edit` — 미검수
- [ ] `/teams/[id]/schedules/[scheduleId]` — 미검수
- [ ] `/teams/[id]/schedules/new` — 미검수
- [ ] `/teams/[id]/schedules` — 미검수
- [ ] `/teams/[id]/tactics/[gameId]` — 미검수
- [ ] `/teams/new` — 미검수
- [ ] `/teams` — 미검수
- [ ] `/terms` — 미검수
- [ ] `/tournament-ops-demo` — 미검수
- [ ] `/tournament-ops/tournaments/[id]/fixtures/[fixtureId]/operate` — 미검수
- [ ] `/tournament-ops/tournaments/[id]/operations` — 미검수
- [ ] `/tournament-ops/tournaments/[id]/records/corrections` — 미검수
- [ ] `/tournament-ops/tournaments/[id]/result-review` — 미검수
- [ ] `/tournament-ops/tournaments/[id]/staff` — 미검수
- [ ] `/tournament-ops/tournaments/[id]/videos` — 미검수
- [ ] `/tournaments/[id]/apply` — 미검수
- [ ] `/tournaments/[id]/awards` — 미검수
- [ ] `/tournaments/[id]/bracket` — 미검수
- [ ] `/tournaments/[id]/matches/[fixtureId]` — 미검수
- [ ] `/tournaments/[id]/my` — 미검수
- [ ] `/tournaments/[id]` — 미검수
- [ ] `/tournaments/[id]/registrations/[registrationId]/roster` — 미검수
- [ ] `/tournaments/[id]/results` — 미검수
- [ ] `/tournaments/[id]/reviews` — 미검수
- [ ] `/tournaments/[id]/schedule` — 미검수
- [ ] `/tournaments/campaigns/[slug]` — 미검수
- [ ] `/tournaments` — 미검수
- [ ] `/users/[id]/card` — 미검수
- [ ] `/users/[id]` — 미검수
- [ ] `/users/[id]/records` — 미검수
