# SM New API Surface Map

## 1. Status

```text
Status: API planning draft
Created: 2026-05-17
Design baseline: Team Design > 1차 디자인 완료
Action inventory: docs/reference/sm-new-screen-action-inventory.md
DB decision source: docs/reference/sm-new-db-v1-table-decision-checklist.md
Not for: implemented endpoint contract, DTO finalization, Swagger source
```

이 문서는 기존 `apps/api` route를 복사하지 않고, SM New 1차 디자인 완료의 사용자 action 기준으로
필요한 API surface를 정리한다. 실제 endpoint path는 구현 전 state machine, permission matrix,
DB design v2가 완료된 뒤 확정한다.

## 2. Global Contract Draft

### 2.1 Prefix and envelope

```text
Base prefix: /api/v1/sm-new

Success:
{ status: "success", data, timestamp }

Error:
{ status: "error", statusCode, code, message, details?, timestamp }
```

기존 API 문서의 envelope 규칙은 참고하되, 이 문서는 SM New 전용 planning draft다.

### 2.2 Common query shape

```text
cursor?: string
limit?: number
query?: string
sort?: string
sportId?: uuid
regionId?: uuid
status?: string
view?: card | compact
```

목록 API는 cursor pagination을 기본으로 둔다. 검색/필터/보기 전환 실패 시 기존 query/filter/view
context를 유지해야 한다.

### 2.3 Common mutation requirements

아래 mutation은 idempotency key 또는 상태 충돌 처리가 필요하다.

- 참가/가입/팀매치 신청
- 승인/거절/승인 취소/취소 처리
- 생성/수정/취소
- 채팅방 나가기
- 알림 읽음 처리
- 관리자 상태 변경/운영 처리

권장 header:

```text
Idempotency-Key: client-generated-key
```

공통 conflict code 후보:

```text
STATE_CONFLICT
DUPLICATE_REQUEST
PERMISSION_DENIED
VALIDATION_FAILED
NOT_FOUND_OR_ARCHIVED
ALREADY_PROCESSED
```

## 3. Auth and Onboarding

| User action | Candidate API | Actor | Tables | State/audit |
|---|---|---|---|---|
| 현재 세션 확인 | `GET /auth/me` | user | users, user_profiles, user_onboarding_progress | none |
| 소셜 로그인 시작/콜백 | `POST /auth/oauth/:provider/callback` | guest | users, auth_identities | users.last_login_at |
| 이메일 로그인 | `POST /auth/email/login` | guest | users, auth_identities | users.last_login_at |
| 필수 약관 조회 | `GET /terms/current` | guest/user | terms_documents | none |
| 회원가입 전 약관 동의 | `POST /terms/consents` | user | user_terms_consents, notification_preferences | status_change if onboarding summary changes |
| 회원가입 생성 | `POST /auth/signup` | guest | users, auth_identities, user_profiles | users created |
| 온보딩 상태 조회 | `GET /onboarding` | user | user_onboarding_progress, preferences | none |
| 종목/실력/지역 저장 | `PATCH /onboarding/preferences` | user | user_sport_preferences, user_regions, user_onboarding_progress | onboarding_status update |
| 온보딩 완료 | `POST /onboarding/complete` | user | users, user_onboarding_progress | onboarding_status -> completed |
| 나중에 설정 | `POST /onboarding/defer` | user | users, user_onboarding_progress | onboarding_status -> deferred |

Notes:

- 지역은 0개 허용이다.
- 현재 위치 권한 값은 활동 지역으로 자동 저장하지 않는다.
- 차단 계정은 login success로 넘기지 않고 hard stop response를 반환한다.

## 4. Home, Search, Notice

| User action | Candidate API | Actor | Tables | State/audit |
|---|---|---|---|---|
| 홈 진입 aggregate | `GET /home` | guest/user | matches, team_matches, teams, notices, user_reputation_summaries | none |
| 홈 추천 매치 | `GET /home/recommendations` | guest/user | matches, preferences | derived, no stored recommendation |
| 통합 검색 submit | `GET /search` | guest/user | matches, team_matches, teams | latest query wins |
| 공지 목록 | `GET /notices` | guest/user | notices | none |
| 공지 상세 | `GET /notices/:noticeId` | guest/user | notices | none |

Notes:

- 공지는 사용자별 read/write API가 없다.
- 홈의 통계/추천은 v1에서 저장 테이블보다 실시간 계산/derived response로 시작한다.
- `my team` shortcut은 destination 확정 전까지 API surface를 만들지 않는다.

