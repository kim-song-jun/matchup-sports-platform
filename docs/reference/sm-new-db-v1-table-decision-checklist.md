# SM New DB v1 Table Decision Checklist

## 1. 기준

```text
Status: working checklist
Design baseline: Team Design > 1차 디자인 완료
Scope: DB v1 core table decisions only
Not for: candidate module tables, Prisma migration, API endpoint contract
```

이 문서는 `Team Design > 1차 디자인 완료` 기준으로 DB v1 테이블을 하나씩 확정하기 위한 진행판이다.

현재 목적은 테이블별로 다음 항목을 빠짐없이 닫는 것이다.

- 테이블 목적
- 연결 화면
- 컬럼
- PK/FK
- unique/index
- 상태값
- lifecycle
- 권한/소유권
- soft delete
- audit
- API read/write 영향
- open question

후보군 기능은 이번 체크리스트에서 설계하지 않는다. 필요한 경우 이름만 `Deferred Tables`에 남기고 추후 별도 설계한다.

## 2. 완료 기준

테이블 하나가 완료되려면 아래 체크박스가 모두 완료되어야 한다.

```text
Done = 목적, 화면, 컬럼, 관계, 상태값, lifecycle, 권한, audit/index, open question이 모두 닫힌 상태
```

공통 체크 항목:

- [ ] 목적 확정
- [ ] 연결 화면 확정
- [ ] 컬럼 확정
- [ ] nullable/default 확정
- [ ] PK/FK 확정
- [ ] unique/index 확정
- [ ] status enum 필요 여부 및 값 확정
- [ ] lifecycle 필요 여부 및 전이 확정
- [ ] owner/permission 확정
- [ ] soft delete 여부 확정
- [ ] audit 필요 여부 확정
- [ ] API read/write 영향 확인
- [ ] open question 없음

## 3. 진행 요약

| Domain | Done | Total | Status |
|---|---:|---:|---|
| Identity/Auth | 4 | 4 | Done |
| Terms/Master | 5 | 5 | Done |
| User Preference/Home | 4 | 4 | Done |
| Personal Match | 3 | 3 | Done |
| Team | 5 | 5 | Done |
| Team Match | 2 | 2 | Done |
| Chat/Notification | 5 | 5 | Done |
| Payment/Support | 0 | 0 | Deferred |
| Admin/Audit | 3 | 3 | Done |
| **Total** | **31** | **31** | **Done** |

## 4. 결정 로그

아래 항목은 테이블을 확정하면서 누적한다.

| Date | Table | Decision | Reason | Follow-up |
|---|---|---|---|---|
| 2026-05-14 | - | 체크리스트 생성 | DB v1 core 테이블을 후보군과 분리해 하나씩 확정하기 위함 | `users`부터 검토 |
| 2026-05-14 | `users` | 계정 식별자와 계정 lifecycle 전용 테이블로 확정. 프로필 노출 정보는 `user_profiles`로 분리 | 인증/권한/actor 기준과 공개 프로필 정보를 분리해 탈퇴/차단/익명화 정책을 안정화하기 위함 | `auth_identities` 검토 |
| 2026-05-14 | `auth_identities` | provider별 로그인 identity 연결 테이블로 확정. 식별 기준은 `(provider, provider_user_key)` unique | 내부 user와 외부/로그인 provider identity를 분리하고, 다중 provider 연결 및 연결 해제 이력을 보존하기 위함 | `user_profiles` 검토 |
| 2026-05-14 | `user_profiles` | 사용자 노출 프로필 1:1 테이블로 확정. 계정 삭제 시 row 삭제 대신 노출 정보 익명화 | 과거 매치/팀/채팅/audit FK를 보존하면서 개인정보 노출을 제거하기 위함 | `user_onboarding_progress` 검토 |
| 2026-05-14 | `user_onboarding_progress` | 온보딩 상세 진행/재개 상태 1:1 테이블로 확정. `users.onboarding_status`는 summary로 분리 | 온보딩 중간 저장과 최종 preference 반영 책임을 분리하기 위함 | `terms_documents` 검토 |
| 2026-05-14 | `terms_documents` | 약관 종류/버전/게시 상태 master 테이블로 확정. 삭제 대신 `archived`로 보존 | 약관 동의 이력과 법적/운영 버전 추적을 안정적으로 유지하기 위함 | `user_terms_consents` 검토 |
| 2026-05-16 | `user_terms_consents` | 사용자별 약관 버전 동의 이력 테이블로 확정. 같은 사용자와 약관 문서는 1 row로 유지하고 철회/재동의는 현재 row 갱신으로 표현 | 약관 버전은 `terms_documents`로 분리되어 있어 버전별 이력은 보존되며, v1에서 별도 consent event table은 과도하기 때문 | `sports` 검토 |
| 2026-05-16 | `sports` | 종목을 enum이 아닌 DB master 테이블로 확정. v1 active seed는 축구, 풋살, 농구, 야구, 배드민턴, 테니스, 러닝/조깅으로 시작 | 온보딩, 매치, 팀, 팀매치가 공통 참조하며 종목 추가/비활성화 가능성이 높기 때문 | `sport_levels` 검토 |
| 2026-05-16 | `sport_levels` | 종목별 실력 master 테이블로 확정. v1 기본 체계는 종목별 5단계 seed로 시작 | 종목별 표시명/설명 확장이 필요하고, 사용자가 5단계 기본 체계를 선택했기 때문 | `regions` 검토 |
| 2026-05-16 | `regions` | 활동 지역 master를 2단계 행정구역 시/도 -> 시/군/구 구조로 확정. 가상 지역은 포함하지 않음 | 온보딩/필터에는 2단계가 충분하고, 내 주변/직접 입력 장소는 지역 master가 아닌 검색 옵션/장소 필드 책임이기 때문 | `user_sport_preferences` 검토 |
| 2026-05-16 | `user_sport_preferences` | 사용자 관심 종목/실력 선호 테이블로 확정. 실력은 `level_code` 문자열이 아니라 `sport_level_id` FK로 저장 | `sport_levels`가 종목별 master로 확정되었으므로 선호 데이터도 같은 master를 참조해야 하기 때문 | `user_regions` 검토 |
| 2026-05-16 | `user_regions` | 사용자 활동 지역 선호 테이블로 확정. 사용자는 지역을 0개 이상 가질 수 있고, primary는 optional이며 위치 권한 기반 현재 위치는 자동 저장하지 않음 | 지역을 선택하지 않는 사용자도 온보딩/서비스 이용이 가능해야 하고, 현재 위치와 활동 지역 선호는 의미가 다르기 때문 | `notices` 검토 |
| 2026-05-16 | `notices` | 공지 master 테이블로 확정. 비로그인 public 노출을 허용하고 대상 범위는 `public | users | admins`로 구분하며 삭제 대신 archived로 보존 | 점검/정책/이벤트 공지는 로그인 전에도 필요할 수 있고, 공지는 운영 이력으로 보존해야 하기 때문 | `notice_reads` 필요성 검토 |
| 2026-05-16 | `notice_reads` | DB v1 core 대상에서 제외. 공지는 사이트 전체 공지로 띄우고 확인만 가능하면 충분하며 사용자별 읽음 표시를 저장하지 않음 | 사용자별 읽음 상태가 현재 제품 요구가 아니고, 비로그인 공지까지 고려하면 익명 식별/개인정보 저장 부담이 커지기 때문 | `user_activity_summaries` 검토 |
| 2026-05-16 | `user_activity_summaries` | DB v1 core 대상에서 제외. 활동 요약은 원천 match/team/payment 도메인 이벤트 확정 후 계산/캐시 여부를 재검토 | 원천 이벤트와 집계 기준이 먼저 확정되지 않으면 summary table이 제품 의미와 어긋날 수 있기 때문 | `user_reputation_summaries` 검토 |
| 2026-05-17 | `user_reputation_summaries` | 사용자 평판 요약 테이블로 확정. 매너 점수/후기 수/신뢰 라벨은 `user_profiles`가 아니라 이 테이블에서 관리하고, 검증/추정/샘플 상태를 분리 | 사용자 카드/프로필의 신뢰 신호는 필요하지만 mock/샘플 데이터를 실제 평판처럼 보이면 안 되기 때문 | `match_recommendations` 검토 |
| 2026-05-17 | `match_recommendations` | DB v1 core 대상에서 제외. 추천 결과 저장 없이 API 실시간 계산/정렬로 시작 | 추천 캐시는 홈/검색 최적화 영역이고, 먼저 매치/선호/지역 원천 로직과 stale 기준이 확정되어야 하기 때문 | `matches` 검토 |
| 2026-05-17 | `matches` | 개인 매치 모집글 테이블로 확정. v1은 결제를 제외하고 참가 신청은 항상 호스트 승인형으로 진행하며, 장소는 직접 입력 기반으로 시작 | 결제는 사용자 유입 이후 별도 도입할 예정이고, 자동 확정보다 호스트 승인형이 현재 운영 정책에 맞기 때문 | `match_media` 검토 |
| 2026-05-17 | `match_media` | DB v1 core 대상에서 제외. 개인 매치 이미지는 `matches.image_url` 대표 이미지 1장으로 시작 | 다중 이미지/갤러리/업로드 처리 상태는 파일 도메인과 운영 정책을 키우므로 v1 모집글에는 과도하기 때문 | `match_applications` 검토 |
| 2026-05-17 | `match_applications` | 개인 매치 참가 신청/심사 이력 테이블로 확정. v1은 결제 상태 없이 `requested -> approved/rejected/withdrawn/cancelled_by_host/expired`로 관리하고, 승인 시 `match_participants`를 별도 생성 | 신청 이력과 확정 참가자 상태를 분리해야 취소/노쇼/완료 처리가 명확해지기 때문 | `match_participants` 검토 |
| 2026-05-17 | `match_participants` | 개인 매치 확정 참가자 테이블로 확정. 호스트도 participant row로 포함하고 `role = host | participant`로 구분 | 참가자 목록, 정원 계산, 출석/노쇼/완료/후기 흐름을 한 테이블 기준으로 다루기 위함 | `teams` 검토 |
| 2026-05-17 | `teams` | 서비스 팀 기본 엔티티로 확정. `owner_user_id`와 `team_memberships.role = owner`를 함께 두고 v1은 owner 1명으로 시작 | 빠른 대표 소유자 조회와 실제 멤버십 권한 모델을 모두 안정적으로 지원하기 위함 | `team_profiles` 검토 |
| 2026-05-17 | `team_profiles` | 팀 소개/운영 정보 1:1 확장 테이블로 확정. 대표 지역은 `teams.region_id`가 담당하고, 다중 활동 지역 정규화는 v1에서 제외 | 프로필은 소개 중심으로 유지하고 지역 검색 기준과 중복을 피하기 위함 | `team_memberships` 검토 |
| 2026-05-17 | `team_memberships` | 팀 소속/권한 테이블로 확정. 팀장은 1명, 관리자는 최대 5명, 일반 회원은 제한 없음 | 팀 운영 책임자는 단일화하되 운영 보조 권한은 제한된 관리자 그룹으로 나누기 위함 | `team_join_applications` 검토 |
| 2026-05-17 | `team_join_applications` | 팀 가입 신청/심사 이력 테이블로 확정. v1 팀 가입은 항상 승인형이며 open 즉시 가입은 지원하지 않음 | 팀장/관리자 승인 흐름을 기본 운영 정책으로 두기 위함 | `team_trust_scores` 검토 |
| 2026-05-17 | `team_trust_scores` | 팀 신뢰/평판 요약 테이블로 확정. 검증/추정/샘플/없음 상태를 분리하고 산식은 원천 이벤트 확정 후 구현 단계에서 고정 | 팀 목록/상세/팀매치 신청에서 팀 신뢰 신호가 필요하지만 샘플 데이터를 실제 신뢰처럼 보여서는 안 되기 때문 | `team_matches` 검토 |
| 2026-05-17 | `team_matches` | 팀매치 모집글 테이블로 확정. v1은 결제와 시설 FK를 제외하고 직접 입력 장소, 비용 안내 텍스트, `matched` 상태를 사용 | 팀매치도 초기 v1에서는 결제/시설 self-service 없이 팀장/관리자 승인 기반 매칭에 집중하기 위함 | `team_match_applications` 검토 |
| 2026-05-17 | `team_match_applications` | 팀매치 상대 팀 신청/심사 이력 테이블로 확정. v1은 1:1 팀 대 팀 매칭이며 한 팀매치에 approved 상대 팀은 최대 1개 | 다자 매치/토너먼트가 아닌 단일 상대 팀 확정 모델로 시작해야 상태와 권한이 단순하기 때문 | `chat_rooms` 검토 |
| 2026-05-17 | `chat_rooms` | 개인 매치/팀매치 연결 채팅방 테이블로 확정. v1은 팀 내부 채팅과 1:1 DM을 제외하고 `match_id`, `team_match_id` 명시 FK를 사용 | v1 채팅은 매치 조율에 집중하고, polymorphic target보다 명시 FK가 무결성과 권한 체크에 유리하기 때문 | `chat_room_participants` 검토 |
| 2026-05-17 | `chat_room_participants` | 채팅방 참여자 상태 테이블로 확정. 개인 매치는 확정 참가자, 팀매치는 양 팀 owner/manager만 참여 | 팀매치 조율은 대표자/관리자 중심이고 일반 회원 수는 제한이 없어 전체 참여가 과도하기 때문 | `chat_messages` 검토 |
| 2026-05-17 | `chat_messages` | 텍스트 메시지 테이블로 확정. v1은 이미지/파일 첨부와 서버 저장 failed 상태를 제외하고 삭제/숨김은 status로 보존 | 매치 조율 채팅에는 텍스트부터 충분하고, 첨부/실패 재시도는 storage/moderation/client 임시 상태 설계가 필요하기 때문 | `notifications` 검토 |
| 2026-05-17 | `notifications` | user별 인앱 알림 테이블로 확정. 읽음 상태는 별도 read table 없이 `read_at`으로 관리하고 대상은 `target_type/target_id`로 표현 | 알림은 수신자별 row가 자연스럽고, 알림 대상 종류는 다양해 범용 target이 명시 FK보다 적합하기 때문 | `notification_preferences` 검토 |
| 2026-05-17 | `notification_preferences` | 사용자별 인앱 알림 카테고리 설정 테이블로 확정. push/email 채널 설정은 제외하고 marketing만 기본 false | v1은 인앱 알림 중심이며 서비스 활동 알림은 기본 수신, 마케팅 알림은 명시 동의가 필요하기 때문 | `payments` 검토 |
| 2026-05-17 | `payments` / `payment_attempts` / `refund_requests` | DB v1 core 대상에서 제외. 개인 매치/팀매치 v1 결제 제외 결정에 따라 결제/시도/환불 테이블도 후속 도입으로 보류 | 결제 기능은 사용자 유입 이후 별도 도입 예정이며, 현재 core DB에 결제 lifecycle을 고정하면 과설계가 되기 때문 | `disputes` 검토 |
| 2026-05-17 | `disputes` / `dispute_events` | DB v1 core 대상에서 제외. 신고/분쟁/운영 처리 UX가 확정되면 후속 설계 | 결제/환불이 v1에서 제외되었고, 비매너/신고는 별도 moderation/report 모델이 더 적합할 수 있기 때문 | `admin_users` 검토 |
| 2026-05-17 | `admin_users` | 관리자 계정 확장 테이블로 확정. v1은 세부 permission table 없이 `admin_role = owner | ops | support`로 시작 | 초기 관리자 기능은 role 기반으로 충분하고, capability 세분화는 운영 복잡도가 확인된 뒤 도입하는 편이 안전하기 때문 | `admin_operation_tasks` 검토 |
| 2026-05-17 | `admin_operation_tasks` | DB v1 core 대상에서 제외. v1 관리자는 각 도메인 화면에서 직접 조치하고 결과는 `admin_action_logs`에 남김 | 분쟁/신고/결제/환불이 Deferred라 task queue를 만들 만큼 비동기 운영 업무가 아직 없기 때문 | `admin_action_logs` 검토 |
| 2026-05-17 | `admin_action_logs` | 관리자 조치 감사 로그 테이블로 확정. 관리자 의도/사유/before-after를 기록하고 상태 변화 사실은 `status_change_logs`와 역할 분리 | v1 여러 도메인에서 관리자 조치가 필요하며, 조치 사유와 상태 전이를 분리해야 감사 의미가 명확하기 때문 | `status_change_logs` 검토 |
| 2026-05-17 | `status_change_logs` | 공통 상태 전이 로그 테이블로 확정. admin뿐 아니라 user/system/host/manager 등 상태 변경 actor를 기록할 수 있게 설계 | 상태 변화의 before/after와 actor를 공통으로 남겨 디버깅, 운영 추적, 감사 근거를 확보하기 위함 | DB v1 core table decision complete |

