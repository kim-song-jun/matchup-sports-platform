# Focused Full Flow Test Matrix

이 문서는 회원가입/로그인, 팀, 마이페이지, 대회, 채팅/알림을 사람이 순서대로 따라가며 검증하기 위한 번호형 테스트 케이스다. 기존 도메인 시나리오 문서는 상태 기록과 자동화 매핑을 유지하고, 이 문서는 PR/QA 실행 단위로 사용한다.

## Scope

- 대상 앱: `apps/v1_web`, `apps/v1_api`
- 대상 viewport: mobile `390x844`, tablet `768x1024`, desktop `1440x900`
- 공통 런타임: web `http://localhost:3013`, API `http://localhost:8121/api/v1`
- 공통 체크: route 200, console error 없음, failed request 없음, loading/empty/error/retry 상태 확인, 새로고침 persistence 확인, 모바일/데스크탑 레이아웃 겹침 없음
- 관련 기존 문서: `01-auth-and-session.md`, `04-team-and-membership.md`, `07-chat-and-notifications.md`, `10-profile-settings-admin.md`, `11-team-and-venue-hubs.md`, `12-v1-sm-new-e2e-scenarios.md`

## Personas

| Persona | Role |
|---|---|
| `GUEST` | 비로그인 사용자 |
| `USER_A` | 일반 로그인 사용자 |
| `USER_B` | 다른 일반 로그인 사용자 |
| `TEAM_OWNER` | 팀 생성자/오너 |
| `TEAM_MANAGER` | 팀 매니저 |
| `TEAM_MEMBER` | 일반 팀원 |
| `TEAM_OUTSIDER` | 팀 미가입 사용자 |
| `ADMIN` | 관리자 |

## Execution Rule

이 매트릭스는 먼저 기준선 문서 PR로 머지한 뒤, 큰 도메인 단위 실행 PR을 따로 열어 처리한다. 실행 PR은 QA 결과 기록과 필요한 수정까지 같은 PR에 포함할 수 있지만, 담당 ID 밖의 도메인 변경은 하지 않는다.

권장 실행 순서:

1. `AUTH-*`: 인증과 온보딩을 먼저 안정화한다.
2. `TEAM-*`: 팀 권한과 멤버십을 검증한다.
3. `TOURN-*`: 팀 권한에 의존하는 대회 신청과 관리자 상태 전이를 검증한다.
4. `MY-*`: 앞 단계 결과가 마이페이지/설정/리뷰에 반영되는지 검증한다.
5. `CHAT-*`, `NOTI-*`: 채팅, 알림, 딥링크, 읽음 상태를 검증한다.
6. `X-*`: 앞 단계가 끝난 뒤 핵심 교차 회귀만 확인한다.

## PR Operating Rules

- 기준선 PR은 이 문서와 `docs/scenarios/index.md`만 포함한다.
- 실행 PR은 `AUTH`, `TEAM`, `TOURN`, `MY`, `CHAT/NOTI`, `X` 중 하나의 큰 틀만 담당한다.
- 실행 PR 제목은 담당 영역을 드러내고, 본문에 `Covered IDs`, `Out of scope`, `Mobile`, `Desktop`, `Evidence`, `Follow-up`을 적는다.
- `apps/v1_web/src/hooks/use-api.ts`, 공통 타입, auth store, notification client, shell/layout, MSW handler, API common interceptor/guard처럼 여러 PR이 동시에 만질 수 있는 파일은 먼저 shared-contract PR로 분리한다.
- 다른 영역의 버그를 발견하면 현재 PR에서 고치지 말고 follow-up ID와 재현 경로를 남긴다. 단, 현재 ID가 통과하려면 반드시 필요한 shared contract 수정은 별도 PR을 먼저 처리한다.
- `X-*` PR은 상세 기능 수정 PR이 아니다. 앞선 도메인 PR이 끝난 뒤 연결 지점만 재검증하고, 새 결함은 해당 원인 도메인으로 되돌린다.

PR 본문 템플릿:

```md
## Covered IDs
- TEAM-005
- TEAM-006

## Out of scope
- TOURN-*
- CHAT-*

## Mobile
- 390x844: PASS/FAIL/BLOCKED

## Desktop
- 1440x900: PASS/FAIL/BLOCKED

## Evidence
- screenshot/report path

## Follow-up
- ...
```