## 5. Personal Matches

### 5.1 Browse and detail

| User action | Candidate API | Actor | Tables | State/audit |
|---|---|---|---|---|
| 목록 조회 | `GET /matches` | guest/user | matches, sports, regions | none |
| 검색/필터/정렬 | `GET /matches?query&sportId&sort&view` | guest/user | matches | none |
| 상세 조회 | `GET /matches/:matchId` | guest/user | matches, match_participants, match_applications | none |
| 참가 가능 여부 | `GET /matches/:matchId/application-eligibility` | user | matches, match_applications, match_participants | none |

### 5.2 Create and edit

| User action | Candidate API | Actor | Tables | State/audit |
|---|---|---|---|---|
| 생성 | `POST /matches` | user | matches, match_participants | status_change_logs for created |
| 수정 prefill 조회 | `GET /matches/:matchId/edit` | match host | matches | none |
| 수정 저장 | `PATCH /matches/:matchId` | match host | matches | status_change if status changes |
| 취소 | `POST /matches/:matchId/cancel` | match host/admin | matches, match_applications, match_participants | status_change_logs |

### 5.3 Apply and manage

| User action | Candidate API | Actor | Tables | State/audit |
|---|---|---|---|---|
| 참가 신청 | `POST /matches/:matchId/applications` | user | match_applications | requested |
| 내 신청 취소 | `POST /match-applications/:applicationId/withdraw` | applicant | match_applications | requested -> withdrawn |
| 신청 목록 | `GET /matches/:matchId/applications` | match host | match_applications, user_profiles, user_reputation_summaries | none |
| 신청 승인 | `POST /match-applications/:applicationId/approve` | match host | match_applications, match_participants | approved + participant created |
| 신청 거절 | `POST /match-applications/:applicationId/reject` | match host | match_applications | rejected |
| 승인 취소 | `POST /match-participants/:participantId/cancel-approval` | match host | match_participants, match_applications | status_change_logs |
| 참여자 취소 처리 | `POST /match-participants/:participantId/mark-cancelled` | match host | match_participants | status_change_logs |
| 내 매치 목록 | `GET /me/matches` | user | matches, applications, participants | none |

Notes:

- v1은 결제 API를 호출하지 않는다.
- 디자인의 `결제하고 참가하기`는 v1 API에서 `참가 신청` mutation으로 치환한다.
- 승인 시 정원 초과, 이미 처리됨, 중복 신청은 `STATE_CONFLICT`로 처리한다.

## 6. Teams

### 6.1 Browse and profile

| User action | Candidate API | Actor | Tables | State/audit |
|---|---|---|---|---|
| 팀 목록 | `GET /teams` | guest/user | teams, team_profiles, team_trust_scores | none |
| 팀 검색/필터 | `GET /teams?query&sportId&regionId&status` | guest/user | teams | none |
| 팀 상세 | `GET /teams/:teamId` | guest/user | teams, team_profiles, team_memberships, team_trust_scores | none |
| 가입 가능 여부 | `GET /teams/:teamId/join-eligibility` | user | teams, team_memberships, team_join_applications | none |

### 6.2 Create and manage

| User action | Candidate API | Actor | Tables | State/audit |
|---|---|---|---|---|
| 팀 생성 | `POST /teams` | user | teams, team_profiles, team_memberships | owner membership created |
| 팀 수정 | `PATCH /teams/:teamId` | owner/manager | teams, team_profiles | status_change if status changes |
| 내 팀 목록 | `GET /me/teams` | user | teams, team_memberships | none |
| 팀 멤버 목록 | `GET /teams/:teamId/members` | owner/manager/member | team_memberships | none |
| 역할 변경 | `PATCH /team-memberships/:membershipId/role` | owner/manager by policy | team_memberships | status_change_logs |
| 멤버 제거 | `POST /team-memberships/:membershipId/remove` | owner/manager by policy | team_memberships | status_change_logs |

### 6.3 Join applications

| User action | Candidate API | Actor | Tables | State/audit |
|---|---|---|---|---|
| 가입 신청 | `POST /teams/:teamId/join-applications` | user | team_join_applications | requested |
| 가입 신청 취소 | `POST /team-join-applications/:applicationId/withdraw` | applicant | team_join_applications | requested -> withdrawn |
| 가입 신청 목록 | `GET /teams/:teamId/join-applications` | owner/manager | team_join_applications, user_profiles | none |
| 가입 승인 | `POST /team-join-applications/:applicationId/approve` | owner/manager | team_join_applications, team_memberships | approved + membership |
| 가입 거절 | `POST /team-join-applications/:applicationId/reject` | owner/manager | team_join_applications | rejected |