## 5. Tables

### 5.1 Identity/Auth

#### `users`

- [x] 목적 확정
- [x] 연결 화면 확정
- [x] 컬럼 확정
- [x] nullable/default 확정
- [x] PK/FK 확정
- [x] unique/index 확정
- [x] status enum 필요 여부 및 값 확정
- [x] lifecycle 필요 여부 및 전이 확정
- [x] owner/permission 확정
- [x] soft delete 여부 확정
- [x] audit 필요 여부 확정
- [x] API read/write 영향 확인
- [x] open question 없음

```text
Purpose:
서비스 사용자 계정의 최상위 식별자와 계정 상태를 관리한다. 모든 도메인에서
user actor FK의 기준이 된다. 닉네임, 프로필 이미지, 소개, 매너 점수 같은
노출 정보는 `user_profiles`로 분리한다.

Screens:
01 인증/온보딩
02 홈
07 마이/프로필
09 설정/탈퇴
12 관리자/운영
전체 도메인의 created_by, updated_by, actor FK

Columns:
id uuid pk
email string nullable
phone string nullable
account_status enum not null default active
onboarding_status enum not null default not_started
last_login_at timestamptz nullable
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
deleted_at timestamptz nullable

Status:
account_status = active | suspended | blocked | withdrawal_pending | deleted
onboarding_status = not_started | terms_done | signup_done | sport_done |
  level_done | region_done | completed | deferred

Lifecycle:
created -> active
active -> suspended
suspended -> active
active -> blocked
blocked -> active 또는 deleted
active -> withdrawal_pending
withdrawal_pending -> active
withdrawal_pending -> deleted

Permissions:
user = 자기 계정 조회, 자기 탈퇴 요청, 일부 설정 변경
admin = 계정 정지/차단/복구, 탈퇴/삭제 상태 확인, 운영 목적 조회
system = 회원가입 완료, 마지막 로그인 시각 갱신, 탈퇴 유예 기간 만료 처리

Indexes:
PK = id
unique = email where email is not null
unique = phone where phone is not null
index = account_status
index = onboarding_status
index = deleted_at

Audit:
status_change_logs = account_status 변경, withdrawal_pending 전환, deleted 전환
admin_action_logs = admin에 의한 suspended/blocked/active 변경

Soft delete:
Yes. `deleted_at` 사용. 단, 개인정보 익명화/삭제 정책은 별도 계정 삭제
정책에서 다룬다.

API read/write impact:
Read = 현재 사용자 조회, 관리자 사용자 조회, actor display용 최소 사용자 참조
Write = 회원가입/소셜 로그인 시 생성, 마지막 로그인 갱신, 온보딩 요약 상태 갱신,
  탈퇴 요청, 관리자 상태 변경

Open questions:
없음
```

#### `auth_identities`

- [x] 목적 확정
- [x] 연결 화면 확정
- [x] 컬럼 확정
- [x] nullable/default 확정
- [x] PK/FK 확정
- [x] unique/index 확정
- [x] status enum 필요 여부 및 값 확정
- [x] lifecycle 필요 여부 및 전이 확정
- [x] owner/permission 확정
- [x] soft delete 여부 확정
- [x] audit 필요 여부 확정
- [x] API read/write 영향 확인
- [x] open question 없음

```text
Purpose:
사용자의 로그인 provider identity를 관리한다. 하나의 `users` row가 여러
provider identity를 가질 수 있다. 실제 외부 계정 식별 기준은
`provider + provider_user_key`다.

Screens:
01 인증/온보딩
09 설정/계정 연결
12 관리자/사용자 조회

Columns:
id uuid pk
user_id uuid not null fk users.id
provider enum not null
provider_user_key string not null
email string nullable
phone string nullable
status enum not null default active
linked_at timestamptz not null default now()
last_used_at timestamptz nullable
revoked_at timestamptz nullable
created_at timestamptz not null default now()
updated_at timestamptz not null default now()

Status:
provider = kakao | google | apple | email
status = active | revoked | blocked

Lifecycle:
none -> active
active -> revoked
active -> blocked
blocked -> active
revoked -> active

Revoked identity를 재연결하면 기존 row를 active로 복구한다. 과거 연결 이력을
유지하기 위함이다.

Permissions:
user = 자기 provider 연결 조회, 자기 provider 연결 해제
system = 로그인 성공 시 생성/갱신, last_used_at 갱신, provider callback 처리
admin = 보안/운영 목적 조회, identity blocked 처리 후보

Indexes:
PK = id
FK = user_id -> users.id
unique = (provider, provider_user_key)
index = user_id
index = provider
index = status
index = last_used_at

FK delete policy:
restrict 또는 no action. 사용자 삭제 시 identity row를 물리 삭제하지 않고
user 상태와 익명화 정책으로 처리한다.

Audit:
status_change_logs = provider identity 연결, 연결 해제, blocked 처리, blocked 해제
admin_action_logs = admin에 의한 blocked 처리/해제

Soft delete:
No. 연결 해제는 `status = revoked`, `revoked_at`으로 표현하고 row는 유지한다.

API read/write impact:
Read = 내 연결 계정 목록, 관리자 사용자 상세의 auth provider 정보
Write = OAuth callback 로그인/가입, 이메일 로그인/연결, provider 연결 해제,
  provider 재연결, 보안 차단/해제

Open questions:
없음
```

#### `user_profiles`

- [x] 목적 확정
- [x] 연결 화면 확정
- [x] 컬럼 확정
- [x] nullable/default 확정
- [x] PK/FK 확정
- [x] unique/index 확정
- [x] status enum 필요 여부 및 값 확정
- [x] lifecycle 필요 여부 및 전이 확정
- [x] owner/permission 확정
- [x] soft delete 여부 확정
- [x] audit 필요 여부 확정
- [x] API read/write 영향 확인
- [x] open question 없음

```text
Purpose:
사용자 공개/마이 프로필에 표시되는 기본 정보를 관리한다. 계정 lifecycle은
`users`가 담당하고, 프로필 노출 정보는 `user_profiles`가 담당한다.
평판/활동 집계는 `user_reputation_summaries`로 분리한다.

Screens:
02 홈 인사/요약
03 개인 매치 host/participant profile
05 팀 멤버/가입자 profile
06 채팅 avatar/name
07 마이/프로필/평판
10 공개 프로필
12 관리자 사용자 상세

Columns:
user_id uuid pk fk users.id
display_name string not null
profile_image_url string nullable
bio string nullable
visibility_status enum not null default public
created_at timestamptz not null default now()
updated_at timestamptz not null default now()

Excluded columns:
manner_score, activity_count, review_count, trust_label은 이 테이블에 두지 않는다.
평판/활동 값은 갱신 주기와 신뢰 상태가 다르므로 `user_reputation_summaries`에서
관리한다.

Status:
visibility_status = public | members_only | private

Lifecycle:
users 생성 후 profile 생성
profile 수정
users withdrawal_pending 또는 deleted 전환 시 익명화 후보

Deletion/anonymization policy:
`user_profiles` row는 물리 삭제하지 않는다. 계정 삭제는 `users.account_status = deleted`,
`users.deleted_at`으로 관리하고, `user_profiles`는 아래처럼 익명화한다.

display_name = "탈퇴한 사용자"
profile_image_url = null
bio = null
visibility_status = private

재식별 가능한 provider key, email, phone 등은 `auth_identities`와 계정 삭제 정책에서
별도로 제거/비활성화한다. 결제/분쟁/audit 등 법적 또는 업무상 보존 대상 기록은
개인정보 최소화 및 목적 제한 상태로 보존한다.

Permissions:
user = 자기 프로필 조회/수정, 자기 공개 범위 변경
related user = visibility_status에 따라 제한된 조회
admin = 운영 목적 조회, 부적절한 프로필 이미지/소개 조치 후보

Indexes:
PK = user_id
FK = user_id -> users.id
index = visibility_status

display_name은 unique로 두지 않는다. 동명이인을 허용한다.

Audit:
status_change_logs = visibility_status 변경, 탈퇴/삭제 시 익명화 처리
admin_action_logs = admin에 의한 프로필 조치
선택 = 일반 display_name/bio/profile_image_url 수정 이력은 v1 필수 아님

Soft delete:
No. 사용자 탈퇴/삭제는 `users` 상태와 `deleted_at`으로 관리하고, 프로필은 익명화한다.

API read/write impact:
Read = 내 프로필 조회, 공개 프로필 조회, 매치/팀/채팅의 actor display 정보 조회,
  관리자 사용자 상세
Write = 내 프로필 수정, 공개 범위 변경, 탈퇴/삭제 시 익명화, 관리자 프로필 조치 후보

Open questions:
없음
```

#### `user_onboarding_progress`

- [x] 목적 확정
- [x] 연결 화면 확정
- [x] 컬럼 확정
- [x] nullable/default 확정
- [x] PK/FK 확정
- [x] unique/index 확정
- [x] status enum 필요 여부 및 값 확정
- [x] lifecycle 필요 여부 및 전이 확정
- [x] owner/permission 확정
- [x] soft delete 여부 확정
- [x] audit 필요 여부 확정
- [x] API read/write 영향 확인
- [x] open question 없음

```text
Purpose:
온보딩 진행 상태를 재개할 수 있게 저장한다. `users.onboarding_status`는
계정 전체의 요약 상태이고, `user_onboarding_progress`는 단계별 선택값과
재개 위치를 저장하는 상세 상태다.

Screens:
01 인증/온보딩
01 운동 설정 1/3 종목
01 운동 설정 2/3 실력
01 운동 설정 3/3 지역
02 홈 진입 gate
09 설정에서 운동 정보 재수정 후보

Columns:
user_id uuid pk fk users.id
current_step enum not null default terms
completed_steps jsonb not null default []
selected_sport_ids uuid[] nullable
selected_level_by_sport jsonb nullable
selected_region_ids uuid[] nullable
location_permission_status enum nullable
deferred_at timestamptz nullable
completed_at timestamptz nullable
created_at timestamptz not null default now()
updated_at timestamptz not null default now()

Status:
current_step = terms | signup | sport | level | region | welcome | completed
location_permission_status = unknown | granted | denied | blocked | manual

`deferred`는 current_step 값으로 두지 않는다. 재개할 단계는 `current_step`에 남기고,
나중에 하기는 `deferred_at`으로 표현한다.

Lifecycle:
none -> terms
terms -> signup
signup -> sport
sport -> level
level -> region
region -> welcome
welcome -> completed
any incomplete -> deferred_at set
deferred -> last current_step
completed -> completed

Progress data policy:
온보딩 중간 저장/재개를 위해 선택값을 progress에 draft로 저장한다. 온보딩 완료 시
canonical 데이터는 `user_sport_preferences`, `user_regions`에 확정 반영한다.

진행 중 = user_onboarding_progress에 draft 저장
완료 시 = user_sport_preferences/user_regions에 확정 저장,
  users.onboarding_status = completed,
  user_onboarding_progress.completed_at = now()

Permissions:
user = 자기 온보딩 progress 조회/수정
system = 가입 직후 progress 생성, 온보딩 완료 시 users.onboarding_status 동기화,
  완료 시 preference tables 반영
admin = 일반 수정 없음, 운영 조회 정도만 가능

Indexes:
PK = user_id
FK = user_id -> users.id
index = current_step
index = completed_at
index = deferred_at

Audit:
일반 단계별 저장은 audit 필수 아님.
completed 전환, deferred 선택, admin/system 보정은 status_change_logs 후보.

Soft delete:
No. 사용자 삭제는 `users` 계정 삭제/익명화 정책을 따른다.

API read/write impact:
Read = 온보딩 재개 상태 조회, 현재 단계 조회
Write = 단계별 선택값 저장, 나중에 하기, 온보딩 완료,
  완료 시 user_sport_preferences/user_regions 생성 또는 갱신

Open questions:
없음
```

### 5.2 Terms/Master

#### `terms_documents`

- [x] 목적 확정
- [x] 연결 화면 확정
- [x] 컬럼 확정
- [x] nullable/default 확정
- [x] PK/FK 확정
- [x] unique/index 확정
- [x] status enum 필요 여부 및 값 확정
- [x] lifecycle 필요 여부 및 전이 확정
- [x] owner/permission 확정
- [x] soft delete 여부 확정
- [x] audit 필요 여부 확정
- [x] API read/write 영향 확인
- [x] open question 없음

