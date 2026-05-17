# SM New Screen Action Inventory

## 1. Status

```text
Status: planning inventory
Created: 2026-05-17
Design baseline: Team Design > 1차 디자인 완료
Source file: docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html
Component source: docs/reference/handoff-sm-new-direction/sports-platform/project/lib/screens-sm-revision.jsx
DB source: docs/reference/sm-new-db-v1-table-decision-checklist.md
Not for: final endpoint contract, Prisma migration, DTO finalization
```

이 문서는 SM New API 설계 전에 17개 `1차 디자인 완료` 섹션의 화면, 버튼, 입력, 상태,
테이블 영향, API 영향을 빠짐없이 고정하기 위한 action inventory다.

## 2. Applied Decisions

- 개인 매치 v1 결제는 제외한다. 참가 흐름은 `신청 -> 호스트 승인 대기`로 해석한다.
- 팀매치 v1 결제는 제외한다. 신청 흐름은 `신청 -> 호스트 팀 owner/manager 승인 대기`로 해석한다.
- 팀은 owner 1명, manager 최대 5명, member 무제한이다.
- 팀 가입은 open 즉시 가입이 없다. `approval_required` 또는 `closed`만 둔다.
- 사이트 공지는 사용자별 읽음 저장이 없다. 목록/상세 확인만 제공한다.
- 알림은 사용자별 row의 `read_at`으로 읽음 처리한다.
- 채팅 v1은 개인 매치/팀매치 연결 채팅만 둔다. 1:1 DM, 팀 상시 채팅, 파일 첨부는 제외한다.
- 결제/환불/분쟁 테이블과 API는 v1 core에서 제외하고 deferred로 남긴다.

## 3. Common Action Contract

| Action | Trigger | Feedback | API impact |
|---|---|---|---|
| Back | 뒤로가기 tap | press feedback | 서버 호출 없음. 상세 실패 시 기존 list context 유지 |
| Search focus | 검색 필드 tap/type | focus border, cursor | 검색 submit 전까지 서버 호출 없음 |
| Search submit | search icon 또는 Enter | submit lock, latest query 기준 | list/search API 호출 |
| Clear query | X tap | query만 제거 | 서버 호출 없음 또는 기본 목록 refetch |
| Filter open | filter tap | bottom sheet open | 서버 호출 없음 |
| Filter apply | 적용하기 tap | sheet close, list pending | list API 호출. draft 실패 시 기존 결과 유지 |
| Retry | 오류 CTA tap | 같은 context pending | 동일 query/filter/page 기준 재시도 |
| Row/card tap | row/card tap | pressed + route transition | detail API 호출 |
| Sticky CTA | primary CTA tap | press, lock if mutation | mutation API 호출, idempotency 필요 |
| Confirm action | 승인/거절/삭제/나가기 등 | confirm sheet | confirm 후 mutation API 호출 |

## 4. Section Inventory

### 4.1 `core-shell-sm-final`

| Screen | Action/Input | Tables | API impact |
|---|---|---|---|
| Top bar | 홈 검색 icon, 알림 icon, 상세 back/share/bell | notifications | 알림 목록 진입, 공유는 client 우선 |
| Bottom nav | 홈/매치/팀매치/팀/마이 탭 | none | 모듈 root navigation |
| Notification shell | bell tap, unread dot/count | notifications | `GET notifications`, `PATCH read`는 알림 도메인에서 처리 |
| Search back type | back, input, X, search | domain list tables | 모듈별 search API |
| Search filter type | filter open/apply/reset | domain list tables | 모듈별 list API |
| Action matrix | back/search/bell/more/tab/filter/clear/retry | cross-domain | 모든 API 문서의 공통 interaction 기준 |

### 4.2 `auth-onboarding-sm-final`

