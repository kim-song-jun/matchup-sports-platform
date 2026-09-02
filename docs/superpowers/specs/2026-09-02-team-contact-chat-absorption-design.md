# 팀 컨택의 채팅 흡수 — 설계 문서

- 작성일: 2026-09-02
- 선행 문서: `docs/superpowers/specs/2026-08-20-team-contact-message-design.md` (Phase 1~3),
  `docs/superpowers/specs/2026-08-24-team-report-enforcement-design.md`
- 사용자 결정: **A안(채팅 흡수)** + 상시 입구는 **마이 메뉴 + 팀 관리 메뉴** (2026-09-02)

## 1. 배경 — 무엇이 문제인가

Phase 1~3 의 컨택은 "요청 → 수락하면 채팅" 구조로 만들었고, 채팅 연결(`V1ChatRoom.teamContactId`,
`roomType: 'team_contact'`, `resolveTeamContactRoom`) 자체는 이미 동작한다. 그러나 origin/dev 실측 결과:

| 항목 | 실측 |
|---|---|
| 요청 단계 | 전용 화면 `/my/team-contacts`(받은함·상세·수락/거절/철회)에서 채팅과 무관하게 돈다 |
| 채팅 연결 | `chat.service.ts` `assertCanUseTeamContactChat` 이 `status: 'accepted'` 를 강제 — 수락 뒤 "대화 열기" 버튼을 눌러야만 방이 생긴다 |
| 받은함 진입점 | 마이 메뉴·하단탭·팀 관리 메뉴 어디에도 링크 없음. 알림 딥링크와 "보내기 직후 리다이렉트"로만 도달 |
| 채팅 진입점 | 하단탭에 채팅 없음. 홈 위젯에서만 `/chat` 링크 |
| 받은함 범위 | 팀 단위 API(`GET /teams/:id/contacts`)뿐 — 운영팀이 2개 이상이면 팀을 고르기 전엔 빈 화면 |
| 대기 건수 | count API 없음, 배지 없음 |
| 상대 운영진 참여 | 방에 스스로 들어온 사람만 참가자. 다른 운영진은 열기 전까지 목록에서 안 보임 |

즉 사용자 관점에서 컨택은 "따로 도는 기능"이고, 그 기능으로 가는 길도 없다.

## 2. 확정된 제품 결정

| # | 항목 | 결정 |
|---|---|---|
| 1 | 컨택의 정체 | **컨택 = 채팅방.** 요청 시점에 방이 생기고, 요청 메시지가 첫 메시지다 |
| 2 | 수락/거절/철회 | 채팅방 상단 **상태 카드**에서 한다. 전용 컨택함 화면은 없앤다 |
| 3 | 수락 전 대화 | **잠금.** 요청 메시지 하나만 존재하고 답장은 수락 뒤에만 가능 |
| 4 | 종료(거절/철회/만료)된 방 | archived 로 바꾸지 않고 **active 유지 + 입력 잠금**. 치우려면 기존 "나가기" |
| 5 | 참가자 | 요청 시점에 **양 팀 owner/manager 전원**을 참가자로 넣는다 |
| 6 | 상시 입구 | 마이 메뉴 커뮤니티 섹션 "채팅" 행(대기 컨택 배지) + 팀 상세 운영 메뉴 "받은 컨택 N" 행. 하단탭은 바꾸지 않는다 |
| 7 | 거절 사유 | 시스템 메시지로 흘리지 않고 상태 카드에만 표시(Phase 1 매뉴얼 §9 정책 유지) |
| 8 | 옛 딥링크 | `/my/team-contacts`, `/my/team-contacts/:id` 는 채팅방으로 **리다이렉트하는 얇은 페이지**로 남긴다(DB 에 저장된 옛 알림 딥링크 호환) |
| 9 | 컨택함 API | `GET /teams/:id/contacts`, `GET /team-contacts/:id` 는 **삭제**(소비처가 삭제되는 화면뿐) |
| 10 | 스키마 | **변경 없음.** 데이터 백필 마이그레이션 1개만 |