```text
Purpose:
서비스 약관, 개인정보 처리방침, 위치 관련 동의, 마케팅 수신 동의 등 약관
문서의 종류와 버전, 게시 상태를 관리한다. 사용자 동의 이력은
`user_terms_consents`가 담당하고, 이 테이블은 약관 원본/버전 master 역할을 한다.

Screens:
01 약관 동의
01 회원가입/온보딩 gate
09 설정/약관
12 관리자/약관 관리 후보

Columns:
id uuid pk
terms_type enum not null
title string not null
version string not null
required boolean not null default false
content text not null
status enum not null default draft
effective_at timestamptz nullable
published_at timestamptz nullable
archived_at timestamptz nullable
requires_reconsent boolean not null default false
created_at timestamptz not null default now()
updated_at timestamptz not null default now()

Status:
terms_type = service | privacy | location | marketing
status = draft | scheduled | published | archived

Required policy:
service = required true
privacy = required true
location = required false 후보
marketing = required false

Reconsent policy:
requires_reconsent = true이면 기존 사용자가 새 버전에 다시 동의해야 한다.
requires_reconsent = false이면 공지/열람만 필요하거나 minor update로 본다.

Lifecycle:
draft -> scheduled
draft -> published
scheduled -> published
published -> archived
draft -> archived

현재 버전이 새 버전으로 대체되면 기존 published 문서는 archived로 전환한다.

Permissions:
public/user = published 약관 조회
admin = 약관 생성/수정/예약/게시/보관
system = 게시 예약 시각 도달 시 scheduled -> published 전환 후보,
  이전 버전 archived 전환 후보

Indexes:
PK = id
unique = (terms_type, version)
index = terms_type
index = status
index = required
index = effective_at

Published uniqueness:
동일 terms_type에서 published 단일성은 v1에서 DB partial unique보다 service logic으로
제어한다.

Audit:
admin_action_logs = 약관 생성, 수정, 게시, 보관, requires_reconsent 변경
status_change_logs = scheduled/published/archived 상태 전환

Soft delete:
No. 약관 문서는 법적/운영 이력으로 보존해야 하므로 삭제하지 않고 archived를 사용한다.

API read/write impact:
Read = 회원가입 약관 목록 조회, 설정 약관 목록/상세 조회, 관리자 약관 조회
Write = 관리자 약관 생성/수정, 게시 예약, 게시, 보관

Open questions:
없음
```

#### `user_terms_consents`

- [x] 목적 확정
- [x] 연결 화면 확정
- [x] 컬럼 확정
- [x] nullable/default 확정
- [x] PK/FK 확정
- [x] unique/index 확정
- [x] status enum 필요 여부 및 값 확정
- [x] lifecycle 필요 여부 및 전이 확정
- [x] owner/permission 확정
- [x] soft delete 여부 확정
- [x] audit 필요 여부 확정
- [x] API read/write 영향 확인
- [x] open question 없음

```text
Purpose:
사용자가 특정 약관 문서 버전에 동의했는지, 언제 어떤 경로로 동의하거나 철회했는지
보존한다. `terms_documents`는 약관 원본과 버전 master이고,
`user_terms_consents`는 사용자별 동의 상태와 이력 기준이다.

Screens:
01 약관 동의
01 회원가입/온보딩 gate
09 설정/약관/마케팅 수신 동의
12 관리자/사용자 상세, 약관 동의 이력 조회 후보

Columns:
id uuid pk
user_id uuid not null fk users.id
terms_document_id uuid not null fk terms_documents.id
consented boolean not null default true
consented_at timestamptz not null default now()
revoked_at timestamptz nullable
consent_source enum not null default signup
ip_address string nullable
user_agent string nullable
created_at timestamptz not null default now()
updated_at timestamptz not null default now()

Status:
별도 status enum은 두지 않는다. 현재 동의 상태는 `consented`와 `revoked_at`으로 표현한다.

consent_source = signup | settings | reconsent | admin_import | system_migration

Lifecycle:
none -> consented
consented -> revoked
revoked -> consented

같은 `user_id + terms_document_id` 조합은 1 row로 유지한다. 같은 약관 버전에 대해
동의, 철회, 재동의가 반복되면 기존 row의 `consented`, `consented_at`, `revoked_at`,
`updated_at`을 갱신한다.

필수 약관 철회는 일반 설정 화면에서 직접 허용하지 않는다. 필수 약관 철회가 필요하면
서비스 이용 제한 또는 탈퇴 흐름으로 연결한다. 선택 약관, 특히 marketing 동의는
settings에서 철회할 수 있다.

Permissions:
user = 자기 약관 동의 이력 조회, 선택 약관 동의/철회
system = 회원가입/온보딩 완료 시 필수 약관 동의 기록 생성, 재동의 요구 판단
admin = 운영/법적 목적 조회. 직접 수정은 원칙적으로 금지
migration/system = 과거 동의 이력 이관

Indexes:
PK = id
FK = user_id -> users.id
FK = terms_document_id -> terms_documents.id
unique = (user_id, terms_document_id)
index = user_id
index = terms_document_id
index = consented_at
index = revoked_at

Audit:
이 테이블 자체가 약관 동의 상태 이력의 기준이다.
admin이 직접 보정하는 예외 상황은 admin_action_logs에 기록한다.
필수 약관 재동의 요구와 동의 완료 같은 상태성 이벤트는 status_change_logs 후보.

Soft delete:
No. 약관 동의 이력은 법적/운영 이력이므로 삭제하지 않는다. 사용자 삭제 시에도
user FK는 보존하되, 사용자 개인정보는 users/user_profiles/auth_identities의
익명화 정책을 따른다.

API read/write impact:
Read = 회원가입 gate에서 필수 약관 동의 여부 확인, 설정 약관 동의 이력 조회,
  관리자 사용자 상세의 약관 동의 상태 조회
Write = 회원가입/재동의 시 동의 기록 생성 또는 갱신, 선택 약관 철회,
  마케팅 수신 동의 변경

Open questions:
없음
```

#### `sports`

- [x] 목적 확정
- [x] 연결 화면 확정
- [x] 컬럼 확정
- [x] nullable/default 확정
- [x] PK/FK 확정
- [x] unique/index 확정
- [x] status enum 필요 여부 및 값 확정
- [x] lifecycle 필요 여부 및 전이 확정
- [x] owner/permission 확정
- [x] soft delete 여부 확정
- [x] audit 필요 여부 확정
- [x] API read/write 영향 확인
- [x] open question 없음

```text
Purpose:
서비스 전체에서 사용하는 종목 master를 관리한다. 온보딩 종목 선택, 사용자 선호 종목,
개인 매치, 팀, 팀매치가 같은 종목 기준을 참조한다. 종목은 코드 enum으로 고정하지 않고
DB master row로 둔다.

Screens:
01 온보딩 종목 선택
02 홈 추천/필터
03 개인 매치 목록/상세/생성
04 팀매치 목록/상세/생성
05 팀 목록/상세/생성
07 마이 운동 정보
12 관리자 master data 관리 후보

Columns:
id uuid pk
code string not null
name string not null
display_order int not null default 0
is_active boolean not null default true
created_at timestamptz not null default now()
updated_at timestamptz not null default now()

Initial active seed:
football = 축구
futsal = 풋살
basketball = 농구
baseball = 야구
badminton = 배드민턴
tennis = 테니스
running = 러닝/조깅

Status:
별도 status enum은 두지 않는다. 노출/사용 가능 여부는 `is_active`로 표현한다.

Lifecycle:
created active
active -> inactive
inactive -> active

이미 참조된 종목은 삭제하지 않는다. 더 이상 신규 선택을 받지 않을 때는
`is_active = false`로 비활성화한다.

Permissions:
public/user = active 종목 목록 조회
system = seed/bootstrap 시 생성 또는 갱신
admin = 종목 추가, 이름/정렬 변경, 활성/비활성 전환 후보

Indexes:
PK = id
unique = code
index = is_active
index = display_order

Audit:
일반 seed/bootstrap 갱신은 audit 필수 아님.
admin이 종목 추가, 이름 변경, 활성/비활성 전환을 수행하면 admin_action_logs 후보.
활성/비활성 전환은 status_change_logs 후보.

Soft delete:
No. 참조 무결성을 위해 삭제하지 않고 `is_active`로 관리한다.

API read/write impact:
Read = 온보딩/필터/생성 폼 종목 목록, 매치/팀/팀매치 카드와 상세의 종목 표시
Write = seed/bootstrap master data 동기화, 관리자 master data 변경 후보

Open questions:
없음
```

#### `sport_levels`

- [x] 목적 확정
- [x] 연결 화면 확정
- [x] 컬럼 확정
- [x] nullable/default 확정
- [x] PK/FK 확정
- [x] unique/index 확정
- [x] status enum 필요 여부 및 값 확정
- [x] lifecycle 필요 여부 및 전이 확정
- [x] owner/permission 확정
- [x] soft delete 여부 확정
- [x] audit 필요 여부 확정
- [x] API read/write 영향 확인
- [x] open question 없음

```text
Purpose:
종목별 사용자 실력 선택지를 관리한다. 온보딩과 사용자 선호 종목에서 선택한 실력은
`sport_levels`를 기준으로 저장한다. 기본 체계는 5단계로 시작하되, 테이블은 종목별 row로
두어 나중에 종목별 표시명과 설명을 다르게 운영할 수 있게 한다.

Screens:
01 온보딩 실력 선택
03 개인 매치 필터/생성/상세
04 팀매치 필터/생성/상세
05 팀 생성/프로필
07 마이 운동 정보
12 관리자 master data 관리 후보

Columns:
id uuid pk
sport_id uuid not null fk sports.id
code string not null
label string not null
description string nullable
rank_order int not null
is_active boolean not null default true
created_at timestamptz not null default now()
updated_at timestamptz not null default now()

Default 5-level seed per active sport:
level_1 = 입문
level_2 = 초급
level_3 = 중급
level_4 = 상급
level_5 = 최상급

Status:
별도 status enum은 두지 않는다. 노출/선택 가능 여부는 `is_active`로 표현한다.

Lifecycle:
created active
active -> inactive
inactive -> active

이미 사용자 선호나 매치 조건에서 참조된 level은 삭제하지 않는다. 더 이상 신규 선택을
받지 않을 때는 `is_active = false`로 비활성화한다.

Permissions:
public/user = active 종목의 active level 목록 조회
system = seed/bootstrap 시 생성 또는 갱신
admin = level 추가, label/description/rank_order 변경, 활성/비활성 전환 후보

Indexes:
PK = id
FK = sport_id -> sports.id
unique = (sport_id, code)
unique 후보 = (sport_id, rank_order)
index = sport_id
index = is_active
index = rank_order

Audit:
일반 seed/bootstrap 갱신은 audit 필수 아님.
admin이 level 추가, 표시명/설명/정렬 변경, 활성/비활성 전환을 수행하면
admin_action_logs 후보.
활성/비활성 전환은 status_change_logs 후보.

Soft delete:
No. 참조 무결성을 위해 삭제하지 않고 `is_active`로 관리한다.

API read/write impact:
Read = 온보딩 실력 선택지, 매치/팀/팀매치 필터와 생성 폼, 사용자 운동 정보 표시
Write = seed/bootstrap master data 동기화, 관리자 master data 변경 후보

Open questions:
없음
```

#### `regions`

- [x] 목적 확정
- [x] 연결 화면 확정
- [x] 컬럼 확정
- [x] nullable/default 확정
- [x] PK/FK 확정
- [x] unique/index 확정
- [x] status enum 필요 여부 및 값 확정
- [x] lifecycle 필요 여부 및 전이 확정
- [x] owner/permission 확정
- [x] soft delete 여부 확정
- [x] audit 필요 여부 확정
- [x] API read/write 영향 확인
- [x] open question 없음

```text
Purpose:
서비스 전체에서 사용하는 활동 지역 master를 관리한다. 온보딩 지역 선택, 사용자 활동 지역,
개인 매치/팀/팀매치 필터와 생성 폼이 같은 지역 기준을 참조한다. v1 지역 depth는
시/도 -> 시/군/구 2단계 행정구역으로 고정한다.

Screens:
01 온보딩 지역 선택
02 홈 추천/지역 필터
03 개인 매치 목록/생성/상세
04 팀매치 목록/생성/상세
05 팀 목록/생성/상세
07 마이 활동 지역
12 관리자 master data 관리 후보

Columns:
id uuid pk
parent_id uuid nullable fk regions.id
code string not null
name string not null
region_type enum not null
display_order int not null default 0
is_active boolean not null default true
created_at timestamptz not null default now()
updated_at timestamptz not null default now()

Status:
region_type = province | district
별도 status enum은 두지 않는다. 노출/선택 가능 여부는 `is_active`로 표현한다.

Virtual region policy:
`내 주변`, `온라인`, `직접 입력 장소` 같은 가상 지역은 `regions`에 넣지 않는다.
내 주변은 위치 기반 검색 옵션이고, 직접 입력 장소는 매치/팀매치의 장소 필드 책임이다.

Lifecycle:
created active
active -> inactive
inactive -> active

이미 사용자 선호나 매치/팀에서 참조된 지역은 삭제하지 않는다. 더 이상 신규 선택을
받지 않을 때는 `is_active = false`로 비활성화한다.

Permissions:
public/user = active 지역 목록 조회
system = seed/bootstrap 시 생성 또는 갱신
admin = 지역 추가, 이름/정렬 변경, 활성/비활성 전환 후보

Indexes:
PK = id
FK = parent_id -> regions.id
unique = code
unique 후보 = (parent_id, name)
index = parent_id
index = region_type
index = is_active
index = display_order

Audit:
일반 seed/bootstrap 갱신은 audit 필수 아님.
admin이 지역 추가, 이름/정렬 변경, 활성/비활성 전환을 수행하면 admin_action_logs 후보.
활성/비활성 전환은 status_change_logs 후보.

Soft delete:
No. 참조 무결성을 위해 삭제하지 않고 `is_active`로 관리한다.

API read/write impact:
Read = 온보딩 지역 선택지, 홈/매치/팀/팀매치 필터, 사용자 활동 지역 표시
Write = seed/bootstrap master data 동기화, 관리자 master data 변경 후보

Open questions:
없음
```

### 5.3 User Preference/Home

#### `user_sport_preferences`

- [x] 목적 확정
- [x] 연결 화면 확정
- [x] 컬럼 확정
- [x] nullable/default 확정
- [x] PK/FK 확정
- [x] unique/index 확정
- [x] status enum 필요 여부 및 값 확정
- [x] lifecycle 필요 여부 및 전이 확정
- [x] owner/permission 확정
- [x] soft delete 여부 확정
- [x] audit 필요 여부 확정
- [x] API read/write 영향 확인
- [x] open question 없음

```text
Purpose:
사용자의 관심 종목과 종목별 실력 선호를 관리한다. 온보딩 완료 시 draft 선택값이
이 테이블에 확정 저장되고, 홈 추천/매치 필터/프로필 표시에서 사용한다.

Screens:
01 온보딩 종목/실력 선택
02 홈 추천
03 개인 매치 추천/필터
04 팀매치 추천/필터
05 팀 추천/가입 맥락
07 마이 운동 정보
10 공개 프로필 후보

Columns:
id uuid pk
user_id uuid not null fk users.id
sport_id uuid not null fk sports.id
sport_level_id uuid not null fk sport_levels.id
is_primary boolean not null default false
display_order int not null default 0
created_at timestamptz not null default now()
updated_at timestamptz not null default now()

Status:
별도 status enum은 두지 않는다. 사용자가 삭제한 선호는 row 삭제로 처리한다.

Lifecycle:
none -> created
created -> updated
created -> deleted

온보딩 진행 중에는 `user_onboarding_progress`에 draft로 저장하고, 온보딩 완료 시
`user_sport_preferences`에 확정 반영한다. 설정/마이에서 운동 정보를 바꾸면 이 테이블을
갱신한다.

Permissions:
user = 자기 종목/실력 선호 조회, 생성, 수정, 삭제
system = 온보딩 완료 시 draft를 확정 선호로 반영
admin = 일반 수정 없음. 운영 목적 조회 정도만 가능

Indexes:
PK = id
FK = user_id -> users.id
FK = sport_id -> sports.id
FK = sport_level_id -> sport_levels.id
unique = (user_id, sport_id)
index = user_id
index = sport_id
index = sport_level_id
index = is_primary
index = display_order

Validation:
`sport_level_id`는 같은 `sport_id`에 속한 level이어야 한다. 이 검증은 DB composite FK
또는 service validation으로 보강한다.

Audit:
일반 선호 수정은 audit 필수 아님.
온보딩 완료 시 확정 반영, 운영 보정이 필요한 경우 status_change_logs 후보.

Soft delete:
No. 선호 삭제는 row 삭제로 충분하다. 과거 매치/팀 기록은 각 도메인 row에 저장된
sport FK를 기준으로 보존한다.

API read/write impact:
Read = 내 운동 정보, 홈/매치/팀 추천 조건, 공개 프로필 운동 정보 후보
Write = 온보딩 완료 시 생성/갱신, 마이/설정에서 운동 정보 수정

Open questions:
없음
```