| Screen | Action/Input | Tables | API impact |
|---|---|---|---|
| Login | Kakao/Google/Apple/email login, 둘러보기 | users, auth_identities | provider callback, email session, guest read |
| Terms before signup | 필수 약관 동의, 선택 마케팅 수신 | terms_documents, user_terms_consents, notification_preferences | 필수 약관 current 조회, 동의 저장 |
| Signup | nickname/email/password 입력, 중복/불일치 오류 | users, user_profiles, auth_identities | 계정 생성, validation error |
| Signup complete guide | 운동 설정 시작 | user_onboarding_progress | progress update |
| Sport step | 종목 card 선택, 최소 1개 guard | sports, user_sport_preferences | preference draft 저장 또는 최종 저장 |
| Level step | 선택 종목별 실력 입력 | sport_levels, user_sport_preferences | level FK 저장 |
| Region step | 지역 chip, 현재 위치 권한, 수동 선택, skip/deferred | regions, user_regions | 0개 허용. 현재 위치는 자동 저장하지 않음 |
| Confirm | 단계별 수정, 최종 확인 | user_onboarding_progress | summary 상태 전환 |
| Welcome | 홈으로 시작 | users, user_onboarding_progress | onboarding completed/deferred 반영 |
| Exceptions | provider denied, email missing, conflict, blocked, resume | users, auth_identities | 상태별 복구 API 또는 hard stop |

### 4.3 `home-discovery-sm-final`

| Screen | Action/Input | Tables | API impact |
|---|---|---|---|
| Home main | 검색 icon, 알림 icon | notifications | 검색 화면 진입, 알림 목록 조회 |
| Home summary | 월간 활동/매너/통계 | user_reputation_summaries, derived match data | v1은 summary 일부 derived/read-only |
| Featured match | 대표 추천 card/detail | matches | 추천 계산 후 match detail |
| Quick actions | 매치, 팀매치, 팀, 나의 팀 disabled | matches, team_matches, teams | root list navigation. my team은 목적지 미정이면 disabled 유지 |
| Recommendation list | 추천 5개 card | matches | `GET home` 또는 `GET matches` 추천 정렬 |
| Notice strip | 공지 row, 전체보기 | notices | notice list/detail read |
| Network state | retry CTA | same as above | home aggregate 재시도 |
| Search page | back, input, X, submit, recent chip, quick condition | matches, team_matches, teams | unified search 또는 domain grouped search |
| Search states | empty text, error toast, stale response | search result only | latest query wins, query/context 유지 |

### 4.4 `home-notice-sm-final`

| Screen | Action/Input | Tables | API impact |
|---|---|---|---|
| Notice list | row tap, back | notices | published notice 목록 조회 |
| Notice detail | back | notices | notice 상세 조회 |
| Read state | 없음 | none | 사용자별 read/write API 없음 |

### 4.5 `matches-core-sm-final`

| Screen | Action/Input | Tables | API impact |
|---|---|---|---|
| Match list | search, filter, sort, view mode, sport chip | matches, sports, regions | cursor list/search API |
| Empty/error | retry, filter reset | matches | query/filter 유지 후 refetch |
| Match detail | back, share, bell, participant preview | matches, match_participants, notifications | detail read, notify preference candidate |
| Join sheet | 참가 CTA, 신청 확인 primary | match_applications, match_participants | v1은 payment 없이 application 생성 |
| Pending/approved | locked CTA | match_applications, match_participants | status read |
| My match detail | 관리 CTA | matches, match_applications, match_participants | owner manage API |
| Participants | 신청자 승인/거절, 승인 취소, 취소 처리 | match_applications, match_participants | host mutation, audit/status log |
| Situation exceptions | sold out, deadline, permission, cancelled, stale | matches, match_applications | derived status와 stored status 분리 |

### 4.6 `matches-core-sm-create-final`

| Screen | Action/Input | Tables | API impact |
|---|---|---|---|
| List entry | + FAB | none | `/matches/new` navigation |
| Sport step | sport card tap | sports | draft only or create payload |
| Info step | title, description, image, max participants, fee display, level, gender, rules | matches, sport_levels | create/update validation |
| Image upload | 1장/10MB, preview | matches.image_url | v1은 대표 image URL 1개 |
| Place/time step | facility card or direct input, date, start/end | matches | v1은 venue FK 없이 direct place fields |
| Confirm | item edit tap | matches | server 없음, step 이동 |
| Submit | 매치 만들기 | matches, match_participants | create match + host participant |
| Edit | prefill, save, cancel guard | matches | host-only update |
| Exceptions | required missing, file error, time invalid, permission, save failure | matches | validation/error contract 필요 |

### 4.7 `teams-team-matches-sm-revision-4`