## 3. 데이터·상태

### 3.1 정본은 그대로 `V1TeamContact.status`

`requested / accepted / declined / withdrawn / expired` 상태 머신, 7일 lazy-flip 만료, advisory lock
중복 방지, 일일 한도, 차단·정책 가드는 **전부 그대로**다. 채팅방은 상태를 갖지 않고 컨택을 비춘다.

### 3.2 컨택 생성 트랜잭션에서 함께 만드는 것

`TeamContactsService.create()` 의 기존 `$transaction` 안에서, `v1TeamContact.create` 직후:

1. `v1ChatRoom.create({ teamContactId, status: 'active' })`
2. 양 팀 `owner|manager` 활성 멤버십 전원을 `v1ChatRoomParticipant` 로 삽입.
   `visibleFromAt = now` — 그래서 `ensureEntered` 의 "들어왔습니다" 시스템 메시지가 안 생기고,
   요청 메시지가 곧바로 보이며 수신자에게 미읽음 1로 잡힌다.
3. 요청 메시지를 **요청자의 텍스트 메시지**로 삽입 (`messageType: 'text'`, `body = dto.message`,
   `sentAt = now`). `room.lastMessageAt = now`.

알림(`team_contact_received`)은 지금처럼 트랜잭션 밖에서 쏜다.

### 3.3 나중에 들어오는 운영진

승격돼 새로 운영진이 된 사람은 `POST /chat/rooms/resolve { team_contact }` 경로로 들어온다.
`resolveTeamContactRoom` 의 참가자 생성 시 `visibleFromAt = room.createdAt` 으로 넣어 요청 메시지부터
전부 보이게 한다. 컨택 방은 목적이 하나라 과거 숨김(`visibleFromAt` 의 본래 취지)이 의미 없다.
`ensureResolvedParticipant` 는 다른 방 종류에 그대로 쓰이므로 건드리지 않고, 컨택 전용 분기를 둔다.

### 3.4 응답 시 시스템 메시지

`respond()` 가 `updateMany` 로 상태를 바꾼 뒤(count > 0 인 경우만), 같은 트랜잭션에서:

- `v1ChatMessage.create({ messageType: 'system', systemEventType: null, senderUserId: 행위자,
  body: '컨택을 수락했어요' | '컨택을 거절했어요' | '컨택을 철회했어요' })`
- `room.lastMessageAt` 갱신

`V1ChatSystemEventType` 은 `joined|left` 뿐이고 컬럼이 nullable 이므로 enum 을 늘리지 않는다.
프론트는 `messageType === 'system'` 이면 본문만 가운데 정렬로 그린다(기존 동작).

### 3.5 만료 표시

방 목록·상세 응답에 컨택 정보를 실을 때 `status === 'requested' && expiresAt <= now` 면 `expired` 로
계산해 내려보낸다(`toListItem` 과 같은 계산 전용 규칙). DB 정리는 기존 4경로(create/respond/
detail/listForTeam) 중 listForTeam·detail 이 사라지므로 **`respond()`·`create()`·신규 summary 엔드포인트**
세 곳이 맡는다. 방을 열 때(`ChatService.detail`)는 쓰지 않는다 — 채팅 조회는 읽기 경로라 쓰기를
섞지 않는다.

### 3.6 접근 자격

- `chat-entitlement.ts` `currentChatEntitlementWhere` 의 `teamContact` 분기에서 `status: 'accepted'`
  제거. 요청 중·종료된 방도 양 팀 운영진에게 보인다.
- `ChatService.assertCanUseTeamContactChat` 도 status 조건 제거(운영진 여부만).
- **전송 게이트**는 `sendMessage()` 에 둔다: 컨택 방이면 컨택 상태를 읽어 `accepted` 가 아니면
  409 `TEAM_CONTACT_NOT_ACCEPTED` ("수락한 뒤에 대화할 수 있어요."). 만료 판정도 여기서 lazy 계산.