#### `user_regions`

- [x] 목적 확정
- [x] 연결 화면 확정
- [x] 컬럼 확정
- [x] nullable/default 확정
- [x] PK/FK 확정
- [x] unique/index 확정
- [x] status enum 필요 여부 및 값 확정
- [x] lifecycle 필요 여부 및 전이 확정
- [x] owner/permission 확정
- [x] soft delete 여부 확정
- [x] audit 필요 여부 확정
- [x] API read/write 영향 확인
- [x] open question 없음

```text
Purpose:
사용자의 활동 지역 선호를 관리한다. 온보딩 또는 설정에서 사용자가 명시적으로 선택한
지역만 저장한다. 현재 위치나 `내 주변` 검색 상태는 활동 지역 선호가 아니므로 자동 저장하지
않는다.

Screens:
01 온보딩 지역 선택
02 홈 추천
03 개인 매치 추천/필터
04 팀매치 추천/필터
05 팀 추천/가입 맥락
07 마이 활동 지역
10 공개 프로필 후보

Columns:
id uuid pk
user_id uuid not null fk users.id
region_id uuid not null fk regions.id
is_primary boolean not null default false
source enum not null default onboarding
display_order int not null default 0
created_at timestamptz not null default now()
updated_at timestamptz not null default now()

Status:
source = onboarding | settings | admin_import
별도 status enum은 두지 않는다. 사용자가 삭제한 활동 지역은 row 삭제로 처리한다.

Lifecycle:
none -> created
created -> updated
created -> deleted

사용자는 활동 지역을 0개 이상 가질 수 있다. 지역을 하나도 선택하지 않아도 온보딩과
서비스 이용을 허용한다. 활동 지역이 없으면 홈/매치 추천은 전체/인기/최근 기준으로
fallback한다.

지역이 1개 이상 있더라도 primary는 optional이다. 단, `is_primary = true`인 row는
사용자당 최대 1개만 허용한다.

Location policy:
위치 권한 기반 현재 위치는 `user_regions`에 자동 저장하지 않는다. 현재 위치는 `내 주변`
검색/추천 옵션에만 사용하고, 활동 지역 저장은 사용자의 명시적 선택이 있을 때만 수행한다.

Permissions:
user = 자기 활동 지역 조회, 생성, 수정, 삭제, primary 변경
system = 온보딩 완료 시 draft 지역을 확정 선호로 반영
admin = 일반 수정 없음. 운영 목적 조회 정도만 가능

Indexes:
PK = id
FK = user_id -> users.id
FK = region_id -> regions.id
unique = (user_id, region_id)
partial unique 후보 = user_id where is_primary = true
index = user_id
index = region_id
index = is_primary
index = source
index = display_order

Validation:
권장 선택 단위는 district, 즉 시/군/구다. province만 선택하는 흐름이 필요하면
service validation에서 허용 범위를 명시한다.

Audit:
일반 활동 지역 수정은 audit 필수 아님.
온보딩 완료 시 확정 반영, 운영 보정이 필요한 경우 status_change_logs 후보.

Soft delete:
No. 선호 삭제는 row 삭제로 충분하다. 과거 매치/팀 기록은 각 도메인 row에 저장된
region 또는 장소 정보를 기준으로 보존한다.

API read/write impact:
Read = 내 활동 지역, 홈/매치/팀 추천 조건, 공개 프로필 활동 지역 후보
Write = 온보딩 완료 시 생성/갱신, 마이/설정에서 활동 지역 수정, primary 변경

Open questions:
없음
```

#### `notices`

- [x] 목적 확정
- [x] 연결 화면 확정
- [x] 컬럼 확정
- [x] nullable/default 확정
- [x] PK/FK 확정
- [x] unique/index 확정
- [x] status enum 필요 여부 및 값 확정
- [x] lifecycle 필요 여부 및 전이 확정
- [x] owner/permission 확정
- [x] soft delete 여부 확정
- [x] audit 필요 여부 확정
- [x] API read/write 영향 확인
- [x] open question 없음

```text
Purpose:
서비스 공지, 점검, 정책 변경, 이벤트 안내를 관리한다. 공지는 로그인 사용자뿐 아니라
비로그인 사용자에게도 노출될 수 있다. v1에서는 사용자별 읽음 상태를 DB에 저장하지 않고,
사이트 전체 공지를 노출하고 확인할 수 있는 수준으로 둔다.

Screens:
00 public marketing/info pages 공지 후보
01 로그인/온보딩 전후 공지 후보
02 홈 공지/알림 영역
07 마이/공지 목록 후보
09 설정/공지/약관 후보
12 관리자 공지 관리

Columns:
id uuid pk
title string not null
body text not null
audience enum not null default users
status enum not null default draft
priority int not null default 0
starts_at timestamptz nullable
ends_at timestamptz nullable
published_at timestamptz nullable
archived_at timestamptz nullable
created_by uuid nullable fk admin_users.user_id
updated_by uuid nullable fk admin_users.user_id
created_at timestamptz not null default now()
updated_at timestamptz not null default now()

Status:
audience = public | users | admins
status = draft | scheduled | published | archived

Lifecycle:
draft -> scheduled
draft -> published
scheduled -> published
published -> archived
scheduled -> archived
draft -> archived

삭제는 사용하지 않는다. 노출이 끝난 공지는 archived로 보존한다.

Visibility policy:
public = 비로그인/로그인 모두 조회 가능
users = 로그인 사용자만 조회 가능
admins = 관리자 shell에서만 조회 가능

published 공지라도 `starts_at`이 미래이거나 `ends_at`이 지난 경우 일반 노출에서 제외한다.

Permissions:
public = audience public + currently visible published notice 조회
user = audience public/users + currently visible published notice 조회
admin = 공지 생성, 수정, 예약, 게시, 보관, 관리자 대상 공지 조회
system = 예약 시각 도달 시 scheduled -> published 전환 후보

Indexes:
PK = id
FK = created_by -> admin_users.user_id
FK = updated_by -> admin_users.user_id
index = audience
index = status
index = priority
index = starts_at
index = ends_at
index = published_at
index = archived_at

Audit:
admin_action_logs = 공지 생성, 수정, 예약, 게시, 보관
status_change_logs = scheduled/published/archived 상태 전환

Soft delete:
No. 공지는 운영 이력이므로 삭제하지 않고 archived를 사용한다.

API read/write impact:
Read = public 공지 조회, 홈 공지 목록, 설정/마이 공지 목록, 관리자 공지 목록/상세
Write = 관리자 공지 생성/수정, 예약, 게시, 보관, 예약 게시 system 전환

Open questions:
없음
```

#### `user_reputation_summaries`

- [x] 목적 확정
- [x] 연결 화면 확정
- [x] 컬럼 확정
- [x] nullable/default 확정
- [x] PK/FK 확정
- [x] unique/index 확정
- [x] status enum 필요 여부 및 값 확정
- [x] lifecycle 필요 여부 및 전이 확정
- [x] owner/permission 확정
- [x] soft delete 여부 확정
- [x] audit 필요 여부 확정
- [x] API read/write 영향 확인
- [x] open question 없음

```text
Purpose:
사용자 카드/프로필에 표시되는 평판 요약을 관리한다. `user_profiles`는 노출 프로필
기본 정보만 담당하고, 매너 점수, 후기 수, 신뢰 라벨 같은 의사결정 신호는
`user_reputation_summaries`에서 관리한다.

Screens:
02 홈 추천 카드 후보
03 개인 매치 host/participant profile
04 팀매치 신청자/참여자 profile 후보
05 팀 멤버/가입 신청자 profile
06 채팅 참여자 profile 후보
07 마이/프로필/평판
10 공개 프로필
12 관리자 사용자 상세

Columns:
user_id uuid pk fk users.id
manner_score decimal nullable
review_count int not null default 0
completed_match_count int not null default 0
no_show_count int not null default 0
trust_label string nullable
trust_state enum not null default unavailable
calculated_at timestamptz nullable
created_at timestamptz not null default now()
updated_at timestamptz not null default now()

Status:
trust_state = verified | estimated | sample | unavailable

verified = 실제 리뷰/참여 데이터 기준으로 산출됨
estimated = 일부 데이터 또는 임시 산식으로 추정됨
sample = mock/sample 데이터이며 실제 신뢰 신호가 아님
unavailable = 표시 가능한 평판 데이터가 없음

Lifecycle:
none -> unavailable
unavailable -> sample
unavailable -> estimated
estimated -> verified
sample -> estimated
sample -> verified
any -> unavailable

평판 원천 이벤트가 바뀌면 summary를 재계산한다. 정확한 산식과 재계산 트리거는
리뷰/매치 완료/노쇼 도메인 확정 후 구현 단계에서 고정한다.

Permissions:
public/related user = 공개 범위와 화면 맥락에 따라 제한된 평판 요약 조회
user = 자기 평판 요약 조회
system = 원천 이벤트 기반 재계산
admin = 운영 목적 조회, 부정확한 평판 보정 후보

Indexes:
PK = user_id
FK = user_id -> users.id
index = trust_state
index = manner_score
index = review_count
index = completed_match_count
index = calculated_at

Audit:
system 재계산은 audit 필수 아님.
admin이 평판 값을 직접 보정하거나 숨김 처리하는 경우 admin_action_logs 후보.
trust_state 변경은 status_change_logs 후보.

Soft delete:
No. 사용자 삭제는 `users` 계정 삭제/익명화 정책을 따른다. 삭제된 사용자의 평판 요약은
노출하지 않거나 unavailable로 전환한다.

API read/write impact:
Read = 홈/매치/팀/채팅/공개 프로필의 사용자 신뢰 신호 표시, 관리자 사용자 상세
Write = 리뷰/매치 완료/노쇼 등 원천 이벤트 변경 시 system 재계산,
  관리자 보정 후보

Open questions:
없음
```

### 5.4 Personal Match

#### `matches`

- [x] 목적 확정
- [x] 연결 화면 확정
- [x] 컬럼 확정
- [x] nullable/default 확정
- [x] PK/FK 확정
- [x] unique/index 확정
- [x] status enum 필요 여부 및 값 확정
- [x] lifecycle 필요 여부 및 전이 확정
- [x] owner/permission 확정
- [x] soft delete 여부 확정
- [x] audit 필요 여부 확정
- [x] API read/write 영향 확인
- [x] open question 없음

```text
Purpose:
개인 매치 모집글의 기본 정보를 관리한다. 호스트가 모집글을 만들고, 참여 희망자는
`match_applications`로 신청한다. v1 개인 매치는 결제를 제외하고, 모든 신청은 호스트
승인 후 참여 확정되는 구조로 둔다.

Screens:
03 개인 매치 목록
03 개인 매치 상세
03 개인 매치 생성/수정
03 개인 매치 신청/관리
07 마이 매치/내가 만든 매치 후보
12 관리자 매치 관리 후보

Columns:
id uuid pk
host_user_id uuid not null fk users.id
sport_id uuid not null fk sports.id
region_id uuid nullable fk regions.id
title string not null
description text nullable
image_url string nullable
starts_at timestamptz not null
ends_at timestamptz nullable
deadline_at timestamptz nullable
capacity int not null
manual_place_name string not null
address_text string nullable
rules_text text nullable
status enum not null default draft
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
deleted_at timestamptz nullable

Excluded from v1:
venue_id = v1에서는 시설 FK 없이 직접 입력 장소로 시작한다.
match_media = v1에서는 `matches.image_url` 대표 이미지 1장만 사용한다. 다중 이미지/갤러리,
  업로드 처리 상태, 이미지 검수는 추후 별도 설계한다.
fee_amount/payment_required/payment_id = v1 개인 매치 결제 제외. 추후 유료 기능 도입 시
  payments 도메인과 함께 재검토한다.
approval_policy = v1은 항상 host_approval이므로 컬럼으로 두지 않는다.

Status:
status = draft | recruiting | closed | cancelled | completed | expired

Derived display states:
full = confirmed participant count >= capacity
deadline_soon = deadline_at 임박

`full`, `deadline_soon`은 DB status로 저장하지 않고 조회/응답 단계에서 계산한다.

Lifecycle:
draft -> recruiting
recruiting -> closed
recruiting -> cancelled
recruiting -> expired
closed -> completed
closed -> cancelled
expired -> closed 후보 없음
cancelled/completed -> terminal

참가 신청은 항상 `match_applications`에서 requested 상태로 시작하고, 호스트 승인 후
`match_participants`가 생성된다. 신청 즉시 자동 확정은 v1에서 지원하지 않는다.

Permissions:
host = 자기 매치 생성/수정/모집 시작/마감/취소/완료 처리, 신청 승인/거절
user = 공개/모집 중 매치 조회, 참가 신청
participant = 참여 확정된 매치 상세 조회
admin = 운영 목적 조회, 부적절한 매치 조치 후보
system = deadline 만료 시 expired 전환 후보

Indexes:
PK = id
FK = host_user_id -> users.id
FK = sport_id -> sports.id
FK = region_id -> regions.id
index = host_user_id
index = sport_id
index = region_id
index = status
index = starts_at
index = deadline_at
index = deleted_at

Audit:
status_change_logs = recruiting/closed/cancelled/completed/expired 전환
admin_action_logs = admin에 의한 숨김/취소/복구 등 운영 조치 후보
일반 내용 수정 이력은 v1 필수 아님.

Soft delete:
Yes. `deleted_at` 사용. 호스트가 삭제한 모집글은 일반 목록에서 제외하되, 신청/참여/audit
관계 보존을 위해 물리 삭제하지 않는다.

API read/write impact:
Read = 개인 매치 목록/상세, 홈 추천 후보, 마이 매치, 관리자 매치 조회
Write = 매치 생성/수정, 모집 시작, 마감, 취소, 완료, deadline 만료 처리,
  관리자 조치 후보

Open questions:
없음
```

#### `match_applications`

- [x] 목적 확정
- [x] 연결 화면 확정
- [x] 컬럼 확정
- [x] nullable/default 확정
- [x] PK/FK 확정
- [x] unique/index 확정
- [x] status enum 필요 여부 및 값 확정
- [x] lifecycle 필요 여부 및 전이 확정
- [x] owner/permission 확정
- [x] soft delete 여부 확정
- [x] audit 필요 여부 확정
- [x] API read/write 영향 확인
- [x] open question 없음