| Screen | Action/Input | Tables | API impact |
|---|---|---|---|
| Team match list | search, filter, sort/view, sport chip | team_matches, teams, sports | cursor list/search API |
| Team match detail | back, share, bell, team info | team_matches, teams, team_trust_scores | detail read |
| Chat | 신청 전 문의용 보조 CTA | chat_rooms, chat_room_participants | linked chat room read/create candidate |
| Apply sheet | 신청하기, 신청 요약 확인 | team_match_applications | v1은 payment 없이 application 생성 |
| Pending/approved | locked CTA | team_match_applications | status read |
| My team match | 매치 관리 CTA | team_matches, team_match_applications | host team owner/manager manage API |

### 4.8 `teams-team-matches-sm-create-final`

| Screen | Action/Input | Tables | API impact |
|---|---|---|---|
| List entry | + FAB | none | `/team-matches/new` navigation |
| Team step | 내 팀 선택, 권한 확인 | teams, team_memberships | owner/manager만 다음 단계 |
| Sport step | sport card tap | sports | selected sport |
| Info step | title, description, image | team_matches | create/update validation |
| Condition step | grade, format, type, style, free invitation, cost, gender, rules | team_matches | selected chips and numeric validation |
| Place/time step | facility/direct place, date/time, duration, quarters | team_matches | v1 venue FK 없음 |
| Confirm | item edit tap | team_matches | server 없음, step 이동 |
| Submit/share | 팀매치 만들기, 팀 채팅 공유, link copy | team_matches, chat_rooms | create mutation, share client or chat message future |
| Edit | prefill, save, cancel guard | team_matches | owner/manager update |
| Exceptions | required missing, free cost lock, permission, duplicate submit | team_matches | idempotency/status conflict 필요 |

### 4.9 `team-browse-sm-revision-5`

| Screen | Action/Input | Tables | API impact |
|---|---|---|---|
| Team list | search, chip, filter, sort, team card | teams, team_profiles, team_trust_scores, sports, regions | cursor list/search API |
| Team card | 팀 보기, 마감이면 알림받기 | teams, notifications | detail read, notification candidate |
| Filter sheet | reset, close, apply | teams | list API refetch |
| Empty/error | filter reset, retry | teams | query/filter 유지 |
| Team detail | 가입 가능 여부 확인 | teams, team_profiles, team_memberships, team_join_applications | join eligibility read |
| Join flow | 승인 요청, closed/permission sheet | team_join_applications | open join 없음. approval_required/closed only |
| Team images | logo/cover/photos/example | team_profiles | v1 저장 이미지만 노출, 예시는 저장 제외 |

### 4.10 `community-sm-final`

| Screen | Action/Input | Tables | API impact |
|---|---|---|---|
| Home chat entry | floating chat tap | chat_rooms | chat list navigation |
| Chat list | category chip, row tap | chat_rooms, chat_room_participants, chat_messages | list/read latest message |
| Swipe action | pin/unpin, leave | chat_room_participants | participant status or pinned mutation |
| Leave confirm | 나가기/취소 | chat_room_participants | confirm 후 leave mutation |
| Chat room | message input, send | chat_messages | text-only send |
| Notifications | unread/read, row deep link, mark read | notifications | list, mark read_at, deep link |
| Late connect | websocket + backfill | notifications, chat_messages | realtime은 backfill API와 함께 사용 |

### 4.11 `my-profile-trust-sm-revision`

| Screen | Action/Input | Tables | API impact |
|---|---|---|---|
| My page | profile edit, logout, my activity entries | users, user_profiles | self profile/session APIs |
| My matches | joined/created toggle, detail | matches, match_applications, match_participants | my list APIs |
| Created match manage | participants/applicants tab, approve/reject, user info, cancel approval | match_applications, match_participants | host manage APIs |
| Match edit | prefill/save/cancel | matches | host update |
| My team matches | 신청팀 정보, 팀매치 수정 | team_matches, team_match_applications | host team manage APIs |
| Applicant team profile | approve/reject | team_match_applications | owner/manager mutation |
| My teams | team list by role | teams, team_memberships | my team list |
| Team detail | team chat, team info, member manage | teams, team_memberships, chat_rooms | v1 team chat deferred unless match-linked |
| Team members | user info, role change, join approve/reject | team_memberships, team_join_applications | owner/manager permission |
| Profile/reviews/badges | public profile, review/badge display | user_profiles, user_reputation_summaries | read-only v1 unless review later |