- `currentChatRecipientEntitlementWhere` 는 변경 없음(이미 양 팀 운영진으로 좁힌다).

### 3.7 백필 마이그레이션 (데이터만)

`apps/v1_api/prisma/migrations/<ts>_v1_team_contact_rooms_backfill/migration.sql` — 순수 SQL, idempotent:

1. 방이 없는 `requested|accepted` 컨택에 `v1_chat_rooms(team_contact_id)` 삽입
2. 컨택 방마다 양 팀 owner/manager 활성 멤버 중 참가자가 아닌 사람을 삽입
   (`visible_from_at = 컨택 created_at`); 이미 참가자인 사람은 `visible_from_at = LEAST(기존, 컨택 created_at)`
3. 요청 메시지가 없는 컨택 방에 `v1_chat_messages(sender = requested_by_user_id, body = message,
   sent_at = 컨택 created_at)` 삽입 — "없음" 판정은 `sender = requested_by_user_id AND sent_at = 컨택 created_at`
   행 부재로 한다
4. `last_message_at` 을 그 방의 최신 `sent_at` 으로 맞춘다

스키마는 안 건드리므로 `SOURCE_SNAPSHOT` 재핀은 필요 없다. CI 의 마이그레이션 재생 게이트는 빈 DB 에서
0행 처리로 통과한다.

## 4. 엔드포인트

| 메서드 | 경로 | 변경 |
|---|---|---|
| POST | `/teams/:teamId/contacts` | 응답 `{ ...contact, chatRoomId, route: '/chat/{roomId}' }`. 409 `TEAM_CONTACT_ALREADY_ACTIVE` details 에 `existingChatRoomId` 추가 |
| PATCH | `/team-contacts/:id/accept` / `decline` | 유지. 시스템 메시지 기록. 응답에 `chatRoomId` |
| POST | `/team-contacts/:id/withdraw` | 유지. 동일 |
| GET | `/me/team-contacts/summary` | **신규.** `{ pendingInbound, byTeam: [{ teamId, pendingInbound }] }`. 호출자가 owner/manager 인 활성 팀 전부 대상. 조회 전 해당 팀들의 만료 대기 건 lazy-flip |
| GET | `/chat/rooms` · `/chat/rooms/:id` | 컨택 방 항목에 `teamContact` 블록 추가(§5). 자격 조건 완화(§3.6) |
| POST | `/chat/rooms/:id/messages` | 컨택 방 전송 게이트(§3.6) |
| POST | `/chat/rooms/resolve` | `team_contact` 분기: 참가자 `visibleFromAt = room.createdAt`(§3.3) |
| GET | `/teams/:teamId/contacts` | **삭제** |
| GET | `/team-contacts/:id` | **삭제** |
| 차단·정책 5개 | 변경 없음 |

`/me/team-contacts/summary` 는 `team-contacts.controller.ts` 에 두고 `V1AuthGuard` 를 건다.

## 5. 응답 형태 — `teamContact` 블록

`GET /chat/rooms` 항목과 `GET /chat/rooms/:id` 에, `roomType === 'team_contact'` 일 때만:

```ts
teamContact: {
  contactId: string;
  status: 'requested' | 'accepted' | 'declined' | 'withdrawn' | 'expired'; // expired 는 계산값 포함
  expiresAt: string;
  declineReason: string | null;
  mySide: 'from' | 'to';            // 호출자가 보낸 팀 운영진이면 from
  fromTeam: { id: string; name: string };
  toTeam:   { id: string; name: string };
}
```

`mySide` 는 호출자의 활성 owner/manager 멤버십으로 판정한다. 양쪽 다면 `to` 우선(받는 쪽 액션이
더 중요하다). `linkedTarget.route` 는 `/teams/{상대 팀 id}` 로 바꾼다 — 지금은 삭제되는 컨택 상세로
가리키고 있다.