```text
Purpose:
개인 매치 참가 신청과 호스트 심사 이력을 관리한다. v1 개인 매치는 항상 호스트 승인형이므로
참가 희망자는 먼저 신청 row를 만들고, 호스트가 승인하면 별도의 `match_participants` row가
생성된다.

Screens:
03 개인 매치 상세 신청 CTA
03 개인 매치 신청 상태
03 호스트 신청자 관리
07 마이 신청 내역 후보
12 관리자 매치 신청 조회 후보

Columns:
id uuid pk
match_id uuid not null fk matches.id
user_id uuid not null fk users.id
status enum not null default requested
message text nullable
approved_by uuid nullable fk users.id
approved_at timestamptz nullable
rejected_by uuid nullable fk users.id
rejected_at timestamptz nullable
rejected_reason text nullable
withdrawn_at timestamptz nullable
cancelled_at timestamptz nullable
expired_at timestamptz nullable
created_at timestamptz not null default now()
updated_at timestamptz not null default now()

Status:
status = requested | approved | rejected | withdrawn | cancelled_by_host | expired

payment_pending 같은 결제 상태는 v1 개인 매치에서 사용하지 않는다.

Lifecycle:
none -> requested
requested -> approved
requested -> rejected
requested -> withdrawn
requested -> cancelled_by_host
requested -> expired

approved/rejected/withdrawn/cancelled_by_host/expired는 terminal이다.

Approval effect:
신청이 승인되면 `match_applications.status = approved`로 남기고,
`match_participants` row를 별도로 생성한다. 신청 row는 심사 이력이고,
participant row는 확정 참가 상태다.

Duplicate policy:
같은 사용자는 같은 매치에 동시에 active 신청을 1개만 가질 수 있다.
`requested` 또는 `approved` 상태의 중복 신청은 허용하지 않는다. 과거에 withdrawn/rejected된
신청이 있는 사용자의 재신청 허용 여부는 service policy로 제어한다.

Permissions:
user = 모집 중인 매치에 신청, 자기 신청 조회, requested 상태 신청 철회
host = 자기 매치 신청 목록 조회, 신청 승인/거절, 호스트 사유로 취소
admin = 운영 목적 조회, 부적절한 신청 조치 후보
system = deadline 만료 시 requested 신청 expired 전환 후보

Indexes:
PK = id
FK = match_id -> matches.id
FK = user_id -> users.id
FK = approved_by -> users.id
FK = rejected_by -> users.id
index = match_id
index = user_id
index = status
index = approved_at
index = rejected_at
index = created_at
partial unique 후보 = (match_id, user_id) where status in (requested, approved)

Audit:
status_change_logs = requested -> approved/rejected/withdrawn/cancelled_by_host/expired 전환
admin_action_logs = admin에 의한 조치 후보

Soft delete:
No. 신청/심사 이력은 삭제하지 않는다. 사용자가 철회하면 withdrawn으로 남긴다.

API read/write impact:
Read = 내 신청 상태, 호스트 신청자 목록, 관리자 신청 조회 후보
Write = 참가 신청, 신청 철회, 호스트 승인/거절/취소, deadline 만료 처리,
  승인 시 match_participants 생성

Open questions:
없음
```

#### `match_participants`

- [x] 목적 확정
- [x] 연결 화면 확정
- [x] 컬럼 확정
- [x] nullable/default 확정
- [x] PK/FK 확정
- [x] unique/index 확정
- [x] status enum 필요 여부 및 값 확정
- [x] lifecycle 필요 여부 및 전이 확정
- [x] owner/permission 확정
- [x] soft delete 여부 확정
- [x] audit 필요 여부 확정
- [x] API read/write 영향 확인
- [x] open question 없음

```text
Purpose:
개인 매치의 확정 참가자를 관리한다. `match_applications`는 신청/심사 이력이고,
`match_participants`는 실제 참가 상태다. 호스트도 참가자 row로 포함해 참가자 목록,
정원 계산, 출석/노쇼/완료 처리를 같은 기준으로 다룬다.

Screens:
03 개인 매치 상세 참가자 목록
03 개인 매치 호스트 관리
03 체크인/출석/결과 후보
07 마이 참여 매치 후보
10 공개 프로필 참여 이력 후보
12 관리자 매치 참가자 조회 후보

Columns:
id uuid pk
match_id uuid not null fk matches.id
user_id uuid not null fk users.id
application_id uuid nullable fk match_applications.id
role enum not null default participant
status enum not null default confirmed
confirmed_at timestamptz not null default now()
cancelled_at timestamptz nullable
checked_in_at timestamptz nullable
completed_at timestamptz nullable
removed_at timestamptz nullable
created_at timestamptz not null default now()
updated_at timestamptz not null default now()

Status:
role = host | participant
status = confirmed | cancelled | checked_in | no_show | completed | removed

payment_id 같은 결제 연결은 v1 개인 매치에서 사용하지 않는다.

Lifecycle:
none -> confirmed
confirmed -> cancelled
confirmed -> checked_in
confirmed -> no_show
checked_in -> completed
confirmed -> completed
confirmed -> removed
checked_in -> removed

completed/no_show/cancelled/removed는 terminal이다.

Host participant policy:
매치 생성 시 host_user_id도 `role = host`, `status = confirmed` participant row로 생성한다.
호스트 participant row의 `application_id`는 null이다. 일반 참가자는 승인된
`match_applications.id`를 참조한다.

Permissions:
host = 자기 매치 참가자 목록 조회, 참가자 제외, 체크인/노쇼/완료 처리
participant = 자기 참가 상태 조회, 허용된 기간 내 참가 취소 후보
admin = 운영 목적 조회, 참가자 상태 보정 후보
system = 신청 승인 시 participant 생성, deadline/매치 종료 후 상태 보정 후보

Indexes:
PK = id
FK = match_id -> matches.id
FK = user_id -> users.id
FK = application_id -> match_applications.id
unique = (match_id, user_id)
unique 후보 = application_id where application_id is not null
index = match_id
index = user_id
index = role
index = status
index = confirmed_at
index = completed_at

Audit:
status_change_logs = confirmed/cancelled/checked_in/no_show/completed/removed 전환
admin_action_logs = admin에 의한 참가자 상태 보정 후보

Soft delete:
No. 참가 이력은 삭제하지 않고 status로 보존한다.

API read/write impact:
Read = 매치 참가자 목록, 내 참여 매치, 공개 프로필 참여 이력 후보, 관리자 참가자 조회
Write = 신청 승인 시 생성, 호스트 생성 시 host participant 생성, 체크인, 취소, 노쇼,
  완료, 제외 처리

Open questions:
없음
```

### 5.5 Team

#### `teams`

- [x] 목적 확정
- [x] 연결 화면 확정
- [x] 컬럼 확정
- [x] nullable/default 확정
- [x] PK/FK 확정
- [x] unique/index 확정
- [x] status enum 필요 여부 및 값 확정
- [x] lifecycle 필요 여부 및 전이 확정
- [x] owner/permission 확정
- [x] soft delete 여부 확정
- [x] audit 필요 여부 확정
- [x] API read/write 영향 확인
- [x] open question 없음

```text
Purpose:
서비스에서 지속적으로 존재하는 팀의 기본 엔티티를 관리한다. 개인 매치 내부의 임시 팀이
아니라, 사용자가 만들고 멤버가 가입하며 팀매치에 참여하는 service team이다.
팀 상세 소개 정보는 `team_profiles`, 소속/권한은 `team_memberships`가 담당한다.

Screens:
05 팀 목록
05 팀 상세
05 팀 생성/수정
05 내 팀
06 팀매치 생성/신청의 팀 선택
07 마이 팀 요약 후보
12 관리자 팀 관리 후보

Columns:
id uuid pk
owner_user_id uuid not null fk users.id
sport_id uuid not null fk sports.id
region_id uuid nullable fk regions.id
name string not null
status enum not null default active
visibility enum not null default public
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
deleted_at timestamptz nullable

Status:
status = active | hidden | suspended | deleted
visibility = public | private | invite_only

Lifecycle:
none -> active
active -> hidden
hidden -> active
active -> suspended
suspended -> active
active -> deleted
hidden -> deleted
suspended -> deleted

deleted는 terminal이다. 팀 삭제는 `status = deleted`, `deleted_at`으로 표현한다.

Owner policy:
`teams.owner_user_id`와 `team_memberships.role = owner`를 함께 둔다.
`owner_user_id`는 빠른 조회와 대표 책임자 표시용이고, 실제 권한과 소속은
`team_memberships`가 담당한다.

v1에서는 owner 1명을 기본으로 시작한다. `teams.owner_user_id`는 active owner membership을
가진 user여야 한다. 팀에는 active owner가 최소 1명 있어야 한다.

Permissions:
owner = 팀 생성/수정/삭제, 소유권 관리, manager/member 관리, 가입 신청 승인/거절
manager = 팀 프로필 수정 후보, 멤버 관리 일부, 가입 신청 승인/거절 후보
member = 팀 내부 정보 조회, 탈퇴
public/user = visibility와 status에 따라 팀 목록/상세 조회
admin = 팀 숨김/정지/복구/삭제 상태 조치 후보

Indexes:
PK = id
FK = owner_user_id -> users.id
FK = sport_id -> sports.id
FK = region_id -> regions.id
index = owner_user_id
index = sport_id
index = region_id
index = status
index = visibility
index = deleted_at
index = name

`name`은 unique로 두지 않는다. 동명 팀을 허용한다.

Audit:
status_change_logs = hidden/suspended/active/deleted 상태 전환
admin_action_logs = admin에 의한 숨김/정지/복구/삭제 조치
owner 변경은 status_change_logs 또는 별도 ownership event 후보.

Soft delete:
Yes. `deleted_at` 사용. 팀매치, 멤버십, 신청, 채팅, 후기 등 과거 관계 보존을 위해 물리
삭제하지 않는다.

API read/write impact:
Read = 팀 목록/상세, 내 팀, 팀매치 생성/신청의 팀 선택, 관리자 팀 조회
Write = 팀 생성/수정, visibility 변경, 삭제, 관리자 숨김/정지/복구/삭제 조치,
  owner 변경 후보

Open questions:
없음
```

#### `team_profiles`

- [x] 목적 확정
- [x] 연결 화면 확정
- [x] 컬럼 확정
- [x] nullable/default 확정
- [x] PK/FK 확정
- [x] unique/index 확정
- [x] status enum 필요 여부 및 값 확정
- [x] lifecycle 필요 여부 및 전이 확정
- [x] owner/permission 확정
- [x] soft delete 여부 확정
- [x] audit 필요 여부 확정
- [x] API read/write 영향 확인
- [x] open question 없음

```text
Purpose:
팀 상세 화면과 카드에 표시되는 소개/운영 정보를 관리한다. `teams`는 식별자, 소유자,
종목, 대표 지역, 상태를 담당하고, `team_profiles`는 로고/커버/소개/가입 정책 같은
프로필성 정보를 담당한다. 팀 신뢰 점수는 `team_trust_scores`로 분리한다.

Screens:
05 팀 목록 카드
05 팀 상세
05 팀 생성/수정
05 내 팀 관리
06 팀매치 팀 정보 표시
12 관리자 팀 상세 후보

Columns:
team_id uuid pk fk teams.id
logo_url string nullable
cover_image_url string nullable
introduction text nullable
activity_area_text string nullable
skill_level_text string nullable
join_policy enum not null default approval_required
member_goal_count int nullable
founded_at date nullable
created_at timestamptz not null default now()
updated_at timestamptz not null default now()

Excluded from v1:
activity_regions jsonb/uuid[] = 대표 지역은 `teams.region_id`가 담당한다.
team_regions = 다중 활동 지역 검색/필터가 필요해지면 별도 조인 테이블로 설계한다.
trust_label/trust_score = `team_trust_scores`에서 관리한다.

Status:
join_policy = approval_required | closed

별도 profile status enum은 두지 않는다. 팀 노출/삭제/정지는 `teams.status`와
`teams.visibility`를 따른다.

Lifecycle:
teams 생성 후 team_profiles 생성
profile 수정
teams deleted 전환 시 일반 노출 중단

Permissions:
owner = 팀 프로필 생성/수정
manager = 팀 프로필 수정 후보
member = 내부 조회
public/user = teams.status/visibility에 따라 제한된 프로필 조회
admin = 운영 목적 조회, 부적절한 프로필 이미지/소개 조치 후보

Indexes:
PK = team_id
FK = team_id -> teams.id
index = join_policy

프로필 텍스트 검색이 필요하면 추후 full-text index 후보로 검토한다.

Audit:
일반 프로필 수정 이력은 v1 필수 아님.
admin이 로고/커버/소개를 조치하는 경우 admin_action_logs 후보.
join_policy 변경은 status_change_logs 후보.

Soft delete:
No. 팀 삭제/비노출은 `teams.status`, `teams.deleted_at`을 따른다.

API read/write impact:
Read = 팀 목록 카드, 팀 상세, 팀매치 팀 정보 표시, 관리자 팀 상세 후보
Write = 팀 생성 시 profile 생성, 팀 프로필 수정, 가입 정책 변경, 관리자 프로필 조치 후보

Open questions:
없음
```

#### `team_memberships`

- [x] 목적 확정
- [x] 연결 화면 확정
- [x] 컬럼 확정
- [x] nullable/default 확정
- [x] PK/FK 확정
- [x] unique/index 확정
- [x] status enum 필요 여부 및 값 확정
- [x] lifecycle 필요 여부 및 전이 확정
- [x] owner/permission 확정
- [x] soft delete 여부 확정
- [x] audit 필요 여부 확정
- [x] API read/write 영향 확인
- [x] open question 없음