## Result Status

| Status | Meaning |
|---|---|
| `PASS` | 모바일/데스크탑에서 주요 동작, 권한, 상태 반영, persistence가 통과했다. |
| `FAIL` | 기능, API 상태 전이, 권한, 레이아웃, 에러 처리 중 하나가 사용자-visible하게 깨졌다. |
| `BLOCKED` | 런타임, seed, 권한 계정, 외부 상태 때문에 실행 자체를 끝낼 수 없다. |
| `UNSUPPORTED` | 현재 v1 route/API 계약에 없는 기능이다. 성공처럼 기록하지 않는다. |

결과 기록 형식:

```text
ID:
Viewport:
Persona:
Result: PASS | FAIL | BLOCKED | UNSUPPORTED
Evidence:
Issue/PR:
Notes:
```

## AUTH

| ID | Flow | Routes | Persona | Cases to verify |
|---|---|---|---|---|
| AUTH-001 | 이메일 회원가입 happy path | `/signup`, `/signup/complete` | `GUEST` | 필수 약관 동의, 이메일/닉네임/비밀번호, 이름/휴대폰 11자리/실제 달력 생년월일/성별 입력, 선택 이미지 유무, 가입 성공, 완료 화면, 저장값 reload 확인 |
| AUTH-002 | 회원가입 필수값 검증 | `/signup` | `GUEST` | 빈 값, 공백·zero-width-only 이름, 잘못된 이메일, 짧은 비밀번호, 비밀번호 불일치, 약관 미동의, 10/12자리·문자 혼입 휴대폰, 존재하지 않는 날짜, 성별 미선택, 입력값 유지, invalid raw 값 silent 보정 금지 |
| AUTH-003 | 이메일/닉네임 중복 확인 | `/signup` | `GUEST` | `GET /auth/check-email`, `GET /auth/check-nickname`, 중복 메시지, 수정 후 재검증 |
| AUTH-004 | 소셜 회원가입 진입 | `/signup/social`, `/callback/kakao` | `GUEST` | Kakao success, denied, missing email, provider denied, account conflict route |
| AUTH-005 | 소셜 추가 정보 입력 | `/signup/social`, auth error routes | `GUEST` | `POST /auth/social-terms`의 `next.route` 준수, 이름/휴대폰/실제 달력 생년월일/성별 필수, 닉네임·휴대폰 중복, invalid raw 값 차단, 완료 후 API route 진입 |
| AUTH-005A | Required signup profile contract | `/signup`, `/signup/social`, `/my/profile` | `GUEST`, `USER_A` | 신규 가입 name/phone/birthDate/gender 필수, male/female only, optional image null/non-null 저장, 기존 nullable row는 프로필 저장 시 안내 |
| AUTH-006 | 이메일 로그인 happy path | `/login`, `/login/email`, `/home` | `GUEST` | 정상 로그인, token 저장, `/auth/me`, 홈 진입, 뒤로가기 시 auth 화면 루프 없음 |
| AUTH-007 | 로그인 실패 처리 | `/login/email` | `GUEST` | 없는 계정, 틀린 비밀번호, blocked user, 네트워크 실패, 성공처럼 이동 금지 |
| AUTH-008 | 세션 유지 | `/home`, `/my`, `/teams` | `USER_A` | 새로고침, 새 탭, 같은 브라우저 컨텍스트, `/auth/me` 재검증 |
| AUTH-009 | 보호 route auth wall | `/my`, `/chat`, `/notifications`, `/teams/new`, `/tournaments/[id]/apply` | `GUEST` | `/login` redirect 또는 canonical auth wall, 보호 mutation silent success 금지 |
| AUTH-010 | 로그아웃 | `/my/settings`, API `POST /auth/logout` | `USER_A` | 로그아웃 후 token 제거, 보호 route 차단, public route 접근 가능 |
| AUTH-011 | 온보딩 sport | `/onboarding/sport` | 신규 사용자 | 종목 선택 최소 조건, 선택 해제, 저장 실패, reload hydrate |
| AUTH-012 | 온보딩 level | `/onboarding/level` | 신규 사용자 | 종목별 level 필수, 잘못된 조합 차단, 뒤로/다음 이동 |
| AUTH-013 | 온보딩 region | `/onboarding/region` | 신규 사용자 | 지역 선택/미선택 허용 정책, 검색, 저장 후 reload |
| AUTH-014 | 온보딩 완료/유예 | `/onboarding/confirm`, `/onboarding/resume` | 신규 사용자 | 완료 후 `/home`, 유예 시 제한 홈, 부분 진행 재개 |
| AUTH-014A | 소셜 가입 필수 단계 온보딩 mutation 차단 | API `PATCH /onboarding/preferences`, `POST /onboarding/complete`, `POST /onboarding/defer` | `social_terms_required`, `social_profile_required` 사용자 | 2개 상태 × 3개 mutation 모두 409 `ONBOARDING_STEP_REQUIRED`, required route가 각각 `/terms?mode=social`·`/signup/social`, write/transaction 0회, 일반 onboarding status 회귀 없음 |
| AUTH-015 | auth 예외 route | `/auth/blocked`, `/auth/missing-email`, `/auth/account-conflict`, `/auth/location-denied`, `/auth/password-reset` | `GUEST` | 각 route 문구/CTA/복귀 동선, 데드엔드 없음 |