## 6. 알림

| 이벤트 | targetType | targetId | 딥링크 |
|---|---|---|---|
| `team_contact_received` | `team` → **`chat`** | contactId → **roomId** | `/chat/{roomId}` |
| `team_contact_accepted` | 동일 | 동일 | 동일 |
| `team_contact_declined` | 동일 | 동일 | 동일 |

선호도 키는 `teamEnabled` 그대로. `notifications.service.ts` 의 `deepLinkForEvent` 컨택 분기와 targetType
매핑 두 곳, spec 의 딥링크 단언을 함께 고친다. `TeamContactsService.notifyTeamManagers` 는 roomId 를
넘긴다.

## 7. 프론트 화면

### 7.1 채팅방 (`ChatRoomPageClient` / `ChatRoomPageView`)

- `room.data.teamContact` 가 있으면 상단 컨텍스트 카드 자리에 **`TeamContactStatusCard`** 를 그린다.
  새 파일 `components/community/team-contact-status-card.tsx`.
  - 상태 배지: 아이콘 + 텍스트(요청 대기 / 수락됨 / 거절됨 / 철회됨 / 만료됨). 컬러만으로 구분하지 않는다.
  - 상대 팀 이름(링크 `/teams/{id}`), `requested` 면 `formatExpiresIn` 카운트다운(기존 함수 이동).
  - 액션: `mySide === 'to' && requested` → 수락 / 거절(사유 입력 인라인, 기존 상세의 2단계 패턴).
    `mySide === 'from' && requested` → 철회. 그 외 액션 없음.
  - 보조 메뉴 "신고 · 차단": 기존 `ReportContactDialog` 와 2단계 인라인 차단을 옮겨 온다.
  - `declined && declineReason` 이면 사유 표시.
- 입력창: `status !== 'accepted'` 면 disabled + placeholder(`requested`: "수락하면 대화할 수 있어요",
  종료: "종료된 컨택이에요"). 전송 버튼 disabled.
- 액션 성공 시 `['chat','room',id]`, `['chat','rooms']`, `['chat','messages',id]`, summary 키 무효화.

### 7.2 채팅 목록

- `ChatRoomModel` 에 `contactStatus?: string` 추가. 팀컨택 행에 상태 배지(`tm-badge`), `requested && mySide==='to'`
  면 "답장 필요" 강조.
- `/chat?category=team_contact` 를 읽어 필터 초기값을 팀컨택으로 둔다(`useSearchParams`). 값이 없으면 전체.

### 7.3 입구

- `my.view-model.ts` 커뮤니티 섹션에 `{ label: '채팅', sub: '매치·팀·컨택 대화를 한곳에서 확인해요', href: '/chat', icon: 'MessageCircle' }`.
  `MyMenuItem` 에 `badge?: number` 를 추가하고 `MenuSection` 이 라벨 옆에 `tm-badge` 로 그린다.
  값은 `useV1TeamContactSummary().pendingInbound`, 0이면 배지 없음.
- `teams-client.tsx` `buildTeamOperations` 에 `{ label: '받은 컨택', sub: '다른 팀이 보낸 컨택을 확인하고 답해요', href: '/chat?category=team_contact' }`.
  라벨에 `byTeam` 의 해당 팀 `pendingInbound` 를 "받은 컨택 N" 으로 붙인다(0이면 숫자 없음).

### 7.4 보내기 화면 (`team-contact-new-client.tsx`)

- 성공 시 `router.push(response.route)`.
- `TEAM_CONTACT_ALREADY_ACTIVE` 링크는 `/chat/{existingChatRoomId}`.

### 7.5 삭제·리다이렉트

- 삭제: `components/my/my-team-contacts-client.tsx` + test, 훅 `useV1TeamContacts`·`useV1TeamContact`, 쿼리 키
  `teamContacts`·`teamContactsAll`·`teamContact`, `scripts/capture-team-contacts-alpha.mjs`(대상 화면이 사라짐).