```text
Purpose:
팀의 실제 소속과 권한을 관리한다. `teams.owner_user_id`는 대표 팀장 빠른 조회용이고,
팀 내부 권한 판단은 `team_memberships.role/status`를 기준으로 한다. 가입 신청/심사는
`team_join_applications`가 담당하고, 이 테이블은 실제 소속 이력만 담당한다.

Screens:
05 팀 상세 멤버 목록
05 내 팀
05 팀 멤버/권한 관리
05 팀 가입/탈퇴 후 상태
06 팀매치 생성/신청 권한 확인
07 마이 팀 요약 후보
12 관리자 팀 멤버십 조회 후보

Columns:
id uuid pk
team_id uuid not null fk teams.id
user_id uuid not null fk users.id
role enum not null default member
status enum not null default active
joined_at timestamptz not null default now()
left_at timestamptz nullable
removed_at timestamptz nullable
created_at timestamptz not null default now()
updated_at timestamptz not null default now()

Status:
role = owner | manager | member
status = active | left | removed

pending은 사용하지 않는다. 가입 대기/심사는 `team_join_applications`에서 관리한다.

Lifecycle:
none -> active
active -> left
active -> removed
left -> active 후보
removed -> active 후보

left/removed 후 재가입을 허용하면 기존 row를 active로 복구할지 새 row를 만들지는 구현 단계에서
정책화할 수 있다. v1 문서 기준으로는 `unique(team_id, user_id)`를 유지하고 재가입 시 기존 row
복구를 기본 후보로 본다.

Role policy:
팀에는 active owner가 정확히 1명 있어야 한다. owner는 팀장이다.
팀에는 active manager를 최대 5명까지 둘 수 있다.
active member 수에는 DB/제품 정책상 제한을 두지 않는다.

`teams.owner_user_id`는 active owner membership의 `user_id`와 일치해야 한다.

Permissions:
owner = 팀 전체 수정/삭제, owner 이관 후보, manager 지정/해제, member 제거, 가입 신청 처리
manager = 팀 프로필 수정 후보, member 관리 일부, 가입 신청 처리 후보
member = 팀 내부 정보 조회, 자기 탈퇴
admin = 운영 목적 조회, 멤버십 상태 보정 후보
system = 팀 생성 시 owner membership 생성, 가입 승인 시 member membership 생성

Indexes:
PK = id
FK = team_id -> teams.id
FK = user_id -> users.id
unique = (team_id, user_id)
partial unique 후보 = team_id where role = owner and status = active
index = team_id
index = user_id
index = role
index = status
index = joined_at

Manager max policy:
active manager 최대 5명 제한은 DB check보다 service validation으로 제어한다.

Audit:
status_change_logs = active/left/removed 전환, role 변경
admin_action_logs = admin에 의한 멤버십 보정 후보
owner/manager 권한 변경은 audit 대상이다.

Soft delete:
No. 멤버십 이력은 삭제하지 않고 status로 보존한다.

API read/write impact:
Read = 팀 멤버 목록, 내 팀 권한, 팀매치 생성/신청 권한 확인, 관리자 팀 멤버십 조회
Write = 팀 생성 시 owner membership 생성, 가입 승인 시 member 생성/복구,
  role 변경, 탈퇴, 강퇴, owner 이관 후보

Open questions:
없음
```

#### `team_join_applications`

- [x] 목적 확정
- [x] 연결 화면 확정
- [x] 컬럼 확정
- [x] nullable/default 확정
- [x] PK/FK 확정
- [x] unique/index 확정
- [x] status enum 필요 여부 및 값 확정
- [x] lifecycle 필요 여부 및 전이 확정
- [x] owner/permission 확정
- [x] soft delete 여부 확정
- [x] audit 필요 여부 확정
- [x] API read/write 영향 확인
- [x] open question 없음

```text
Purpose:
팀 가입 신청과 팀장/관리자의 심사 이력을 관리한다. v1 팀 가입은 항상 승인형이다.
open 즉시 가입은 지원하지 않는다. 신청이 승인되면 `team_memberships` row가 생성되거나
기존 left/removed row가 active로 복구된다.

Screens:
05 팀 상세 가입 신청
05 내 가입 신청 상태
05 팀장/관리자 가입 신청 관리
05 팀 멤버 관리
07 마이 팀 신청 내역 후보
12 관리자 팀 가입 신청 조회 후보

Columns:
id uuid pk
team_id uuid not null fk teams.id
user_id uuid not null fk users.id
status enum not null default requested
message text nullable
reviewed_by uuid nullable fk users.id
reviewed_at timestamptz nullable
rejected_reason text nullable
withdrawn_at timestamptz nullable
cancelled_at timestamptz nullable
expired_at timestamptz nullable
created_at timestamptz not null default now()
updated_at timestamptz not null default now()

Status:
status = requested | approved | rejected | withdrawn | cancelled_by_team | expired

pending은 사용하지 않는다. requested가 심사 대기 상태다.

Lifecycle:
none -> requested
requested -> approved
requested -> rejected
requested -> withdrawn
requested -> cancelled_by_team
requested -> expired

approved/rejected/withdrawn/cancelled_by_team/expired는 terminal이다.

Approval effect:
신청이 승인되면 `team_join_applications.status = approved`로 남기고,
`team_memberships` row를 생성하거나 기존 row를 active로 복구한다.

Join policy:
team_profiles.join_policy = approval_required이면 가입 신청 가능.
team_profiles.join_policy = closed이면 가입 신청 불가.
open 즉시 가입은 v1에서 지원하지 않는다.

Duplicate policy:
같은 사용자는 같은 팀에 동시에 active 신청을 1개만 가질 수 있다.
`requested` 상태 중복 신청은 허용하지 않는다. 이미 active membership이 있으면 신청할 수 없다.

Permissions:
user = 가입 신청, 자기 신청 조회, requested 상태 신청 철회
owner = 가입 신청 목록 조회, 승인/거절/취소
manager = 가입 신청 목록 조회, 승인/거절/취소 후보
admin = 운영 목적 조회, 가입 신청 상태 보정 후보
system = 만료 정책이 있으면 requested 신청 expired 전환 후보

Indexes:
PK = id
FK = team_id -> teams.id
FK = user_id -> users.id
FK = reviewed_by -> users.id
index = team_id
index = user_id
index = status
index = reviewed_at
index = created_at
partial unique 후보 = (team_id, user_id) where status = requested

Audit:
status_change_logs = requested -> approved/rejected/withdrawn/cancelled_by_team/expired 전환
admin_action_logs = admin에 의한 보정 후보

Soft delete:
No. 가입 신청/심사 이력은 삭제하지 않고 status로 보존한다.

API read/write impact:
Read = 내 가입 신청 상태, 팀장/관리자 신청 목록, 관리자 신청 조회 후보
Write = 가입 신청, 신청 철회, 팀장/관리자 승인/거절/취소,
  승인 시 team_memberships 생성/복구

Open questions:
없음
```

#### `team_trust_scores`

- [x] 목적 확정
- [x] 연결 화면 확정
- [x] 컬럼 확정
- [x] nullable/default 확정
- [x] PK/FK 확정
- [x] unique/index 확정
- [x] status enum 필요 여부 및 값 확정
- [x] lifecycle 필요 여부 및 전이 확정
- [x] owner/permission 확정
- [x] soft delete 여부 확정
- [x] audit 필요 여부 확정
- [x] API read/write 영향 확인
- [x] open question 없음

```text
Purpose:
팀 목록/상세/팀매치 신청 화면에 표시되는 팀 단위 신뢰/평판 요약을 관리한다.
팀 소개 정보는 `team_profiles`가 담당하고, 완료 팀매치 수, 취소/노쇼 성격의 지표,
후기 수, 신뢰 라벨 같은 의사결정 신호는 `team_trust_scores`가 담당한다.

Screens:
05 팀 목록 카드
05 팀 상세
06 팀매치 목록/상세/신청 팀 정보
07 마이 팀 요약 후보
12 관리자 팀 상세 후보

Columns:
team_id uuid pk fk teams.id
completed_team_match_count int not null default 0
cancelled_team_match_count int not null default 0
review_count int not null default 0
trust_label string nullable
trust_state enum not null default unavailable
calculated_at timestamptz nullable
created_at timestamptz not null default now()
updated_at timestamptz not null default now()

Status:
trust_state = verified | estimated | sample | unavailable

verified = 실제 팀매치/후기 데이터 기준으로 산출됨
estimated = 일부 데이터 또는 임시 산식으로 추정됨
sample = mock/sample 데이터이며 실제 신뢰 신호가 아님
unavailable = 표시 가능한 팀 신뢰 데이터가 없음

Lifecycle:
none -> unavailable
unavailable -> sample
unavailable -> estimated
estimated -> verified
sample -> estimated
sample -> verified
any -> unavailable

팀매치 완료, 취소, 후기 같은 원천 이벤트가 바뀌면 summary를 재계산한다. 정확한 산식과
재계산 트리거는 팀매치/후기 도메인 확정 후 구현 단계에서 고정한다.

Permissions:
public/user = teams.status/visibility와 화면 맥락에 따라 팀 신뢰 요약 조회
owner/manager = 자기 팀 신뢰 요약 조회
system = 원천 이벤트 기반 재계산
admin = 운영 목적 조회, 부정확한 신뢰 요약 보정 후보

Indexes:
PK = team_id
FK = team_id -> teams.id
index = trust_state
index = completed_team_match_count
index = review_count
index = calculated_at

Audit:
system 재계산은 audit 필수 아님.
admin이 신뢰 값을 직접 보정하거나 숨김 처리하는 경우 admin_action_logs 후보.
trust_state 변경은 status_change_logs 후보.

Soft delete:
No. 팀 삭제/비노출은 `teams.status`, `teams.deleted_at`을 따른다. 삭제된 팀의 신뢰 요약은
노출하지 않거나 unavailable로 전환한다.

API read/write impact:
Read = 팀 목록/상세, 팀매치 신청/상세의 팀 신뢰 신호, 관리자 팀 상세
Write = 팀매치 완료/취소/후기 등 원천 이벤트 변경 시 system 재계산,
  관리자 보정 후보

Open questions:
없음
```

### 5.6 Team Match

#### `team_matches`

- [x] 목적 확정
- [x] 연결 화면 확정
- [x] 컬럼 확정
- [x] nullable/default 확정
- [x] PK/FK 확정
- [x] unique/index 확정
- [x] status enum 필요 여부 및 값 확정
- [x] lifecycle 필요 여부 및 전이 확정
- [x] owner/permission 확정
- [x] soft delete 여부 확정
- [x] audit 필요 여부 확정
- [x] API read/write 영향 확인
- [x] open question 없음

```text
Purpose:
팀이 상대 팀을 모집하는 팀매치 모집글을 관리한다. 개인 매치와 달리 주체는 user가 아니라
host team이며, 상대 팀 신청은 `team_match_applications`가 담당한다. v1 팀매치는 결제를
제외하고 팀장/관리자 승인 기반 매칭에 집중한다.

Screens:
06 팀매치 목록
06 팀매치 상세
06 팀매치 생성/수정
06 팀매치 신청/관리
05 팀 상세의 팀매치 후보
07 마이/내 팀매치 후보
12 관리자 팀매치 관리 후보

Columns:
id uuid pk
host_team_id uuid not null fk teams.id
created_by uuid not null fk users.id
sport_id uuid not null fk sports.id
region_id uuid nullable fk regions.id
title string not null
description text nullable
image_url string nullable
starts_at timestamptz not null
ends_at timestamptz nullable
deadline_at timestamptz nullable
manual_place_name string not null
address_text string nullable
cost_note text nullable
rules_text text nullable
status enum not null default draft
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
deleted_at timestamptz nullable

Excluded from v1:
venue_id = v1에서는 시설 FK 없이 직접 입력 장소로 시작한다.
total_cost/opponent_cost/payment_id = v1 팀매치 결제 제외. 비용 안내가 필요하면
  `cost_note` 텍스트로만 표현한다.
team_match_styles = v1에서는 별도 테이블 없이 추후 `play_style_codes` 같은 단순 컬럼 후보로 검토한다.
team_match_invitations = 초대/공유 세부 흐름은 v1 이후 검토한다.

Status:
status = draft | recruiting | matched | closed | cancelled | completed | expired

Derived display states:
deadline_soon = deadline_at 임박

`deadline_soon`은 DB status로 저장하지 않고 조회/응답 단계에서 계산한다.

Lifecycle:
draft -> recruiting
recruiting -> matched
recruiting -> closed
recruiting -> cancelled
recruiting -> expired
matched -> completed
matched -> cancelled
closed -> cancelled
cancelled/completed/expired -> terminal

상대 팀 신청이 승인되면 `team_match_applications.status = approved`로 남기고,
`team_matches.status = matched`로 전환한다.

Permissions:
host team owner/manager = 팀매치 생성/수정/모집 시작/마감/취소/완료 처리, 상대 팀 신청 승인/거절
applicant team owner/manager = 팀매치 신청/철회
team member = 자기 팀 관련 팀매치 조회
public/user = 공개/모집 중 팀매치 조회
admin = 운영 목적 조회, 부적절한 팀매치 조치 후보
system = deadline 만료 시 expired 전환 후보

Indexes:
PK = id
FK = host_team_id -> teams.id
FK = created_by -> users.id
FK = sport_id -> sports.id
FK = region_id -> regions.id
index = host_team_id
index = created_by
index = sport_id
index = region_id
index = status
index = starts_at
index = deadline_at
index = deleted_at

Audit:
status_change_logs = recruiting/matched/closed/cancelled/completed/expired 전환
admin_action_logs = admin에 의한 숨김/취소/복구 등 운영 조치 후보
일반 내용 수정 이력은 v1 필수 아님.

Soft delete:
Yes. `deleted_at` 사용. 팀장/관리자가 삭제한 모집글은 일반 목록에서 제외하되,
신청/매칭/audit 관계 보존을 위해 물리 삭제하지 않는다.

API read/write impact:
Read = 팀매치 목록/상세, 팀 상세 팀매치 후보, 내 팀매치, 관리자 팀매치 조회
Write = 팀매치 생성/수정, 모집 시작, 마감, 취소, 완료, deadline 만료 처리,
  상대 팀 신청 승인 시 matched 전환, 관리자 조치 후보

Open questions:
없음
```

#### `team_match_applications`

- [x] 목적 확정
- [x] 연결 화면 확정
- [x] 컬럼 확정
- [x] nullable/default 확정
- [x] PK/FK 확정
- [x] unique/index 확정
- [x] status enum 필요 여부 및 값 확정
- [x] lifecycle 필요 여부 및 전이 확정
- [x] owner/permission 확정
- [x] soft delete 여부 확정
- [x] audit 필요 여부 확정
- [x] API read/write 영향 확인
- [x] open question 없음