## TEAM

| ID | Flow | Routes | Persona | Cases to verify |
|---|---|---|---|---|
| TEAM-001 | 팀 목록 기본 렌더 | `/teams` | `GUEST`, `USER_A` | guest/auth 차이, list/empty/error/retry, 카드 CTA, trust/sample 라벨 |
| TEAM-002 | 팀 검색 | `/teams/search`, `/teams/search/empty`, `/teams/search/error` | `USER_A` | keyword latest-wins, empty copy, error retry, 결과 상세 이동 |
| TEAM-003 | 팀 필터 | `/teams/filter`, `/teams` | `USER_A` | sport/region/level/trust 필터, apply/reset, query/draft stale overwrite 없음 |
| TEAM-004 | 팀 상세 guest/auth | `/teams/[id]` | `GUEST`, `USER_A` | 공개 정보, 가입 CTA auth wall, member visibility, unsupported CTA 없음 |
| TEAM-005 | 팀 생성 happy path | `/teams/new`, API `POST /teams` | `USER_A` | required fields, 생성 후 목록/내 팀 반영, reload persistence |
| TEAM-006 | 팀 생성 validation | `/teams/new` | `USER_A` | 필수값 누락, DTO 외 UI 필드 제거, duplicate submit lock, API 실패 노출 |
| TEAM-007 | 팀 수정 happy path | `/teams/[id]/edit`, API `PATCH /teams/:id` | `TEAM_OWNER` | 기존 값 hydrate, 수정 저장, 상세/목록/내 팀 반영 |
| TEAM-008 | 팀 수정 권한 | `/teams/[id]/edit` | `TEAM_MANAGER`, `TEAM_MEMBER`, `TEAM_OUTSIDER` | 허용 범위와 차단 범위, 서버 403, UI dead-end 없음 |
| TEAM-009 | 가입 자격 조회 | `/teams/[id]`, API `GET /teams/:id/join-eligibility` | `TEAM_OUTSIDER` | open/approval-required/closed/already-member/requested 상태별 CTA |
| TEAM-010 | 팀 가입 신청 | `/teams/[id]`, API `POST /teams/:id/join-applications` | `TEAM_OUTSIDER` | 신청 생성, pending CTA, duplicate 신청 처리, reload 유지 |
| TEAM-011 | 가입 신청 철회 | `/teams/[id]`, API `POST /team-join-applications/:id/withdraw` | `TEAM_OUTSIDER` | requested만 철회, 이미 처리된 신청 conflict, CTA 복원 |
| TEAM-012 | 가입 신청 목록 | `/teams/[id]/members`, API `GET /teams/:id/join-applications` | `TEAM_OWNER`, `TEAM_MANAGER` | owner/manager 접근, outsider/member 차단, cursor/filter |
| TEAM-013 | 가입 승인 | `/teams/[id]/members` | `TEAM_OWNER`, `TEAM_MANAGER` | 승인 후 membership active, member count, 신청자 `/my/teams` 반영 |
| TEAM-014 | 가입 거절 | `/teams/[id]/members` | `TEAM_OWNER`, `TEAM_MANAGER` | 거절 상태, 신청자 CTA/상태, 재신청 가능 여부 |
| TEAM-015 | 멤버 목록 | `/teams/[id]/members`, `/my/teams/[id]/members` | `TEAM_OWNER`, `TEAM_MANAGER`, `TEAM_MEMBER` | role badge, 공개/비공개, pagination, 모바일 테이블/카드 |
| TEAM-016 | 역할 변경 | API `PATCH /team-memberships/:id/role` | `TEAM_OWNER` | manager/member 변경, owner row 보호, manager limit, reload 유지 |
| TEAM-017 | 멤버 제거 | API `POST /team-memberships/:id/remove` | `TEAM_OWNER` | 일반 멤버 제거, 자기 자신/owner 제거 차단, userId/membershipId 혼동 없음 |
| TEAM-018 | self leave | `/teams/[id]/members`, `/my/teams` | `TEAM_MEMBER` | 탈퇴 확인, `/my/teams`에서 제거, owner 탈퇴 CTA 없음 |
| TEAM-019 | 내 팀 role view | `/my/teams`, `/my/teams/[id]` | `TEAM_OWNER`, `TEAM_MANAGER`, `TEAM_MEMBER` | role별 CTA, 관리/상세 이동, unsupported edit/delete 숨김 |
| TEAM-020 | 팀 기반 연결 | `/team-matches/new/team`, `/tournaments/[id]/apply`, `/chat` | 팀 역할 사용자 | 팀 선택 가능 범위가 owner/manager/member 권한과 일치 |