### 4.12 `payments-support-sm-revision`

| Screen | Action/Input | Tables | API impact |
|---|---|---|---|
| Checkout | 결제하고 참가하기 | deferred | v1 core API 없음 |
| Refund | 환불 요청하기 | deferred | v1 core API 없음 |
| History/detail | 결제 내역/상세 | deferred | v1 core API 없음 |
| Display policy | mock/test/live 혼동 금지 | none | v1에서는 결제 CTA를 신청 CTA로 치환하거나 deferred 안내 |

### 4.13 `settings-states`

| Screen | Action/Input | Tables | API impact |
|---|---|---|---|
| Settings main | account/notification/privacy/terms row | users, notification_preferences, terms_documents | detail read |
| Notification settings | important, public profile, marketing toggles | notification_preferences, user_profiles | save settings |
| Account settings | email/password/logout/delete | users, auth_identities | self account mutation |
| Legal pages | privacy/terms versions | terms_documents, user_terms_consents | current terms read |
| Danger actions | logout, account delete confirm | users | session revoke, withdrawal request |

### 4.14 `public-marketing-sm-revision`

| Screen | Action/Input | Tables | API impact |
|---|---|---|---|
| Landing | 시작하기 | none | auth navigation |
| Public entry cards | 개인 매치, 팀매치, 팀 찾기, 채팅/알림 안내 | matches, team_matches, teams | public list read where allowed |
| Public stats | sample count | derived | API optional. sample이면 실제 신뢰 신호로 쓰지 않음 |

### 4.15 `desktop-web`

| Screen | Action/Input | Tables | API impact |
|---|---|---|---|
| Desktop landing/home | same as mobile home/public | matches, team_matches, teams, notices | mobile API 재사용 |
| Desktop match search | filter, side panel, table/list overflow | matches | same search API with wider response shape |
| Keyboard/focus | focus state, enter submit | none | accessibility/client behavior |

### 4.16 `admin-ops-sm-revision`

| Screen | Action/Input | Tables | API impact |
|---|---|---|---|
| Admin dashboard | queue card tap, filter | admin_users, admin_action_logs, status_change_logs | admin summary/list |
| Operation queue | 처리, 보류 | target tables, admin_action_logs | admin mutation with reason |
| User/match/team ops | status change, recovery | users, matches, teams, team_matches | before/after audit |
| Bulk/partial failure | partial result handling | admin_action_logs | mutation result must include per-item failure |

### 4.17 `common-flows-motion`

| Screen | Action/Input | Tables | API impact |
|---|---|---|---|
| Edit flow parity | create/edit shared shell, prefill, cancel guard | target tables | create/update APIs must support validation and unchanged state |
| Micro interactions | tap, skeleton, toast, sheet, sticky CTA | none | API pending/error states must map to UI |
| State atlas | loading/empty/error/pending/success | cross-domain | every list/detail/mutation needs state contract |
| Edge cases | permission, stale, duplicate, destructive confirm | cross-domain | standard error/status codes |
| Handoff matrix | API readiness | cross-domain | endpoint docs must list actor, state, audit, idempotency |

## 5. API Design Implications

- List APIs need cursor pagination, query/filter/sort, and context preservation.
- Detail APIs need enough status fields for CTA locking, not just entity data.
- Mutation APIs that approve/reject/apply/join/leave/delete must use idempotency or explicit conflict handling.
- State-changing APIs must record `status_change_logs`; admin-triggered changes also record `admin_action_logs`.
- Home API can aggregate data, but recommendations and stats must be marked as derived unless stored later.
- Payment wording in design must not create v1 payment APIs. It maps to application creation until payment is reintroduced.
- Notice read/write is not required. Notification read/write is required.

## 6. Open Questions

| Question | Current judgment | Needs approval now? |
|---|---|---|
| `my team` shortcut destination | keep disabled until destination is fixed | No |
| Desktop API separate endpoints | reuse mobile/domain APIs first | No |
| Settings v1 scope | include notification prefs, profile visibility, logout/delete; defer password/email if auth implementation is not ready | Later |
| Team member destructive powers | owner can do all; manager power needs permission matrix detail | Later |