- 리다이렉트: `app/my/team-contacts/page.tsx` → `/chat?category=team_contact`;
  `app/my/team-contacts/[contactId]/page.tsx` → `useV1ResolveChatRoom({ team_contact, contactId })` 성공 시
  `router.replace(route)`, 실패 시 `ErrorState`. `loading.tsx` 두 개는 삭제. route-chrome 의 두 패턴은
  리다이렉트 중 잠깐 보이는 셸이므로 제목만 "채팅으로 이동 중" 으로 바꾼다.
- 매뉴얼 `docs/team-contact-message-guide.md` §4 를 채팅 기준으로 고쳐 쓴다. 스크린샷 링크는 alpha 갤러리
  게시 뒤 교체한다.

## 8. 테스트

### 백엔드
- `team-contacts.service.spec.ts`: create 가 방·참가자(양 팀 운영진 전원)·첫 메시지를 트랜잭션 안에서
  만드는지; respond 가 시스템 메시지를 쓰는지; summary 가 팀별 집계와 만료 정리를 하는지.
  삭제된 listForTeam/detail 케이스 제거.
- `chat.service.spec.ts`(신규 또는 기존 확장): 컨택 방 `sendMessage` — requested 409, accepted 통과,
  expired(계산) 409. `resolveTeamContactRoom` 의 `visibleFromAt`.
- `chat-entitlement.spec.ts`: status 조건 제거 반영.
- `chat-room-shape.spec.ts`: `linkedTarget.route` 가 상대 팀으로.
- `notifications.service.spec.ts`: 컨택 딥링크 `/chat/{roomId}`, targetType `chat`.
- 통합 `team-contact-flow.integration-spec.ts` 재작성: 요청 → 양 팀 운영진 방 목록에 노출 → 수락 전 전송 409
  → 수락 → 시스템 메시지 → 전송 200 → 알림 딥링크. `team-contact-guards` 는 create 응답 형태만 갱신.
- 마이그레이션 SQL 은 CI 재생 게이트 + alpha 실데이터로 검증(배포 후 방 개수 = 컨택 개수).

### 프론트 (vitest, `apps/v1_web` 안에서 실행)
- `team-contact-status-card.test.tsx`: to/from × 상태별 버튼 노출, 수락 클릭 → mutate, 입력창 잠금 문구.
- `community-api-clients.test.tsx`: 팀컨택 행 배지, `?category=team_contact` 프리셀렉트.
- `my-page` 테스트: 채팅 행과 배지.
- `team-contact-new-client.test.tsx`: 성공 시 `route` 로 이동.

### alpha 실측
두 팀 계정(A·B 팀장)으로 요청 → 상대 목록 노출 → 수락 → 대화까지 실제 흐름. 📱390 / 📲768 / 🖥1440
갤러리를 PR 코멘트로 게시.

## 9. 트레이드오프 (정직하게)

| | 기존 방식 | 새 방식 |
|---|---|---|
| 장점 | 컨택 요청이 채팅 목록을 어지럽히지 않음. 방은 수락된 관계에만 존재 | 사용자가 컨택/채팅을 구분할 필요 없음. 화면 3개 감소. 상대 운영진 전원이 즉시 봄. 입구가 생김 |
| 단점 | 입구 없음. 팀 단위 받은함. 수락 뒤 버튼을 한 번 더 눌러야 대화 | 종료된 방이 목록에 남음(자동 정리 없음, "나가기"로 수동). 컨택 하나당 참가자 행이 양 팀 운영진 수만큼 생김. 데이터 백필이 alpha·prod 양쪽에 적용됨 |

## 10. 범위 밖

- 하단탭에 채팅 추가(IA 변경 — 별도 브레인스토밍)
- 종료된 컨택 방 자동 보관/정리 cron
- 컨택 전용 알림 선호도 분리(Phase 4 항목 그대로)
- `V1ChatSystemEventType` 확장