## MY

| ID | Flow | Routes | Persona | Cases to verify |
|---|---|---|---|---|
| MY-001 | 마이 홈 | `/my` | `USER_A` | profile summary, activity summary, trust labels, 각 카드 route 이동 |
| MY-002 | 프로필 편집 | `/my/profile/edit`, API `PATCH /me/profile` | `USER_A` | 닉네임/소개/프로필 필드 저장, validation, reload/새 탭 유지 |
| MY-003 | public profile | API `GET /users/:userId/public-profile` | `GUEST`, `USER_B` | 공개/비공개 필드, verified/estimated/sample/none 라벨 |
| MY-004 | 내 생성 매치 | `/my/matches/created` | `USER_A` | 목록, 상세/관리 이동, 빈 상태, 생성 직후 반영 |
| MY-005 | 내 참가 매치 | `/my/matches/joined` | `USER_A` | 신청/승인/취소 상태 구분, 상세 이동, stale 상태 없음 |
| MY-006 | 내 팀 목록 | `/my/teams` | 팀 역할 사용자 | owner/manager/member grouping, 역할별 CTA, 팀 탈퇴 후 반영 |
| MY-007 | 내 팀 상세 | `/my/teams/[id]` | 팀 역할 사용자 | 팀 정보, 멤버 관리 진입, 권한 없는 액션 차단 |
| MY-008 | 내 리뷰 작성 | `/my/reviews/[sourceType]/[sourceId]` | `USER_A` | 완료된 source만 작성, duplicate alreadySubmitted, 저장 후 목록 반영 |
| MY-009 | 내가 쓴/받은 리뷰 | `/my/reviews`, `/my/reviews/received` | `USER_A` | pagination, empty, source deep link, reputation 반영 |
| MY-010 | 설정 홈 | `/my/settings` | `USER_A` | 계정/알림/종목/지역/약관/탈퇴 동선, 데드엔드 없음 |
| MY-011 | 종목 설정 | `/my/settings/sports`, API `PATCH /me/preferences` | `USER_A` | 종목/level 저장, 홈/추천 반영, reload 유지 |
| MY-012 | 지역 설정 | `/my/settings/location`, API `PATCH /me/regions` | `USER_A` | 지역 저장, 검색/추천 반영, 빈 값 정책 |
| MY-013 | 알림 설정 | `/my/settings/notifications`, API `PATCH /notification-preferences` | `USER_A` | match/team/chat/payment toggle 저장, device-local 항목 구분 |
| MY-014 | 법적/탈퇴 | `/my/settings/legal`, `/my/settings/withdrawal` | `USER_A` | 약관 표시, 탈퇴 요청 사유, 즉시 성공처럼 처리 금지 |