```text
Purpose:
팀매치에 상대 팀으로 참여하려는 신청과 host team의 심사 이력을 관리한다.
v1 팀매치는 1:1 팀 대 팀 매칭이다. 한 `team_matches` row에는 승인된 상대 팀 신청이
최대 1개만 존재할 수 있다.

Screens:
06 팀매치 상세 신청 CTA
06 팀매치 신청 상태
06 host team 신청 팀 관리
06 applicant team 신청 내역 후보
07 마이/내 팀매치 후보
12 관리자 팀매치 신청 조회 후보

Columns:
id uuid pk
team_match_id uuid not null fk team_matches.id
applicant_team_id uuid not null fk teams.id
requested_by uuid not null fk users.id
status enum not null default requested
message text nullable
approved_by uuid nullable fk users.id
approved_at timestamptz nullable
rejected_by uuid nullable fk users.id
rejected_at timestamptz nullable
rejected_reason text nullable
withdrawn_at timestamptz nullable
cancelled_at timestamptz nullable
expired_at timestamptz nullable
created_at timestamptz not null default now()
updated_at timestamptz not null default now()

Status:
status = requested | approved | rejected | withdrawn | cancelled_by_host | expired

payment_pending 같은 결제 상태는 v1 팀매치에서 사용하지 않는다.

Lifecycle:
none -> requested
requested -> approved
requested -> rejected
requested -> withdrawn
requested -> cancelled_by_host
requested -> expired

approved/rejected/withdrawn/cancelled_by_host/expired는 terminal이다.

Approval effect:
신청이 승인되면 `team_match_applications.status = approved`로 남기고,
`team_matches.status = matched`로 전환한다. 동일 team_match의 다른 requested 신청은
host가 거절하거나 system이 만료/취소 처리하는 후보가 된다.

Match cardinality:
한 팀매치에는 approved application이 최대 1개만 존재할 수 있다.
`applicant_team_id`는 `team_matches.host_team_id`와 같을 수 없다.

Duplicate policy:
같은 applicant team은 같은 team_match에 동시에 active 신청을 1개만 가질 수 있다.
`requested` 또는 `approved` 상태의 중복 신청은 허용하지 않는다.

Permissions:
applicant team owner/manager = 팀매치 신청, 자기 팀 신청 조회, requested 상태 신청 철회
host team owner/manager = 신청 팀 목록 조회, 승인/거절/취소
team member = 자기 팀 관련 신청 상태 조회 후보
admin = 운영 목적 조회, 신청 상태 보정 후보
system = deadline 만료 시 requested 신청 expired 전환 후보

Indexes:
PK = id
FK = team_match_id -> team_matches.id
FK = applicant_team_id -> teams.id
FK = requested_by -> users.id
FK = approved_by -> users.id
FK = rejected_by -> users.id
index = team_match_id
index = applicant_team_id
index = requested_by
index = status
index = approved_at
index = rejected_at
index = created_at
partial unique 후보 = team_match_id where status = approved
partial unique 후보 = (team_match_id, applicant_team_id) where status in (requested, approved)

Audit:
status_change_logs = requested -> approved/rejected/withdrawn/cancelled_by_host/expired 전환
admin_action_logs = admin에 의한 보정 후보

Soft delete:
No. 상대 팀 신청/심사 이력은 삭제하지 않고 status로 보존한다.

API read/write impact:
Read = 내 팀 신청 상태, host team 신청 팀 목록, 관리자 팀매치 신청 조회 후보
Write = 팀매치 신청, 신청 철회, host team 승인/거절/취소, deadline 만료 처리,
  승인 시 team_matches matched 전환

Open questions:
없음
```

### 5.7 Chat/Notification

#### `chat_rooms`

- [x] 목적 확정
- [x] 연결 화면 확정
- [x] 컬럼 확정
- [x] nullable/default 확정
- [x] PK/FK 확정
- [x] unique/index 확정
- [x] status enum 필요 여부 및 값 확정
- [x] lifecycle 필요 여부 및 전이 확정
- [x] owner/permission 확정
- [x] soft delete 여부 확정
- [x] audit 필요 여부 확정
- [x] API read/write 영향 확인
- [x] open question 없음

```text
Purpose:
개인 매치와 팀매치 조율을 위한 채팅방을 관리한다. v1 채팅은 매치/팀매치 연결 채팅에
집중한다. 팀 내부 상시 채팅과 1:1 DM은 v1 core에서 제외한다.

Screens:
03 개인 매치 상세/참가자 채팅 진입
06 팀매치 상세/매칭 후 채팅 진입
10 채팅방 목록
10 채팅방 상세
12 관리자 채팅 조회 후보

Columns:
id uuid pk
room_type enum not null
match_id uuid nullable fk matches.id
team_match_id uuid nullable fk team_matches.id
status enum not null default active
last_message_at timestamptz nullable
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
archived_at timestamptz nullable
expired_at timestamptz nullable

Excluded from v1:
team internal chat = 팀 커뮤니티 기능으로 보고 추후 검토한다.
direct message = 1:1 DM은 신고/차단/스팸/관계 권한 설계가 필요하므로 추후 검토한다.
linked_entity_type/linked_entity_id = v1 대상이 match/team_match뿐이므로 명시 FK를 사용한다.

Status:
room_type = match | team_match
status = active | archived | expired

Lifecycle:
none -> active
active -> archived
active -> expired
archived -> active 후보
expired -> terminal

Creation policy:
개인 매치 채팅방은 참가자가 확정된 뒤 생성한다.
팀매치 채팅방은 상대 팀이 승인되어 `team_matches.status = matched`가 된 뒤 생성한다.

Constraint policy:
room_type = match이면 match_id not null, team_match_id null.
room_type = team_match이면 team_match_id not null, match_id null.

Permissions:
match participant = 개인 매치 채팅방 조회/메시지 작성
team match participant manager/owner 후보 = 팀매치 채팅방 조회/메시지 작성
admin = 운영 목적 조회, 부적절한 채팅방 archived 처리 후보
system = 매치/팀매치 승인 또는 매칭 완료 시 채팅방 생성, 만료 처리 후보

Indexes:
PK = id
FK = match_id -> matches.id
FK = team_match_id -> team_matches.id
unique 후보 = match_id where match_id is not null
unique 후보 = team_match_id where team_match_id is not null
index = room_type
index = status
index = last_message_at
index = archived_at
index = expired_at

Audit:
status_change_logs = active/archived/expired 전환
admin_action_logs = admin에 의한 archived 처리 후보

Soft delete:
No. 채팅방은 삭제하지 않고 archived/expired로 관리한다.

API read/write impact:
Read = 채팅방 목록, 채팅방 상세, 매치/팀매치 상세의 채팅 진입 가능 여부
Write = 매치 참가 승인/팀매치 매칭 완료 시 채팅방 생성, 관리자 archive, 만료 처리 후보

Open questions:
없음
```

#### `chat_room_participants`

- [x] 목적 확정
- [x] 연결 화면 확정
- [x] 컬럼 확정
- [x] nullable/default 확정
- [x] PK/FK 확정
- [x] unique/index 확정
- [x] status enum 필요 여부 및 값 확정
- [x] lifecycle 필요 여부 및 전이 확정
- [x] owner/permission 확정
- [x] soft delete 여부 확정
- [x] audit 필요 여부 확정
- [x] API read/write 영향 확인
- [x] open question 없음

```text
Purpose:
채팅방별 사용자 참여 상태를 관리한다. 메시지 작성 가능 여부, 읽음 위치, 고정/음소거/나가기
상태는 사용자별로 다르므로 `chat_room_participants`에 둔다.

Screens:
10 채팅방 목록
10 채팅방 상세
03 개인 매치 채팅 진입/참여자
06 팀매치 채팅 진입/참여자
12 관리자 채팅 참여자 조회 후보

Columns:
id uuid pk
room_id uuid not null fk chat_rooms.id
user_id uuid not null fk users.id
role enum not null default participant
status enum not null default active
last_read_at timestamptz nullable
pinned boolean not null default false
muted_until timestamptz nullable
joined_at timestamptz not null default now()
left_at timestamptz nullable
removed_at timestamptz nullable
created_at timestamptz not null default now()
updated_at timestamptz not null default now()

Status:
role = owner | participant | viewer
status = active | muted | left | removed

Lifecycle:
none -> active
active -> muted
muted -> active
active -> left
active -> removed
muted -> left
muted -> removed

left/removed 후 재입장 허용 여부는 연결된 매치/팀매치 상태와 권한을 기준으로 service policy에서
판단한다.

Participant creation policy:
개인 매치 채팅방 = `match_participants`의 확정 참가자를 참여자로 생성한다.
팀매치 채팅방 = host team과 applicant team의 active owner/manager만 참여자로 생성한다.
팀매치 일반 member 전체 참여는 v1에서 지원하지 않는다.

Permissions:
active participant = 채팅방 조회, 메시지 작성, last_read_at 갱신, pinned/mute 설정
left participant = 과거 메시지 조회 범위 후보, 신규 메시지 작성 불가
removed participant = 조회/작성 불가
admin = 운영 목적 조회, 참여자 removed 처리 후보
system = 채팅방 생성 시 참여자 생성, 매치/팀매치 권한 변화에 따른 참여자 보정 후보

Indexes:
PK = id
FK = room_id -> chat_rooms.id
FK = user_id -> users.id
unique = (room_id, user_id)
index = room_id
index = user_id
index = role
index = status
index = last_read_at
index = pinned

Audit:
status_change_logs = active/muted/left/removed 전환
admin_action_logs = admin에 의한 removed 처리 후보
일반 last_read_at/pinned 변경은 audit 필수 아님.

Soft delete:
No. 참여 상태는 삭제하지 않고 status로 보존한다.

API read/write impact:
Read = 내 채팅방 목록, unread 계산 후보, 채팅방 참여자 목록, 관리자 참여자 조회 후보
Write = 채팅방 생성 시 참여자 생성, 읽음 처리, 고정/음소거, 나가기, 관리자 제거 후보

Open questions:
없음
```

#### `chat_messages`

- [x] 목적 확정
- [x] 연결 화면 확정
- [x] 컬럼 확정
- [x] nullable/default 확정
- [x] PK/FK 확정
- [x] unique/index 확정
- [x] status enum 필요 여부 및 값 확정
- [x] lifecycle 필요 여부 및 전이 확정
- [x] owner/permission 확정
- [x] soft delete 여부 확정
- [x] audit 필요 여부 확정
- [x] API read/write 영향 확인
- [x] open question 없음

```text
Purpose:
채팅방에 저장된 텍스트 메시지를 관리한다. v1 채팅은 매치/팀매치 조율용 텍스트 메시지에
집중하고 이미지/파일 첨부는 제외한다.

Screens:
10 채팅방 상세
10 채팅방 목록 last message 후보
03 개인 매치 채팅
06 팀매치 채팅
12 관리자 채팅 메시지 조회 후보

Columns:
id uuid pk
room_id uuid not null fk chat_rooms.id
sender_user_id uuid not null fk users.id
content text nullable
status enum not null default sent
sent_at timestamptz not null default now()
deleted_at timestamptz nullable
hidden_at timestamptz nullable
created_at timestamptz not null default now()
updated_at timestamptz not null default now()

Excluded from v1:
chat_attachments = 이미지/파일 첨부는 storage, moderation, 크기 제한, 삭제 정책이 필요하므로 추후 검토.
failed status = 서버에 저장된 메시지는 sent 기준이다. 전송 실패/재시도는 client 임시 상태로 처리한다.

Status:
status = sent | deleted | hidden

deleted = 사용자가 자기 메시지를 삭제한 상태
hidden = 관리자/운영 조치로 일반 노출에서 숨긴 상태

Lifecycle:
none -> sent
sent -> deleted
sent -> hidden
deleted/hidden -> terminal

deleted/hidden 처리 시 일반 사용자 화면에서는 content를 노출하지 않거나 대체 문구로 렌더한다.
원문 별도 보존이 필요한 운영/분쟁 정책은 v1 이후 감사/분쟁 요구에 맞춰 재검토한다.

Permissions:
active room participant = 메시지 작성, 채팅방 메시지 조회
sender = 자기 sent 메시지 삭제
admin = 운영 목적 조회, 부적절한 메시지 hidden 처리 후보
system = 메시지 생성 시 chat_rooms.last_message_at 갱신 후보

Indexes:
PK = id
FK = room_id -> chat_rooms.id
FK = sender_user_id -> users.id
index = room_id
index = sender_user_id
index = status
index = sent_at
index = deleted_at
index = hidden_at

Audit:
status_change_logs = sent -> deleted/hidden 전환
admin_action_logs = admin에 의한 hidden 처리 후보
일반 메시지 작성은 audit 필수 아님.

Soft delete:
No. 메시지는 물리 삭제하지 않고 deleted/hidden status로 관리한다.

API read/write impact:
Read = 채팅방 메시지 목록, 채팅방 목록 last message 후보, 관리자 메시지 조회 후보
Write = 메시지 작성, 자기 메시지 삭제, 관리자 숨김 처리, last_message_at 갱신 후보

Open questions:
없음
```

#### `notifications`

- [x] 목적 확정
- [x] 연결 화면 확정
- [x] 컬럼 확정
- [x] nullable/default 확정
- [x] PK/FK 확정
- [x] unique/index 확정
- [x] status enum 필요 여부 및 값 확정
- [x] lifecycle 필요 여부 및 전이 확정
- [x] owner/permission 확정
- [x] soft delete 여부 확정
- [x] audit 필요 여부 확정
- [x] API read/write 영향 확인
- [x] open question 없음

```text
Purpose:
사용자별 인앱 알림을 관리한다. 개인 매치, 팀 가입, 팀매치, 채팅, 공지/운영 안내 등
사용자에게 보여줄 알림 row를 수신자별로 저장한다. v1은 인앱 알림 중심이며 push/email
전달 이벤트 추적은 제외한다.

Screens:
02 홈 알림 요약 후보
10 채팅/알림 진입 후보
07 마이/알림 목록
15 글로벌 알림 배지/액션 센터 후보
12 관리자 알림 조회 후보

Columns:
id uuid pk
user_id uuid not null fk users.id
notification_type enum not null
title string not null
body text nullable
target_type string nullable
target_id uuid nullable
status enum not null default created
read_at timestamptz nullable
archived_at timestamptz nullable
created_at timestamptz not null default now()
updated_at timestamptz not null default now()

Excluded from v1:
notification_reads = 알림은 user별 row이므로 `read_at`으로 충분하다.
notification_delivery_events = push/email/websocket 발송/실패 추적은 운영 요구가 생기면 추후 설계한다.

Status:
status = created | read | archived

delivered/failed는 v1 인앱 알림 상태로 두지 않는다. 외부 발송 추적이 필요하면
notification_delivery_events에서 다룬다.

Lifecycle:
none -> created
created -> read
created -> archived
read -> archived
archived -> terminal

`status = read` 전환 시 `read_at`을 기록한다. `status = archived` 전환 시 `archived_at`을 기록한다.

Target policy:
알림 대상은 `target_type`, `target_id`로 표현한다. match, team, team_match, chat_room,
notice 등 대상 종류가 다양하므로 모든 FK를 명시 컬럼으로 두지 않는다.

Permissions:
user = 자기 알림 목록 조회, 읽음 처리, 보관 처리
system = 도메인 이벤트 발생 시 알림 생성
admin = 운영 목적 조회 후보

Indexes:
PK = id
FK = user_id -> users.id
index = user_id
index = notification_type
index = status
index = read_at
index = archived_at
index = created_at
index = (target_type, target_id)

Audit:
일반 알림 생성/읽음/보관은 audit 필수 아님.
admin이 알림을 강제 보관/숨김 처리하는 운영 기능이 생기면 admin_action_logs 후보.

Soft delete:
No. 알림은 삭제하지 않고 archived로 관리한다.

API read/write impact:
Read = 알림 목록, unread count, 글로벌 배지/액션 센터 후보, 관리자 알림 조회 후보
Write = 도메인 이벤트 기반 알림 생성, 읽음 처리, 보관 처리

Open questions:
없음
```

#### `notification_preferences`

- [x] 목적 확정
- [x] 연결 화면 확정
- [x] 컬럼 확정
- [x] nullable/default 확정
- [x] PK/FK 확정
- [x] unique/index 확정
- [x] status enum 필요 여부 및 값 확정
- [x] lifecycle 필요 여부 및 전이 확정
- [x] owner/permission 확정
- [x] soft delete 여부 확정
- [x] audit 필요 여부 확정
- [x] API read/write 영향 확인
- [x] open question 없음