Notes:

- open 즉시 가입 API는 없다.
- owner는 1명으로 유지한다.
- manager는 최대 5명이다. 이 제한은 role 변경 API에서 검증한다.

## 7. Team Matches

### 7.1 Browse and detail

| User action | Candidate API | Actor | Tables | State/audit |
|---|---|---|---|---|
| 목록 조회 | `GET /team-matches` | guest/user | team_matches, teams, sports | none |
| 검색/필터/정렬 | `GET /team-matches?query&sportId&sort&view` | guest/user | team_matches | none |
| 상세 조회 | `GET /team-matches/:teamMatchId` | guest/user | team_matches, teams, team_match_applications | none |
| 신청 가능 여부 | `GET /team-matches/:teamMatchId/application-eligibility` | team owner/manager | team_matches, team_match_applications, team_memberships | none |

### 7.2 Create and edit

| User action | Candidate API | Actor | Tables | State/audit |
|---|---|---|---|---|
| 생성 | `POST /team-matches` | host team owner/manager | team_matches | created |
| 수정 prefill 조회 | `GET /team-matches/:teamMatchId/edit` | host team owner/manager | team_matches | none |
| 수정 저장 | `PATCH /team-matches/:teamMatchId` | host team owner/manager | team_matches | status_change if status changes |
| 취소 | `POST /team-matches/:teamMatchId/cancel` | host team owner/manager/admin | team_matches, team_match_applications | status_change_logs |

### 7.3 Apply and manage

| User action | Candidate API | Actor | Tables | State/audit |
|---|---|---|---|---|
| 상대팀 신청 | `POST /team-matches/:teamMatchId/applications` | applicant team owner/manager | team_match_applications | requested |
| 신청 취소 | `POST /team-match-applications/:applicationId/withdraw` | applicant team owner/manager | team_match_applications | requested -> withdrawn |
| 신청팀 목록 | `GET /team-matches/:teamMatchId/applications` | host team owner/manager | team_match_applications, teams | none |
| 신청 승인 | `POST /team-match-applications/:applicationId/approve` | host team owner/manager | team_match_applications, team_matches | approved, team_match -> matched |
| 신청 거절 | `POST /team-match-applications/:applicationId/reject` | host team owner/manager | team_match_applications | rejected |
| 내 팀매치 목록 | `GET /me/team-matches` | user | team_matches, team_memberships | none |

Notes:

- 한 팀매치에 approved 상대 팀은 최대 1개다.
- v1은 결제/시설 FK 없이 direct place field와 비용 안내 텍스트를 사용한다.

## 8. Chat and Notifications

### 8.1 Chat

| User action | Candidate API | Actor | Tables | State/audit |
|---|---|---|---|---|
| 채팅 목록 | `GET /chat/rooms` | chat participant | chat_rooms, participants, messages | none |
| 연결 채팅방 조회/생성 | `POST /chat/rooms/resolve` | eligible user | chat_rooms, chat_room_participants | room created if absent |
| 채팅방 상세 | `GET /chat/rooms/:roomId` | participant | chat_rooms, chat_room_participants | none |
| 메시지 목록 | `GET /chat/rooms/:roomId/messages` | participant | chat_messages | none |
| 텍스트 전송 | `POST /chat/rooms/:roomId/messages` | participant | chat_messages | message created |
| 고정/해제 | `PATCH /chat/rooms/:roomId/me` | participant | chat_room_participants | pinned flag/status |
| 나가기 | `POST /chat/rooms/:roomId/leave` | participant | chat_room_participants | left |

Notes:

- v1 chat target은 `match_id` 또는 `team_match_id`다.
- 이미지/파일 메시지, DM, 팀 상시 채팅은 제외한다.
- 팀매치 채팅 참여자는 양 팀 owner/manager 중심이다.

### 8.2 Notifications

| User action | Candidate API | Actor | Tables | State/audit |
|---|---|---|---|---|
| 알림 목록 | `GET /notifications` | user | notifications | none |
| 알림 읽음 | `PATCH /notifications/:notificationId/read` | recipient | notifications | read_at set |
| 모두 읽음 | `POST /notifications/read-all` | user | notifications | read_at set for recipient |
| 알림 설정 조회 | `GET /notification-preferences` | user | notification_preferences | none |
| 알림 설정 저장 | `PATCH /notification-preferences` | user | notification_preferences | none |