## TOURNAMENT

| ID | Flow | Routes | Persona | Cases to verify |
|---|---|---|---|---|
| TOURN-001 | 대회 목록 | `/tournaments`, API `GET /tournaments` | `USER_A` | list/empty/error/retry, status label, featured/marketing section, mobile sticky CTA |
| TOURN-002 | 대회 목록 검색/필터 | `/tournaments` | `USER_A` | sport/status/region/date 필터, apply/reset, stale query overwrite 없음 |
| TOURN-003 | 대회 상세 | `/tournaments/[id]`, API `GET /tournaments/:id` | `USER_A` | 상단 정보, 일정/장소/참가비/상금/상태, CTA 상태 |
| TOURN-004 | 대회 상세 상태별 CTA | `/tournaments/[id]` | `USER_A` | recruiting/full/ongoing/closed/cancelled 상태별 신청/마감/관리 CTA |
| TOURN-005 | 참가 신청 권한 | `/tournaments/[id]/apply` | `GUEST`, `TEAM_MEMBER`, `TEAM_MANAGER`, `TEAM_OWNER` | guest auth wall, owner/manager 팀만 선택, 일반 팀원 disabled |
| TOURN-006 | 참가 팀 선택 | `/tournaments/[id]/apply` | `TEAM_OWNER` | eligible teams, sport mismatch, already registered, host/invalid team 차단 |
| TOURN-007 | 참가 선수 명단 | `/tournaments/[id]/apply` | `TEAM_OWNER` | 6~10명 제한, 선출/비선출 필드, 중복 선수 차단, 필수값 |
| TOURN-008 | 참가 신청 제출 | API `POST /tournaments/:id/registrations`, `POST /submit` | `TEAM_OWNER` | 입금자명/동의, awaiting_payment, 완료 화면, duplicate submit lock |
| TOURN-009 | 내 신청 상태 | `/tournaments/[id]/my`, API `GET /my-registration` | `TEAM_OWNER` | awaiting_payment/payment_checking/confirmed/waitlisted/cancel_requested/cancelled |
| TOURN-010 | 신청 상세 | `/tournaments/[id]/registrations/[registrationId]/roster` | `TEAM_OWNER` | roster hydrate, locked 상태, 권한 없는 사용자 차단 |
| TOURN-011 | 신청 취소 요청 | API `POST /cancel-request` | `TEAM_OWNER` | 취소 사유, cancel_requested, 이미 확정/취소 상태 conflict |
| TOURN-012 | 명단 수정 | `/tournaments/[id]/registrations/[registrationId]/roster` | `TEAM_OWNER` | 마감 전 직접 수정, 마감 후 승인 요청 또는 제한 copy, 당일 제한 |
| TOURN-013 | 대회 공지 | API tournament announcements | `USER_A`, `ADMIN` | 공지 목록/상세/관리, 참가자 표시, 비참가자 노출 정책 |
| TOURN-014 | 대진표 조회 | tournament bracket API/surface | `USER_A` | bracket 로딩, 경기 상태, 빈 bracket, 충돌/보류 상태 |
| TOURN-015 | 결과/순위 조회 | tournament players/bracket API | `USER_A` | 결과 반영, 순위표, 보류/이의 상태를 성공처럼 표시하지 않음 |
| TOURN-016 | 관리자 대회 목록 | `/admin/tournaments` | `ADMIN` | list/filter/status, 일반 사용자 차단 |
| TOURN-017 | 관리자 대회 생성 | `/admin/tournaments/new`, API admin create | `ADMIN` | 필수값, 날짜/정원/참가비 validation, 생성 후 상세 |
| TOURN-018 | 관리자 대회 상세/수정 | `/admin/tournaments/[id]` | `ADMIN` | 상태 변경, 수정 persistence, 참가 신청 목록 진입 |
| TOURN-019 | 관리자 신청 목록 | API `GET /admin/tournaments/:id/registrations` | `ADMIN` | status filter, cursor, payment/player count, 비관리자 차단 |
| TOURN-020 | 입금 확인 | API `PATCH /admin/registrations/:id/confirm-payment` | `ADMIN` | awaiting_payment+ready만 허용, payment paid, registration payment_checking |
| TOURN-021 | 참가 확정/대기 | API `PATCH /admin/registrations/:id/confirm` | `ADMIN` | confirm/waitlist, idempotent alreadyProcessed, user `/my` 반영 |
| TOURN-022 | 관리자 취소 처리 | API `PATCH /admin/registrations/:id/cancel` | `ADMIN` | cancel_requested 포함 허용 상태, 결제 있으면 manual refund copy |
| TOURN-023 | 명단 잠금/해제 | API `POST`/`DELETE /admin/registrations/:id/roster-lock` | `ADMIN` | confirmed만 잠금, 잠금 후 사용자 수정 제한, 해제 후 정책 복원 |
| TOURN-023A | 관리자 명단 조회 | `/admin/tournaments/[id]`, API `GET /admin/registrations/:id/players` | `ADMIN`, `SUPPORT`, `USER_A` | 팀 비소속 관리자 조회 성공, support 읽기 성공, 일반 사용자 403, 성별 snapshot/미등록 표시, 실패와 빈 명단 구분 |
| TOURN-024 | 대회 알림 연동 | `/notifications`, tournament events | `TEAM_OWNER`, `ADMIN` | 신청/입금확인/확정/취소 알림, 딥링크, read state |
| TOURN-025 | 대회 반응형 | `/tournaments`, `/tournaments/[id]`, apply/my/admin routes | All | 모바일 sticky CTA, 데스크탑 2-column, tablet overflow 없음 |
| TOURN-026 | 캠페인 공개/보관 | `/tournaments/campaigns/[slug]`, API `GET /tournaments/campaigns/:slug` | `GUEST` | published+public tournament만 200, draft/archived/deleted/non-public은 동일 404, bank/PII 미노출 |
| TOURN-027 | 관리자 캠페인 편집 | `/admin/tournaments/[id]`, campaign admin APIs | `OWNER`, `OPS`, `SUPPORT` | support read-only, typed content 저장, empty/no-op 거절, status reason 필수, publish 뒤 slug 영구 잠금 |
| TOURN-028 | 캠페인 영속성/경쟁 | campaign admin APIs + PostgreSQL | `OWNER`, `OPS` | archive row/slug 보존, publishedAt 보존, archivedAt set/clear, audit rollback, concurrent status/slug CAS |