```text
Purpose:
사용자별 인앱 알림 수신 설정을 관리한다. v1은 인앱 알림 중심이므로 push/email 채널별
설정은 두지 않고, 주요 도메인 카테고리별 on/off만 관리한다.

Screens:
07 마이/설정 알림 설정
15 글로벌 알림/액션 센터 후보
12 관리자 사용자 알림 설정 조회 후보

Columns:
user_id uuid pk fk users.id
match_enabled boolean not null default true
team_enabled boolean not null default true
team_match_enabled boolean not null default true
chat_enabled boolean not null default true
notice_enabled boolean not null default true
marketing_enabled boolean not null default false
created_at timestamptz not null default now()
updated_at timestamptz not null default now()

Excluded from v1:
push_enabled/email_enabled/sms_enabled = v1은 인앱 알림 중심이다. 채널별 수신 설정은 push/email
  발송 기능이 확정되면 추가 검토한다.

Status:
별도 status enum은 두지 않는다. 각 카테고리 boolean으로 표현한다.

Lifecycle:
users 생성 후 notification_preferences 생성
사용자 설정 변경
users deleted 전환 시 일반 알림 발송 중단

Default policy:
서비스 활동 알림(match/team/team_match/chat/notice)은 기본 true.
marketing 알림은 명시 동의가 필요하므로 기본 false.

Permissions:
user = 자기 알림 설정 조회/수정
system = 가입 시 기본 설정 생성, 알림 생성 전 수신 설정 확인
admin = 운영 목적 조회 후보. 사용자 설정 직접 수정은 원칙적으로 금지

Indexes:
PK = user_id
FK = user_id -> users.id

Audit:
일반 알림 설정 변경은 audit 필수 아님.
marketing_enabled 변경은 약관/마케팅 수신 동의 정책과 연결될 수 있으므로 필요 시
status_change_logs 후보.

Soft delete:
No. 사용자 삭제는 `users` 계정 삭제/익명화 정책을 따른다.

API read/write impact:
Read = 설정 화면 알림 설정 조회, 알림 생성 전 수신 가능 여부 확인
Write = 가입 시 기본 설정 생성, 사용자 알림 설정 변경

Open questions:
없음
```

### 5.8 Payment/Support

### 5.9 Admin/Audit

#### `admin_users`

- [x] 목적 확정
- [x] 연결 화면 확정
- [x] 컬럼 확정
- [x] nullable/default 확정
- [x] PK/FK 확정
- [x] unique/index 확정
- [x] status enum 필요 여부 및 값 확정
- [x] lifecycle 필요 여부 및 전이 확정
- [x] owner/permission 확정
- [x] soft delete 여부 확정
- [x] audit 필요 여부 확정
- [x] API read/write 영향 확인
- [x] open question 없음

```text
Purpose:
일반 `users` 계정 중 관리자 권한을 가진 계정을 관리한다. 관리자도 서비스 사용자 계정의
일종이므로 식별자와 로그인 lifecycle은 `users`가 담당하고, 관리자 역할/상태는
`admin_users`가 담당한다.

Screens:
12 관리자 로그인/진입 권한 확인
12 관리자 대시보드
12 관리자 사용자/매치/팀/공지/운영 화면
12 관리자 계정 관리 후보

Columns:
user_id uuid pk fk users.id
admin_role enum not null
status enum not null default active
last_active_at timestamptz nullable
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
revoked_at timestamptz nullable

Excluded from v1:
admin_permissions = v1은 role enum으로 시작한다. capability 세분화가 필요해지면 별도 테이블로 설계한다.

Status:
admin_role = owner | ops | support
status = active | suspended | revoked

owner = 관리자 전체 권한, 관리자 계정 관리, 시스템 설정 후보
ops = 매치/팀/팀매치/공지/운영 조치 중심
support = 사용자/문의/조회 중심, 위험한 상태 변경 제한 후보

Lifecycle:
none -> active
active -> suspended
suspended -> active
active -> revoked
suspended -> revoked
revoked -> active 후보

revoked는 관리자 권한 해제 상태다. `users` 계정 자체 삭제와는 별개다.

Permissions:
owner admin = 관리자 계정 생성/역할 변경/정지/해제/권한 회수
ops admin = 운영 도메인 조치
support admin = 조회/지원 중심 작업
system = last_active_at 갱신 후보

Indexes:
PK = user_id
FK = user_id -> users.id
index = admin_role
index = status
index = last_active_at
index = revoked_at

Audit:
admin_action_logs = 관리자 생성, role 변경, suspended/revoked/active 전환
status_change_logs = status 전환 후보
관리자 권한 변경은 반드시 audit 대상이다.

Soft delete:
No. 관리자 권한 해제는 `status = revoked`, `revoked_at`으로 표현한다.

API read/write impact:
Read = 관리자 진입 권한 확인, 관리자 계정 목록/상세 후보, 운영 화면 권한 체크
Write = 관리자 계정 부여, role 변경, 정지/복구/회수, last_active_at 갱신 후보

Open questions:
없음
```

#### `admin_action_logs`

- [x] 목적 확정
- [x] 연결 화면 확정
- [x] 컬럼 확정
- [x] nullable/default 확정
- [x] PK/FK 확정
- [x] unique/index 확정
- [x] status enum 필요 여부 및 값 확정
- [x] lifecycle 필요 여부 및 전이 확정
- [x] owner/permission 확정
- [x] soft delete 여부 확정
- [x] audit 필요 여부 확정
- [x] API read/write 영향 확인
- [x] open question 없음

```text
Purpose:
관리자가 의도적으로 수행한 운영 조치를 감사 목적으로 기록한다. 사용자 제재, 팀/매치 숨김,
공지 게시/보관, 메시지 숨김, 관리자 권한 변경 같은 조치의 actor, reason, before/after를
남긴다. 상태 변화 사실 자체는 `status_change_logs`가 담당한다.

Screens:
12 관리자 감사 로그
12 관리자 사용자/매치/팀/공지/채팅 상세의 조치 이력 후보
12 관리자 계정 관리 이력 후보

Columns:
id uuid pk
admin_user_id uuid not null fk admin_users.user_id
action_type string not null
target_type string not null
target_id uuid not null
reason text nullable
before_state jsonb nullable
after_state jsonb nullable
created_at timestamptz not null default now()

Status:
별도 status enum은 두지 않는다. action_type으로 조치 종류를 표현한다.

Action examples:
user_suspend
user_unsuspend
team_hide
team_restore
match_cancel
notice_publish
notice_archive
chat_message_hide
admin_role_change

Lifecycle:
append only

로그는 생성 후 수정/삭제하지 않는다.

Responsibility split:
admin_action_logs = 관리자가 어떤 의도와 사유로 어떤 조치를 했는지 기록
status_change_logs = target의 상태가 무엇에서 무엇으로 바뀌었는지 기록

관리자 조치로 상태가 바뀌면 두 로그가 모두 생성될 수 있다.

Permissions:
owner admin = 감사 로그 전체 조회 후보
ops/support admin = 자기 권한 범위의 감사 로그 조회 후보
system = 관리자 조치 수행 시 로그 생성
일반 user = 조회 불가

Indexes:
PK = id
FK = admin_user_id -> admin_users.user_id
index = admin_user_id
index = action_type
index = (target_type, target_id)
index = created_at

Audit:
이 테이블 자체가 관리자 조치 audit이다. 로그 수정/삭제 기능은 제공하지 않는다.

Soft delete:
No. 감사 로그는 삭제하지 않는다.

API read/write impact:
Read = 관리자 감사 로그 목록/상세, 각 도메인 관리자 상세의 조치 이력 후보
Write = 관리자 조치 수행 시 append-only 로그 생성

Open questions:
없음
```

#### `status_change_logs`

- [x] 목적 확정
- [x] 연결 화면 확정
- [x] 컬럼 확정
- [x] nullable/default 확정
- [x] PK/FK 확정
- [x] unique/index 확정
- [x] status enum 필요 여부 및 값 확정
- [x] lifecycle 필요 여부 및 전이 확정
- [x] owner/permission 확정
- [x] soft delete 여부 확정
- [x] audit 필요 여부 확정
- [x] API read/write 영향 확인
- [x] open question 없음

```text
Purpose:
도메인별 주요 상태 전이를 공통 append-only 로그로 기록한다. 관리자 조치의 의도/사유는
`admin_action_logs`가 담당하고, `status_change_logs`는 target의 상태 필드가 무엇에서
무엇으로 바뀌었는지와 actor를 기록한다.

Screens:
12 관리자 감사 로그
12 관리자 사용자/매치/팀/공지/채팅 상세의 상태 이력 후보
운영 디버깅/감사 조회 후보

Columns:
id uuid pk
target_type string not null
target_id uuid not null
status_field string not null
from_status string nullable
to_status string not null
changed_by_type enum not null
changed_by_id uuid nullable
reason text nullable
metadata jsonb nullable
created_at timestamptz not null default now()

Status:
changed_by_type = user | admin | system

별도 log status enum은 두지 않는다. append-only 로그는 생성되면 terminal이다.

Lifecycle:
append only

로그는 생성 후 수정/삭제하지 않는다.

Logging policy:
모든 작은 필드 변경을 기록하지 않는다. lifecycle상 의미 있는 상태 전이만 기록한다.
예: account_status 변경, 신청 승인/거절, 매치 모집/완료/취소, 팀 숨김/정지,
채팅방 archived, 메시지 hidden/deleted, 약관 published/archived 등.

Actor policy:
admin 조치뿐 아니라 user, host/manager 역할의 user, system job에 의한 상태 전이도 기록할 수 있다.
host/manager는 changed_by_type = user로 두고, 권한 맥락은 metadata에 남기는 후보로 본다.
system 전이는 changed_by_id를 null로 둘 수 있다.

Responsibility split:
status_change_logs = 상태 필드의 before/after와 actor를 기록
admin_action_logs = 관리자 조치의 의도, 사유, before/after payload를 기록

관리자 조치로 상태가 바뀌면 두 로그가 모두 생성될 수 있다.

Permissions:
owner/ops admin = 상태 전이 로그 조회
support admin = 권한 범위 내 상태 전이 로그 조회 후보
system = 상태 전이 발생 시 로그 생성
일반 user = 조회 불가

Indexes:
PK = id
index = (target_type, target_id)
index = status_field
index = from_status
index = to_status
index = changed_by_type
index = changed_by_id
index = created_at

Audit:
이 테이블 자체가 상태 전이 audit이다. 로그 수정/삭제 기능은 제공하지 않는다.

Soft delete:
No. 상태 전이 로그는 삭제하지 않는다.

API read/write impact:
Read = 관리자 감사/상태 이력 조회, 운영 디버깅 후보
Write = 도메인 상태 전이 발생 시 append-only 로그 생성

Open questions:
없음
```

## 6. Deferred Tables

아래 테이블은 현재 DB v1 체크 대상에서 제외한다. 필요성이 확정되면 별도 문서 또는 v1.1/v2에서 설계한다.

| Table | 보류 이유 |
|---|---|
| `venues` | core create flow에서 장소 선택 후보로 언급되지만 시설 self-service는 후보군이다. v1에서는 manual place 또는 외부/master reference로 대체 가능 여부 확인 후 결정 |
| `user_permission_states` | 위치/알림 권한은 화면 상태로 필요하지만 DB 저장 필요성은 불명확 |
| `search_histories` | 최근 검색 저장은 UX 후보. v1 필수 여부 확인 후 포함 가능 |
| `saved_filters` | 저장 필터는 현재 v1 필수 아님 |
| `match_rules` | v1에서는 `matches.rules_text` 또는 `matches.rules`로 단순화 가능 |
| `match_media` | 개인 매치 v1은 `matches.image_url` 대표 이미지 1장으로 시작하고, 다중 이미지/갤러리/업로드 처리 상태는 추후 설계 |
| `match_waitlist_entries` | 대기열 v1 포함 여부 미정 |
| `match_notification_subscriptions` | 매치별 알림 구독이 v1 필수인지 미정 |
| `team_match_styles` | v1에서는 `team_matches.play_style_codes` 등으로 단순화 가능 |
| `team_match_invitations` | 초대/공유 세부 흐름 v1 필수 여부 미정 |
| `team_regions` | 팀 대표 지역은 v1에서 `teams.region_id`로 충분하며, 다중 활동 지역 검색/필터가 필요해지면 별도 조인 테이블로 설계 |
| `team_chat_rooms` | v1 채팅은 매치/팀매치 조율에 집중하고 팀 내부 상시 채팅은 커뮤니티 기능으로 추후 검토 |
| `direct_message_rooms` | 1:1 DM은 신고/차단/스팸/관계 권한 설계가 필요하므로 v1 core에서 제외 |
| `chat_attachments` | 채팅 이미지 첨부 v1 포함 여부 미정 |
| `chat_context_links` | 채팅방 맥락 링크가 linked entity로 충분한지 확인 필요 |
| `notification_delivery_events` | 발송/실패 이벤트 추적은 v1 운영 요구에 따라 추가 |
| `notification_reads` | 알림이 user별 row이면 `notifications.read_at`으로 단순화 가능 |
| `notice_reads` | 사이트 전체 공지는 띄우고 확인만 가능하면 충분하므로 v1에서는 사용자별 읽음 상태를 DB에 저장하지 않음 |
| `user_activity_summaries` | 활동 요약은 원천 match/team/payment 도메인 이벤트와 집계 기준 확정 후 계산/캐시 여부를 재검토 |
| `match_recommendations` | 추천 결과 저장은 홈/검색 최적화 영역이므로 v1에서는 API 실시간 계산/정렬로 시작하고 캐시 필요성이 생기면 재검토 |
| `payment_ledger_events` | v1에서는 `payment_attempts`, `status_change_logs`, `admin_action_logs`로 대체 가능 여부 확인 |
| `refund_events` | v1에서는 `refund_requests`와 audit log로 단순화 가능 |
| `payments` | 개인 매치/팀매치 v1 결제 제외 결정에 따라 결제 기능 도입 시 별도 설계 |
| `payment_attempts` | 결제 기능 도입 전까지 provider 시도 이력 불필요 |
| `refund_requests` | v1 결제 제외로 환불 요청 흐름도 후속 도입 대상 |
| `disputes` | 결제/환불 제외 상태에서는 v1 core에 넣지 않고, 신고/운영 처리 UX 확정 후 별도 설계 |
| `dispute_events` | disputes 제외에 따라 분쟁 이벤트 이력도 후속 설계 |
| `admin_permissions` | v1에서는 `admin_users.admin_role`로 시작하고 capability는 추후 검토 |
| `admin_operation_tasks` | v1은 각 도메인 관리자 화면에서 직접 조치하고 `admin_action_logs`로 기록하며, task queue는 운영 고도화 시 재검토 |
| `moderation_reports` | 신고/검수 세부 모델은 관리자 v1 범위 확정 후 검토 |
| `share_events` | 공유 이벤트는 analytics/business 필요성이 확정되면 추가 |
| `user_drafts` | client-only draft로 처리 가능하면 DB 제외 |

## 7. 다음 검토 순서

1. `users`
2. `auth_identities`
3. `user_profiles`
4. `user_onboarding_progress`
5. `terms_documents`
6. `user_terms_consents`
7. `sports`
8. `sport_levels`
9. `regions`

Identity/Auth와 Terms/Master를 먼저 닫은 뒤, Personal Match와 Team 도메인으로 넘어간다.