Notes:

- 알림은 user별 row가 source다.
- notice read와 notification read는 다르다. notice read API는 없다.

## 9. Profile, Reputation, Settings

| User action | Candidate API | Actor | Tables | State/audit |
|---|---|---|---|---|
| 내 프로필 조회 | `GET /me/profile` | user | users, user_profiles, user_reputation_summaries | none |
| 프로필 수정 | `PATCH /me/profile` | user | user_profiles | status_change if visibility changes |
| 공개 유저 정보 | `GET /users/:userId/public-profile` | guest/user | user_profiles, user_reputation_summaries | none |
| 설정 조회 | `GET /me/settings` | user | users, user_profiles, notification_preferences | none |
| 설정 저장 | `PATCH /me/settings` | user | user_profiles, notification_preferences | none |
| 로그아웃 | `POST /auth/logout` | user | session/token store candidate | none |
| 탈퇴 요청 | `POST /me/withdrawal-request` | user | users | account_status -> withdrawal_pending |

Notes:

- 평판 요약은 `verified`, `estimated`, `sample`, `none` 상태를 명확히 내려야 한다.
- sample 신뢰 신호는 실제 평판처럼 렌더링하면 안 된다.

## 10. Admin and Audit

| User action | Candidate API | Actor | Tables | State/audit |
|---|---|---|---|---|
| 관리자 me | `GET /admin/me` | admin | admin_users, users | none |
| 운영 요약 | `GET /admin/overview` | admin | domain tables, logs | none |
| 사용자 상태 변경 | `POST /admin/users/:userId/status` | admin owner/ops | users | admin_action_logs + status_change_logs |
| 매치 상태 변경 | `POST /admin/matches/:matchId/status` | admin owner/ops | matches | admin_action_logs + status_change_logs |
| 팀 상태 변경 | `POST /admin/teams/:teamId/status` | admin owner/ops | teams | admin_action_logs + status_change_logs |
| 팀매치 상태 변경 | `POST /admin/team-matches/:teamMatchId/status` | admin owner/ops | team_matches | admin_action_logs + status_change_logs |
| 감사 로그 조회 | `GET /admin/action-logs` | admin | admin_action_logs | none |
| 상태 변경 로그 조회 | `GET /admin/status-change-logs` | admin | status_change_logs | none |

Notes:

- 관리자 mutation은 reason, before/after, actor, target을 반드시 기록한다.
- bulk API를 만들 경우 per-item success/failure를 response에 포함한다.
- admin operation task queue는 v1 deferred다.

## 11. Deferred Surfaces

| Surface | v1 decision | Future trigger |
|---|---|---|
| Payments | 제외 | 사용자 유입 후 실제 결제 도입 결정 |
| Payment attempts | 제외 | payment provider 연동 시 |
| Refund requests | 제외 | payment/refund UX 재개 시 |
| Disputes | 제외 | 신고/분쟁/moderation 모델 확정 시 |
| DM | 제외 | 매치 연결 외 커뮤니케이션 필요 시 |
| Team always-on chat | 제외 | 팀 허브/운영 모델 확정 시 |
| File chat messages | 제외 | storage/moderation/retry 정책 확정 시 |
| Venue FK for matches | 제외 | venue ownership/booking model 확정 시 |

## 12. Design To API Renames

| Design wording | v1 API interpretation |
|---|---|
| 결제하고 참가하기 | 개인 매치 참가 신청 생성 |
| 결제하고 신청하기 | 팀매치 상대팀 신청 생성 |
| 알림받기 | notification preference or interest candidate, not required in core v1 |
| 공지 확인 | notice detail read, no read persistence |
| 팀 채팅으로 가기 | v1에서는 match/team_match linked chat만 허용. 일반 팀 채팅은 deferred |
| 팀 보기 | team detail read |
| 가입 가능 여부 확인 | team join eligibility read |

## 13. Open Items For Later Approval

아래 항목은 지금 API surface 작성을 막지 않으므로 질문하지 않고 보류한다.

| Item | Current draft |
|---|---|
| `my team` shortcut | destination 확정 전 disabled |
| Manager destructive power | permission matrix에서 owner-only vs manager allowed 분리 |
| Email/password settings | auth implementation readiness 확인 후 include/defer |
| 알림 모두읽음 | design에는 존재하므로 draft 포함. 원하면 이후 제외 가능 |
| Desktop-only API | 별도 API 없이 domain API 재사용 |