## CHAT_AND_NOTI

| ID | Flow | Routes | Persona | Cases to verify |
|---|---|---|---|---|
| CHAT-001 | 채팅 목록 | `/chat`, API `GET /chat/rooms` | `USER_A` | linked rooms only, empty/error/retry, latest preview, unread count |
| CHAT-002 | 채팅방 resolve | API `POST /chat/rooms/resolve` | eligible/ineligible users | match/team-match linked room 생성/재사용, unauthorized 차단 |
| CHAT-003 | 채팅방 상세 | `/chat/[id]`, API `GET /chat/rooms/:id` | participant | participant info, pinned/metadata, left/blocked/expired state |
| CHAT-004 | 메시지 목록 | API `GET /chat/rooms/:id/messages` | participant | cursor pagination, newest/oldest ordering, reload 유지 |
| CHAT-005 | 메시지 송신 | API `POST /chat/rooms/:id/messages` | participant | text send, optimistic/pending/error state, duplicate idempotency |
| CHAT-006 | 두 사용자 실시간 송수신 | `/chat/[id]` two contexts | `USER_A`, `USER_B` | A send -> B receive, B reply -> A receive, focus/background recovery |
| CHAT-007 | 실패한 메시지 재시도 | `/chat/[id]` | participant | 네트워크 실패 표시, 재시도, 실패 메시지를 성공처럼 렌더 금지 |
| CHAT-008 | 채팅방 내 설정 | API `PATCH /chat/rooms/:id/me` | participant | pin/mute/read marker persistence |
| CHAT-009 | 채팅방 나가기 | API `POST /chat/rooms/:id/leave` | participant | 확인 모달, 목록 제거/left 표시, 재진입 정책 |
| CHAT-010 | unread/read 다중 탭 | `/chat`, `/chat/[id]`, `/home` | same user tabs | unread 증가, 읽음 후 다른 탭 배지 제거, stale badge 없음 |
| NOTI-001 | 알림 목록 | `/notifications`, API `GET /notifications` | `USER_A` | unread/read filter, empty/error, grouping, cursor |
| NOTI-002 | 알림 읽음 | API `PATCH /notifications/:id/read` | `USER_A` | row readAt, unread count 감소, duplicate read 안정 |
| NOTI-003 | 모두 읽음 | `/notifications/read`, API `POST /notifications/read-all` | `USER_A` | category/all scope, reload persistence |
| NOTI-004 | 알림 딥링크 | `/notifications` | `USER_A` | match/team/tournament/chat target route, 읽음 mutation과 navigation 경합 없음 |
| NOTI-005 | 알림 producer | domain actions | event receiver | team join, chat message, tournament status, payment/review event 생성 |
| NOTI-006 | 알림 설정 반영 | `/my/settings/notifications` | `USER_A` | muted category는 새 알림 생성/표시 정책과 일치 |

## Cross-Domain Regression

| ID | Flow | Cases to verify |
|---|---|---|
| X-001 | Auth -> Onboarding -> My | 신규 가입자가 온보딩 완료 후 `/my`, 프로필, 추천/활동 상태에 일관되게 반영된다. |
| X-002 | Auth -> Team | 로그인 사용자가 팀 생성 후 `/teams`, `/teams/[id]`, `/my/teams`에서 같은 팀/역할 상태를 본다. |
| X-003 | Team -> Tournament | 팀 owner/manager 권한이 대회 참가 신청 팀 후보와 disabled 상태에 정확히 반영된다. |
| X-004 | Tournament -> My | 대회 신청/취소/확정 상태가 `/tournaments/[id]/my`와 마이페이지 활동 표면에 반영된다. |
| X-005 | Tournament -> Notification | 대회 신청/입금 확인/확정/취소 이벤트가 알림과 딥링크로 연결된다. |
| X-006 | Team/Match/Tournament -> Chat | 권한 있는 사용자는 관련 채팅방에 접근하고, 권한 상실 후 접근 정책이 유지된다. |

## PR Plan

| Order | PR title | Primary IDs | Scope | Forbidden overlap |
|---|---|---|---|---|
| 1 | `docs(v1): focused full-flow QA 운영 매트릭스 추가` | Matrix only | 이 문서와 `docs/scenarios/index.md` | 기능/API/UI 수정 |
| 2 | `qa(v1): AUTH flow execution` | `AUTH-001~015` | 회원가입, 로그인, 세션, 로그아웃, 온보딩, auth 예외 route | 팀/대회/채팅 mutation UI |
| 3 | `qa(v1): TEAM flow execution` | `TEAM-001~020` | 팀 목록, 검색, 필터, 상세, 생성, 수정, 가입 신청, 멤버 권한 | 대회 관리자 상태 전이, 채팅방 internals |
| 4 | `qa(v1): TOURN flow execution` | `TOURN-001~025` | 대회 목록, 상세, 참가 신청, 명단, 내 신청, 관리자 입금/확정/취소/잠금 | auth store, chat client |
| 5 | `qa(v1): MY flow execution` | `MY-001~014` | 마이 홈, 프로필, 내 매치/팀, 리뷰, 설정, 알림 설정, 탈퇴 요청 | 팀 membership service, tournament registration service |
| 6 | `qa(v1): CHAT/NOTI flow execution` | `CHAT-001~010`, `NOTI-001~006` | 채팅 목록/방/메시지/나가기, 알림 목록/읽음/딥링크/설정 | 팀/대회 핵심 mutation 구현 |
| 7 | `qa(v1): cross-flow regression execution` | `X-001~006` | 큰 도메인 간 연결 지점만 재검증 | 신규 기능 구현, 대규모 리팩토링 |
