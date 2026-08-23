# 팀 간 컨택 메시지 — 설계 문서

- 작성일: 2026-08-20
- 대상 스택: `apps/v1_api` (NestJS) + `apps/v1_web` (Next.js) — **v1 스택이 현행이다.** `apps/api`/`apps/web`은 구버전이며 이 설계의 대상이 아니다.
- 상태: 설계 확정, 구현 계획 수립 전

---

## 1. 배경 — 무엇이 없어서 이걸 만드는가

두 팀이 경기를 잡으려면 대개 사전 대화가 필요하다. 실력대가 맞는지, 그 날짜에 정말 가능한지, 구장은 어느 쪽이 잡는지. 지금 v1에는 **그 대화를 할 수 있는 시점이 존재하지 않는다.**

실측된 구멍:

| 지점 | 현재 상태 | 근거 |
|---|---|---|
| 팀 상세 화면에서 상대 팀에 말 걸기 | 경로 없음 | `V1ChatRoom`은 `matchId`/`teamId`/`teamMatchId` 3개 nullable FK가 각각 `@unique`인 "엔티티당 방 1개" 구조다. `teamId`가 단일 FK라 "보내는 팀 ↔ 받는 팀" 페어를 표현할 수 없다 |
| 팀 매치 공고에 신청하면서 한마디 | DTO에는 있으나 **죽어 있음** | `CreateTeamMatchApplicationDto.message`(500자)가 존재하지만 `apps/v1_web/src/components/team-matches/team-matches-client.tsx:290`이 `message: null`로 하드코딩해 전송한다 |
| 신청 후 승인 전 대화 | 원천 차단 | `chat.service.ts:358` `assertCanUseTeamMatchChat`이 `status==='matched' && approvedApplicantTeamId != null`을 강제한다 |
| 1:1 다이렉트 메시지 | API 문서에 `deferred`로 명시 | — |

즉 현재는 **"먼저 승인부터 하고, 그다음에 대화한다"** 순서만 가능하다. 요구는 그 반대다.

---

## 2. 확정된 제품 결정

사용자가 명시적으로 확정한 항목이다. 구현 중 이 전제를 바꾸지 않는다.

| # | 항목 | 결정 |
|---|---|---|
| 1 | 컨택 형태 | **요청 → 수락하면 채팅.** 목적이 담긴 컨택 요청 1건을 먼저 보내고, 상대 팀 운영진이 수락하면 그때 대화방이 열린다 |
| 2 | 수신자 | **팀장 + 운영진 전원** (`owner` + `manager`). 특정 1인이 아니라 권한 있는 사람 누구나 보고 답한다 |
| 3 | 진입점 | **팀 상세 페이지에만.** 팀 목록·검색·팀매칭 공고에는 이번에 넣지 않는다 |
| 4 | 남용 방지 | **3종 전부** — (a) 기본 가드 (b) 차단·신고 (c) 팀 수신 설정 |
| 5 | "모집 중"의 정의 | **이 팀이 host인 `V1TeamMatch` 중 `status='recruiting'`인 것이 있을 때** (= 경기 상대를 구하는 중). 팀원 모집(`joinPolicy`)이 아니다 |
| 6 | `contactPolicy` 기본값 | **`open`** (옵트아웃). 끄고 싶은 팀만 끈다 |
| 7 | 하루 발송 한도 | **10건 / 24시간 rolling** (`fromTeamId` 기준) |
| 8 | 철회(withdraw) | **Phase 1에 포함** |

---

## 3. 실측된 코드베이스 제약

설계는 아래 사실 위에 세워졌다. 구현 중 이와 다른 것을 발견하면 **즉시 멈추고 이 문서를 고친다.**

> **검증 상태 (2026-08-20)**: 아래 인용 중 서브에이전트 보고에 의존하던 5건을 직접 열어 확인했다.
> `chat.service.ts` 권한 검증 / `chat-entitlement.ts` 분기 구조 / `notifications.service.ts` 5개 딕셔너리 /
> `team-matches-client.tsx`의 `message: null` — **4건 그대로 확인.**
> `teams-page.tsx` CTA 레이아웃 — **1건 교정** (§3.5).
> 이 과정에서 §3.1의 **fall-through 함정**을 새로 발견해 추가했다.

### 3.1 채팅

- `V1ChatRoom`의 링크 컬럼 3개(`matchId`/`teamId`/`teamMatchId`)는 각각 `@unique`. 방을 여는 유일한 진입점은 `POST /chat/rooms/resolve` (get-or-create).
- `chat.dto.ts`의 `ResolveChatRoomDto.targetType`과 `ChatRoomsQueryDto.roomType` 두 곳이 `@IsIn(['match','team','team_match'])`로 고정돼 있다.
- `chat-entitlement.ts`의 `currentChatEntitlementWhere` / `currentChatRecipientEntitlementWhere`가 방 접근 자격과 알림 수신 자격을 Prisma `where`로 빌드한다. 두 함수의 분기 방식이 **서로 다르고, 이 차이가 함정이다**:

  | 함수 | 분기 방식 | 4번째 타입 추가 시 |
  |---|---|---|
  | `currentChatEntitlementWhere` | `OR: [match, team, teamMatch]` 배열 | 배열에 4번째 항목 추가 — **순수 additive, 안전** |
  | `chat.service.ts`의 `assertCurrentRoomEntitlement` | `if(matchId) / if(teamId) / if(teamMatchId) / throw` | 마지막에 `throw`가 있어 **누락 시 크게 실패 — 안전** |
  | `currentChatRecipientEntitlementWhere` | `if(matchId) / if(teamId) / **가드 없이 teamMatch로 fall-through**` | **위험** |

  **함정의 정확한 동작**: `currentChatRecipientEntitlementWhere`의 마지막 분기는 `if (room.teamMatchId)` 가드가 **없다.** `room.teamMatch?.hostTeamId`와 `approvedApplicantTeamId`를 `.filter(Boolean)`으로 모아 `teamId: { in: teamIds }`를 만든다. `team_contact` 방이 여기 도달하면 `teamIds`가 **빈 배열**이 되어 `in: []` — 즉 **아무에게도 매칭되지 않는다.** 예외가 나지 않고 조용히 수신자 0명이 되므로, 컨택 채팅 메시지의 알림이 **소리 없이 사라진다.**

  **필수 조치**: Phase 1에서 이 fall-through를 **명시적 `if (room.teamMatchId) { ... }` 가드로 바꾸고, 마지막에 `throw`를 둔다.** 4번째 분기를 추가하는 것만으로는 부족하다 — 기존 fall-through 자체를 먼저 닫아야 한다.

  또한 `ChatEntitlementRoom` 타입(`matchId`/`teamId`/`teamMatchId`/`teamMatch`)과 `assertCurrentRoomEntitlement`의 파라미터 타입 둘 다 `teamContactId` + `teamContact` 관계를 포함하도록 넓혀야 한다.
- `resolveTeamRoom` / `resolveTeamMatchRoom`은 각각 6줄짜리 `findUnique → 없으면 create → ensureResolvedParticipant → 반환` 형태다. `resolveTeamContactRoom`은 이 모양을 그대로 복제하면 된다.
- `stateConflict(message, code='STATE_CONFLICT')` / `validationError(message, field)`는 **export되지 않은 파일 로컬 함수**다 (`chat.service.ts` 말미). 같은 함수가 `matches.service.ts` / `team-matches.service.ts` / `teams.service.ts` **4개 파일에 각각 로컬로 중복 정의**돼 있다. `TeamContactsService`도 이 관례대로 자기 파일에 로컬 정의를 둔다 — 공용화는 이번 범위가 아니다.

#### `team_contact` 추가 시 손대야 할 지점 — 전수 목록

**빠뜨려도 컴파일은 통과하고 런타임에 조용히 틀리는 것이 대부분이다.** 아래를 체크리스트로 쓴다.

| # | 파일:줄 | 현재 형태 | 빠뜨리면 |
|---|---|---|---|
| 1 | `dto/chat.dto.ts:6, :26` | `@IsIn(['match','team','team_match'])` ×2 | 400 `VALIDATION_FAILED` — **시끄럽게 실패, 안전** |
| 2 | `chat.service.ts:72-83` `resolve()` | `if match / if team / **암묵 fallback**` | `team_contact` 요청이 team_match 로직으로 **조용히 오처리** |
| 3 | `chat.service.ts:52-54` `rooms()` where | roomType별 3조건 | 목록 필터가 안 먹힘 |
| 4 | `chat-entitlement.ts:15-64` `currentChatEntitlementWhere` | `OR: [3개]` | 그 방이 목록에서 **통째로 사라짐** |
| 5 | `chat-entitlement.ts:66-105` `currentChatRecipientEntitlementWhere` | `if/if/**암묵 fallback**` | **알림 수신자 0명, 무성 실패** ← 가장 위험 |
| 6 | `chat.service.ts:385-393` `assertCurrentRoomEntitlement` | `if×3 + throw` | 403 — **시끄럽게 실패, 안전** |
| 7 | `chat.service.ts:490-502` `roomInclude()` | relation include | 제목/링크가 `undefined` |
| 8 | `chat.service.ts:24-36` `RoomWithRelations` 타입 | `Prisma.V1ChatRoomGetPayload` | tsc 실패 — **안전** |
| 9 | `chat.service.ts:~550` `getRoomType()` | 말미 `return 'team_match'` | 방 종류 **오분류** |
| 10 | `chat.service.ts:~556` `getRoomTitle()` | `?? '채팅'` nullish chain | 제목이 **"채팅"으로 표시** |
| 11 | `chat.service.ts:~560` `getLinkedTarget()` | `if×3 + { type: null }` | 링크 없음 |
| 12 | `chat.service.ts:337-374` | `assertCanUse*Chat` ×3 | `assertCanUseTeamContactChat` **신규 작성 필요** |
| 13 | `chat.service.ts:316-335` | `resolve*Room` ×3 | `resolveTeamContactRoom` **신규 작성 필요** |
| 14 | `schema.prisma` V1ChatRoom | 링크 FK 3개 | §5 참조 |

`ensureResolvedParticipant`(L415-431) / `ensureEntered`(L433-468) / `chat.controller.ts`는 `roomId`만 참조하므로 **수정 불필요**.
- **`team_match` 방은 이미 운영진 전용이다.** `assertCanUseTeamMatchChat`과 `currentChatEntitlementWhere`의 teamMatch 분기 모두 `role: { in: ['owner','manager'] }`를 건다. 초기 조사에서 "양 팀 전원"이라고 서술했으나 재검증 결과 틀렸다.
  → **결과: "컨택 대화방은 운영진 전용"이라는 요구는 기존 분기를 그대로 복제하면 충족된다. 새 권한 로직을 만들지 않는다.**
- `sendMessage()`는 트랜잭션으로 [메시지 생성 + `room.lastMessageAt` 갱신 + `V1Notification` 생성]을 함께 처리한다.
- `V1ChatRoomParticipant`: `status(active|left)`, `visibleFromAt`(입장 이전 메시지 숨김), `lastReadMessageId`, `mutedUntil`, `pinnedAt`.

### 3.2 v1_api에 실재하는 것 / 실재하지 않는 것

구버전(`apps/api`) 문서를 보고 잘못 인용하기 쉬운 지점이다. 아래는 grep으로 확인했다.

| 실재함 | 실재하지 않음 (v1_api에 0건) |
|---|---|
| `V1AuthGuard` (119곳 사용) | `JwtAuthGuard` |
| `AdminContextService` 기반 관리자 체크 | `AdminGuard` 클래스 |
| 서비스별 로컬 `assertCanManageTeam` (`team-matches.service.ts:199,372`) | `TeamMembershipService.assertRole` |
| 전역 `V1ThrottlerGuard` (`app.module.ts`) | `HostThrottlerGuard` |
| `V1IdempotencyRecord` 모델 | `@Cron` / `@nestjs/schedule` (**0건 — cron 인프라 자체가 없다**) |

- **동시성 관용구**: `team-matches.service.ts:385`가 `$transaction` 안에서 `pg_advisory_xact_lock(hashtextextended(<키>, 0))`으로 중복 생성을 막는다. 이 레포의 검증된 방식이다.
- **partial unique index 전례 없음**: 기존 마이그레이션 123개 전체에서 `CREATE UNIQUE INDEX ... WHERE` 0건. 새로 도입하지 않는다.

### 3.3 알림

- `NotificationEventType`은 **TS 문자열 유니온**(Prisma enum 아님) → 새 이벤트 추가에 마이그레이션 불필요.
- 손대야 할 곳은 6군데(유니온 + 5개)인데, **컴파일러가 잡아주는 것은 그중 2개뿐이다.** 나머지는 조용히 샌다:

  | 지점 | 형태 | 빠뜨리면 |
  |---|---|---|
  | `NotificationEventType` 유니온 (L15) | 타입 선언 | — (여기부터 추가) |
  | `EVENT_TITLES` (L216) | `Record<NotificationEventType, string>` | ✅ **컴파일 에러** |
  | `EVENT_BODIES` (L253) | `Record<NotificationEventType, string>` | ✅ **컴파일 에러** |
  | `preferenceFieldForEvent` (L70) | if 체인, 말미 `return 'activityEnabled'` | ⚠️ **조용히 `activityEnabled` 게이트로 샘** — 사용자가 팀 알림을 켜뒀는데 활동 알림을 껐으면 컨택 알림이 안 감 |
  | `targetTypeForEvent` (L121) | if 체인, 말미 `return 'team_match'` | ⚠️ **조용히 `team_match`로 샘** |
  | `deepLinkForEvent` (L181) | 특례 if + `deepLinkForTarget` 폴백 | ⚠️ 위 오염의 결과로 `/team-matches/{contactId}` 링크 생성 → **항상 404** |

  즉 유니온에 리터럴만 추가하고 `EVENT_TITLES`/`EVENT_BODIES`를 채우면 **tsc는 통과하지만 알림은 잘못된 설정으로 게이트되고 링크는 깨진다.** if 체인 2개를 반드시 함께 고쳐야 하고, 이를 검증하는 테스트가 필요하다.
- 각 if 체인은 도메인 그룹 순서(match → team_join/invitation/schedule → team_match → tournament)를 지키고 있다. `team_contact_*` 3개는 `teamEnabled`를 반환하는 team 그룹 조건 목록에 합류시킨다.
- `V1NotificationTargetType`은 **진짜 Prisma enum** (`match|team|team_match|chat|notice|system|tournament|inquiry`). 새 값이 필요하면 마이그레이션.
- 발송은 `NotificationsService.emitNotification` / `emitNotificationToMany` / `emitToManyDeferred` 경유. **DB 직접 INSERT 금지.**
- `team-matches.service.ts`의 private `emitNotificationToTeamManagers(teamIds[], ...)`가 `role in [owner,manager] && status='active'` 멤버십을 조회해 위임한다 — 그대로 복제한다.

### 3.4 스키마 게이트

`schema.prisma`를 건드리면 **파일 전체 바이트를 해시하는** `SOURCE_SNAPSHOT_DRIFT` 게이트가 걸린다. 게임 도메인을 안 건드려도 걸린다(`game-schema.fixture.ts` 주석에 과거 재핀 사례 3건 이상 기록됨). → **재핀 + 근거 주석이 필수 스텝이다.**

또한 CI의 "V1 migration replay + drift gate"가 ① 빈 DB에 마이그레이션 전체 체인 재생 ② `schema.prisma` 드리프트 0을 검증한다.

### 3.5 프론트 (`apps/v1_web`)

- 팀 상세: `components/teams/teams-page.tsx`의 `TeamDetailPageView`(L373~). 데스크톱은 `tm-team-detail-sidebar-cta`(L595 부근), 모바일은 `tm-fixed-cta tm-hide-desktop`(L716) — **양쪽 다 `tm-btn-block` 전폭 버튼 1개**이고 보조 버튼 슬롯이 없다. CTA 라벨은 `mode`(`mine`/`pending`/`closed`/그 외)로 갈린다.
  2단 그리드 패턴(`gridTemplateColumns: '1fr 2fr'`)은 **팀 상세가 아니라 팀 생성/수정 폼**의 `tm-team-form-cta`(L876)에 있다 — 거기서 **패턴만 빌려온다.**
  피드백 표시는 `runHeroAction` + `heroMessage`(`role="status"`)로 하고 있다. 컨택 CTA의 성공/실패 안내도 같은 방식을 쓴다.
- **v1_web에는 공용 Toast/Modal 컴포넌트가 없다** (구버전 `apps/web`과 다름). 페이지별 `heroMessage` 로컬 패턴을 쓴다.
- 모달 선례: `components/teams/jersey-number-dialog.tsx` (focus trap/ESC/aria), `components/v1-ui/confirm-modal.tsx`의 `useConfirm()`.
- 리스트+작성+상세 3페이지 선례: `app/my/inquiries` (list/new/[id]).
- 훅: `hooks/use-v1-api.ts` (단일 대형 파일), 쿼리키: `lib/query-keys.ts`의 `v1Keys`. 내 팀 목록은 `useV1MyTeams()` (`use-v1-api.ts:928`) — `useMyTeams()`는 존재하지 않는다.
- `isTeamOperatorRole`이 `teams-client.tsx:838`과 `my-api-clients.tsx:2172` **두 곳에 중복된 로컬 함수**다. 컨택이 3번째 소비처가 되므로 이번에 공유 유틸로 승격한다.

---

## 4. 검토한 대안과 트레이드오프

3개 안을 독립 설계 후 적대적으로 검증했다. 채택안만 적으면 왜 그랬는지 알 수 없으므로 탈락 이유를 함께 남긴다.

| | **A. 최소변경 (채택)** | B. 독립 모듈 (확장성) | C. 안전 우선 |
|---|---|---|---|
| 핵심 | `V1ChatRoom`에 4번째 링크 추가, 신고는 기존 `V1Inquiry` 재사용 | 채팅과 완전 분리된 자체 생애주기 모듈 | 전용 신고 모델 + 어드민 신고 큐 |
| 새 모델 | 2개 | 3개 + enum 5개 | 3개 + enum 4개 |
| 마이그레이션 | 1개, 순수 additive | 4개 + partial unique index(전례 없음) | 4개 + partial index + 정책 필드 오배치 |
| 작업 규모 | 백엔드 PR 1 + 프론트 PR 1~2 | PR 3 (모듈 2개 신설) | PR 5 |
| 결함 | 없음 | **인용한 가드 4종이 v1_api에 미실재 → 문서대로 구현하면 컴파일 불가** | 없음. 정확하지만 규모가 큼 |

### A안의 장점
- 새 모델 2개, 마이그레이션 1개. 요구사항의 실제 복잡도에 비례한다.
- 채팅 파이프라인을 한 줄도 새로 만들지 않는다 — 기존 3개 분기 옆에 4번째를 붙일 뿐이다.
- 신고에 새 모델·새 어드민 화면이 0개다. `V1Inquiry`에 `category='report'`, 폴리모픽 `relatedType/relatedId`, `received→reviewing→answered→closed` 워크플로가 **이미 전부 있다.**

### A안이 실제로 잃는 것 (정직한 단점)
- **신고 사유가 구조화되지 않는다.** `V1Inquiry.body` 자유서술로만 받으므로 "스팸/괴롭힘/허위팀" 같은 카테고리별 집계가 안 된다. 실사용 후 필요해지면 그때 필드를 얹는 편이, 안 쓰일 수도 있는 분류체계를 미리 만드는 것보다 낫다고 판단했다.
- **어드민 원클릭 조치가 없다.** 신고는 기존 문의 화면으로 접수되고, 실제 조치(차단은 `contact-blocks` API, 팀 정지는 별도 도구)는 관리자가 수동으로 연결해야 한다. C안의 `suspend_team`은 컨택 신고 하나로 팀 전체 활동을 막는 과잉조치 위험이 있어 의도적으로 제외했다.
- **컨택과 팀매치가 데이터상 연결되지 않는다.** "이 경기는 그 컨택에서 시작됐다"는 추적이 안 된다. 필요해지면 `originContactId` 한 컬럼으로 나중에 붙일 수 있다(Phase 4).

### B·C안에서 이식한 것
- **C안**: `contactPolicy` 3지 enum(2개 독립 boolean보다 `joinPolicy`와 결이 맞음), lazy-flip 만료(v1엔 cron이 0건이라 cron 전제가 틀렸음), 차단/미수신/모집중아님을 **동일 오류 문구**로 통일하는 프라이버시 설계.
- **B안 비판**: 같은 팀쌍이 accepted 이후 재요청→재수락하면 **채팅방이 여러 개로 파편화**되는 결함 지적. → 중복 체크 범위를 `requested`뿐 아니라 **`requested`+`accepted`, 양방향(from↔to)**으로 확장해 해결했다.
- **B안**: `isTeamOperatorRole` 공유 유틸 승격 제안.

---

## 5. 데이터 모델

```prisma
enum V1TeamContactStatus {
  requested
  accepted
  declined
  withdrawn
  expired
}

enum V1TeamContactPolicy {
  open              // 기본값 — 누구나 컨택 가능
  recruiting_only   // 이 팀이 host인 recruiting 상태 팀매치가 있을 때만
  closed            // 컨택 받지 않음
}

model V1TeamContact {
  id                String              @id @default(uuid())
  fromTeamId        String              @map("from_team_id")
  toTeamId          String              @map("to_team_id")
  requestedByUserId String              @map("requested_by_user_id")
  message           String                                      // 1~500자 (V1TeamMatchApplication.message와 동일 상한)
  status            V1TeamContactStatus @default(requested)
  respondedByUserId String?             @map("responded_by_user_id")
  respondedAt       DateTime?           @map("responded_at")
  declineReason     String?             @map("decline_reason")  // 200자 이하
  expiresAt         DateTime            @map("expires_at")      // createdAt + 7일
  createdAt         DateTime            @default(now()) @map("created_at")
  updatedAt         DateTime            @updatedAt @map("updated_at")

  fromTeam        V1Team      @relation("V1TeamContactFromTeam", fields: [fromTeamId], references: [id], onDelete: Cascade)
  toTeam          V1Team      @relation("V1TeamContactToTeam", fields: [toTeamId], references: [id], onDelete: Cascade)
  requestedByUser V1User      @relation("V1TeamContactRequestedBy", fields: [requestedByUserId], references: [id], onDelete: Restrict)
  respondedByUser V1User?     @relation("V1TeamContactRespondedBy", fields: [respondedByUserId], references: [id], onDelete: SetNull)
  chatRoom        V1ChatRoom?

  @@index([fromTeamId, toTeamId, status])  // 중복/파편화 체크 (정방향)
  @@index([toTeamId, status])              // 받은함 목록 + 역방향 중복 체크
  @@index([fromTeamId, createdAt])         // 일일 발송 한도 카운트
  @@map("v1_team_contacts")
}

model V1TeamContactBlock {
  id              String   @id @default(uuid())
  teamId          String   @map("team_id")           // 차단을 건 팀
  blockedTeamId   String   @map("blocked_team_id")   // 차단당한 팀
  createdByUserId String   @map("created_by_user_id")
  reason          String?
  createdAt       DateTime @default(now()) @map("created_at")

  team          V1Team @relation("V1TeamContactBlockOwner", fields: [teamId], references: [id], onDelete: Cascade)
  blockedTeam   V1Team @relation("V1TeamContactBlockTarget", fields: [blockedTeamId], references: [id], onDelete: Cascade)
  createdByUser V1User @relation(fields: [createdByUserId], references: [id], onDelete: Restrict)

  @@unique([teamId, blockedTeamId])
  @@index([blockedTeamId])
  @@map("v1_team_contact_blocks")
}
```

### 기존 모델 확장 (필드 추가만, 기존 필드/의미 변경 없음)

```prisma
model V1ChatRoom {
  // ... 기존 matchId / teamId / teamMatchId 그대로 ...
  teamContactId String?        @unique @map("team_contact_id")
  teamContact   V1TeamContact? @relation(fields: [teamContactId], references: [id], onDelete: Cascade)
}

model V1Team {
  // ... joinPolicy / membersVisible 등 그대로 — 정책 플래그는 V1Team 본체가 맞는 위치 ...
  // (V1TeamProfile은 logoUrl/description/activityNote 같은 서술형 프로필 전용)
  contactPolicy V1TeamContactPolicy @default(open) @map("contact_policy")

  contactRequestsSent     V1TeamContact[]      @relation("V1TeamContactFromTeam")
  contactRequestsReceived V1TeamContact[]      @relation("V1TeamContactToTeam")
  contactBlocksMade       V1TeamContactBlock[] @relation("V1TeamContactBlockOwner")
  contactBlocksReceived   V1TeamContactBlock[] @relation("V1TeamContactBlockTarget")
}

enum V1InquiryRelatedType {
  // ... 기존 값 전부 유지 ...
  team_contact   // 신고를 기존 문의 파이프라인에 연결하기 위한 값 1개만 추가
}
```

**`V1NotificationTargetType`은 변경하지 않는다.** 기존 `team` 값을 재사용한다.

### 의도적으로 걸지 않은 제약

`(fromTeamId, toTeamId)` 전체 unique 제약을 걸지 않는다. 걸면 거절/만료 후 재발송이 DB 레벨에서 영구 봉쇄된다. partial unique index(`WHERE status IN (...)`)로 우회할 수 있지만 이 레포에 전례가 0건이므로 도입하지 않는다. 대신 **advisory lock + 서비스 계층 체크**로 푼다(§8).

---

## 6. 상태 흐름

```
                       ┌─ accept(toTeam 운영진) ──► accepted ──(첫 resolve 호출 시 1회)──► 운영진 전용 채팅방
                       │
  requested ───────────┼─ decline(toTeam 운영진) ─► declined  ──┐
  (fromTeam 운영진 생성) │                                        │
                       ├─ withdraw(fromTeam 운영진) ► withdrawn ──┤── 같은 팀쌍 재발송 허용 (새 row)
                       │                                        │      일일 한도는 그대로 적용
                       └─ 7일 경과·무응답 (lazy-flip) ► expired ──┘


  requested 또는 accepted 상태에서 같은 팀쌍(양방향)으로 새 요청 시도
      ──► 409 TEAM_CONTACT_ALREADY_ACTIVE (새 row 차단, 기존 건으로 안내)
```

- **`accepted`는 사실상 종단 상태다.** 채팅이 열린 뒤 컨택 자체를 되돌리지 않는다. 대화를 그만두려면 기존 채팅방의 `leave`를 쓴다(신규 API 불필요).
- **만료는 lazy-flip이다.** v1_api에 cron 인프라가 없으므로(§3.2), `team-matches.service.ts`의 `getApiStatus()`류 패턴대로 **읽는 시점에** `expiresAt < now && status='requested'`면 `expired`로 간주해 응답하고, 같은 트랜잭션에서 실제 컬럼도 갱신한다. 목록 조회와 중복 체크가 동일한 판정을 쓰도록 판정 함수를 한 곳에 둔다.
- **`withdraw`는 알림을 보내지 않는다.** 상대가 아직 반응하지 않은 상태라 알림이 소음이 된다.

---

## 7. 엔드포인트

| 메서드 | 경로 | 권한 | 요청/응답 핵심 |
|---|---|---|---|
| POST | `/teams/:teamId/contacts` | 호출자가 body `fromTeamId`의 owner/manager (`:teamId`=받는 팀) | body `{ fromTeamId, message(1~500) }`. 활성 관계 존재 시 409 `TEAM_CONTACT_ALREADY_ACTIVE { existingContactId, existingStatus }` |
| GET | `/teams/:teamId/contacts?direction=inbound\|outbound&status=&cursor=&limit=` | `:teamId` owner/manager | cursor 페이지네이션 |
| GET | `/team-contacts/:id` | fromTeam **또는** toTeam owner/manager | 상세 |
| PATCH | `/team-contacts/:id/accept` [idempotent] | toTeam owner/manager | 이미 accepted면 `alreadyProcessed: true` |
| PATCH | `/team-contacts/:id/decline` [idempotent] | toTeam owner/manager | body `{ reason?(200자 이하) }` |
| POST | `/team-contacts/:id/withdraw` [idempotent] | fromTeam owner/manager | 알림 없음 |
| POST | `/teams/:teamId/contact-blocks` | `:teamId` owner/manager | body `{ blockedTeamId, reason? }` |
| GET | `/teams/:teamId/contact-blocks` | `:teamId` owner/manager | |
| DELETE | `/teams/:teamId/contact-blocks/:blockedTeamId` | `:teamId` owner/manager | |
| PATCH | `/teams/:teamId/contact-policy` | `:teamId` owner/manager | body `{ contactPolicy }` — **전용 좁은 엔드포인트** |
| POST | `/chat/rooms/resolve` (기존, 분기만 추가) | 기존 가드 | `{ targetType: 'team_contact', targetId: contactId }` |
| POST | `/my/inquiries` (기존, 변경 없음) | 로그인 | 프론트가 `category='report'`, `relatedType='team_contact'`, `relatedId=contactId`를 프리필 |

### 설계 근거

- **`contact-policy`를 팀 전체 `PATCH /teams/:teamId`에 넣지 않는 이유**: 팀 전체 편집은 optimistic lock(`version`)을 쓴다. 수신 설정 토글이 무관한 동시 편집과 충돌하면 안 된다. `PATCH /notifications/preferences`가 이미 같은 이유로 분리돼 있으므로 그 선례를 따른다.
- **경로 파라미터를 신뢰하지 않는다.** 모든 `:teamId` 검증은 `userId → 해당 팀 active owner/manager membership` 존재를 서버가 매번 재조회한다. `assertCanManageTeam` 로컬 패턴을 `TeamContactsService`에 복제한다(v1_api엔 공용 권한 서비스가 없다 — §3.2).

---

## 8. 남용 방지 3종

### (a) 기본 가드

**중복·파편화 방지** — 새 DB 제약 없이 advisory lock으로 해결한다:

```
$transaction 내부:
  SELECT pg_advisory_xact_lock(hashtextextended('team-contact:' || <작은쪽teamId> || ':' || <큰쪽teamId>, 0))
  → status IN ('requested','accepted') 인 행이 양방향(from↔to) 어느 쪽으로든 있으면 생성 거부
```

락 키를 팀 id 쌍의 **정렬된 형태**로 만드는 것이 중요하다. A→B와 B→A가 동시에 들어와도 같은 락을 잡아야 양방향 체크가 실제로 상호배제된다.

**하루 발송 한도** — `fromTeamId` 기준 24시간 rolling window. `count(createdAt >= now - 24h) >= 10`이면 429 `TEAM_CONTACT_DAILY_LIMIT_EXCEEDED` + `Retry-After`. 숫자는 코드 상수이므로 조정에 마이그레이션이 필요 없다.

### (b) 차단·신고

- **차단**: `V1TeamContactBlock`, `@@unique([teamId, blockedTeamId])`. 발신 시 **양방향** 체크(내가 차단했거나 상대가 나를 차단했으면 실패).
- **실패 사유 통일**: 차단됨 / `contactPolicy='closed'` / `recruiting_only`인데 모집 중이 아님 — **전부 같은 응답**을 준다.
  `403 TEAM_CONTACT_NOT_ACCEPTING` + "이 팀은 지금 컨택을 받지 않고 있어요."
  → 응답 차이로 "우리가 차단당했구나"를 역추론할 수 없게 한다.
- **신고**: 새 모델 0개. `V1Inquiry(category='report', relatedType='team_contact', relatedId=contactId)` 생성.
  처리도 기존 문의 워크플로(`received→reviewing→answered→closed`) 그대로.
- **신고 사유는 구조화한다** (2026-08-21 사용자 결정 — Phase 1 때의 "자유서술" 결정을 뒤집음).
  Phase 1 설계는 사유를 `V1Inquiry.body` 자유서술로만 받기로 했고, 그 트레이드오프로 **카테고리별 집계 불가**를
  명시했다. Phase 2 착수 시점에 재확인한 결과 "어느 팀이 무슨 사유로 몇 번 신고됐는지"를 볼 수 없으면
  운영이 대응할 근거가 없어, 사유를 enum 으로 받기로 했다.

  ```prisma
  enum V1InquiryReportReason {
    spam            // 반복·무관한 컨택
    harassment      // 모욕·괴롭힘
    impersonation   // 사칭·허위 팀
    inappropriate   // 부적절한 내용
    other
  }

  model V1Inquiry {
    // ... 기존 필드 유지 ...
    reportReason V1InquiryReportReason? @map("report_reason")

    @@index([reportReason, createdAt])   // "사유별 신고 추이" 집계용
  }
  ```

  **이 인덱스가 지원하는 것과 못 하는 것**(2026-08-21 리뷰에서 정정):
  - ✅ **사유별 추이** — "지난 30일 스팸 신고가 몇 건인가" 같은 전역 질의.
  - ❌ **팀별 롤업** — "어느 팀이 몇 번 신고됐는지"는 이 인덱스로 안 된다.
    `V1Inquiry.relatedId` 에는 **`contactId` 가 들어가지 `teamId` 가 들어가지 않기 때문**이다.
    팀별 집계를 하려면 `relatedType='team_contact'` 로 거른 뒤(기존 `@@index([relatedType, relatedId])` 가
    이 필터를 지원한다) `V1TeamContact` 를 조인해 `fromTeamId` 를 꺼내야 한다. 조인 자체는 정상 동작하고
    신고 건수 규모상 성능 문제도 아니지만, **인덱스 하나로 되는 일이 아니라는 점을 분명히 해 둔다.**
    어드민 화면에서 팀별 롤업이 실제로 필요해지면 그때 조인 쿼리를 짜거나 전용 인덱스를 검토한다.
  `V1Inquiry` 는 범용 문의 모델이라 enum 이름도 컨택 전용으로 좁히지 않는다 — 다른 신고 대상
  (매치·사용자 등)이 생겨도 같은 값을 재사용할 수 있다. nullable 이므로 기존 문의 행은 영향 없다.
- **여전히 안 하는 것**: 어드민 신고 화면에서 바로 차단·정지를 누르는 원클릭 조치는 이번에도 없다.
  실제 조치는 관리자가 `contact-blocks` API 나 별도 관리 도구로 수동 연결한다.

### (c) 수신 설정

- `V1Team.contactPolicy` (`open` / `recruiting_only` / `closed`), 기본 `open`.
- `recruiting_only` 판정: 요청 시점에 `EXISTS(V1TeamMatch WHERE hostTeamId = :toTeamId AND status = 'recruiting')` 실시간 서브쿼리. 별도 캐시 컬럼을 두지 않는다 — 캐시를 두면 공고 생성/마감 시 무효화 책임이 새로 생긴다.

---

## 9. 알림

| 이벤트 타입 | 수신자 | targetType | preference 필드 | deepLink |
|---|---|---|---|---|
| `team_contact_received` | toTeam owner/manager 전원 | `team` (재사용) | `teamEnabled` (재사용) | `/my/team-contacts/{contactId}` |
| `team_contact_accepted` | fromTeam owner/manager 전원 | `team` | `teamEnabled` | `/my/team-contacts/{contactId}` |
| `team_contact_declined` | fromTeam owner/manager 전원 | `team` | `teamEnabled` | `/my/team-contacts/{contactId}` |

- 이벤트 3개 리터럴을 `targetTypeForEvent` / `preferenceFieldForEvent` / `deepLinkForEvent` / `EVENT_TITLES` / `EVENT_BODIES` **5곳 모두**에 채운다.
- 기존 `team` targetType과 `teamEnabled`를 재사용하므로 **알림 쪽 마이그레이션이 0이다.**
- 수신자 해석은 `emitNotificationToTeamManagers` 패턴을 복제하고 `emitToManyDeferred`로 위임한다.
- 전용 preference 필드(`teamContactEnabled`)로 분리하는 것은 Phase 4로 미룬다 — 분리하려면 마이그레이션이 필요하고, 실사용 전에 필요한지 알 수 없다.

---

## 10. 프론트 화면

| 경로 | 하는 일 |
|---|---|
| `/teams/:id` (기존 확장) | 단일 CTA 옆에 "컨택 보내기" 보조 버튼. 기존 2단 그리드 패턴(`team-form-cta`, L876) 재사용. **노출 조건**: 방문자가 이 팀 멤버가 아니고, `useV1MyTeams()`로 필터한 owner/manager 팀이 1개 이상 |
| `/teams/:toTeamId/contact/new` | 발신 팀 선택(관리 팀이 2개 이상일 때만 노출) + 목적 메시지 입력(500자 카운터) + 제출 |
| `/my/team-contacts` | 받은/보낸 탭 리스트. `/my/inquiries` 리스트 레이아웃 재사용 |
| `/my/team-contacts/:id` | 상세 — 상태별 액션(수락/거절/철회), `accepted`면 "대화 열기"(→ resolve → `/chat/:roomId`), "신고하기"(→ `/my/inquiries/new` 프리필) |
| 팀 관리 화면 (기존 운영 탭 내) | 대기 중 인바운드 컨택 처리, "차단한 팀" 목록·해제, 컨택 수신 설정 3지선다 |

### 프론트 제약

- 공용 Toast/Modal이 없으므로 페이지별 `heroMessage` 로컬 패턴을 따른다. 새 공용 컴포넌트를 이번에 만들지 않는다.
- `isTeamOperatorRole`을 `teams-client.tsx` / `my-api-clients.tsx`의 중복 로컬 정의에서 공유 유틸로 승격한다(3번째 소비처가 생기므로).
- 디자인 규약: Tailwind v4 토큰 우선(하드코딩 색/간격 금지), 다크모드 필수, 터치 타겟 44px 이상, WCAG 2.1 AA, 컬러만으로 상태 전달 금지(상태 뱃지에 아이콘/텍스트 병기), 에러 메시지 해요체 + `extractErrorMessage` 사용.

---

## 11. Phase 분할

**원칙**: `SOURCE_SNAPSHOT_DRIFT` 게이트가 `schema.prisma` 전체 바이트를 해시하므로 스키마를 건드릴 때마다 재핀 비용이 붙는다. 이 비용을 세 번 내지 않도록 **Phase 1에서 3단계분 스키마를 한 번에** 넣고, 이후엔 코드만 얹는다.

각 Phase는 그 자체로 `dev` 머지 가능해야 한다(dev 머지 = alpha 즉시 실배포).

### Phase 1 — 코어 + 기본 가드(a)

- **스키마 (전체 확정, 이후 재핀 없음)**: `V1TeamContact`(status 5개 전부), `V1TeamContactBlock`, `V1ChatRoom.teamContactId`, `V1Team.contactPolicy`(Phase 3까지 미사용), `V1InquiryRelatedType.team_contact`(Phase 2까지 미사용) — **전부 이번 마이그레이션 1개에 포함.**
- 백엔드: `TeamContactsModule` (발신/목록/상세/수락/거절/철회), advisory lock 중복 방지, 일일 한도 10건, lazy-flip 만료, chat 4번째 분기 3파일(`chat.dto.ts`/`chat.service.ts`/`chat-entitlement.ts`), 알림 3종.
  - **선행 작업**: `currentChatRecipientEntitlementWhere`의 fall-through를 명시적 가드로 닫는다(§3.1). 이걸 먼저 하지 않으면 4번째 분기를 추가해도 알림이 조용히 사라진다.
- 프론트: 팀 상세 CTA, `/teams/:toTeamId/contact/new`, `/my/team-contacts` (목록+상세), `isTeamOperatorRole` 승격.
- **끝나면 동작하는 것**: 팀장/운영진이 팀 상세에서 다른 팀에 목적이 담긴 컨택을 보내고, 상대가 수락하면 운영진 전용 채팅이 열린다. 중복 대기·채팅방 파편화·일일 한도 방지가 전부 동작한다. → **확정 결정 1·2·3 + 남용방지(a) 충족.**

### Phase 2 — 차단·신고(b)

- **스키마 변경 있음(2026-08-21 정정)**: 신고 사유 구조화 결정으로 `V1InquiryReportReason` enum 과
  `V1Inquiry.reportReason` nullable 컬럼이 추가된다. 순수 additive 지만 `schema.prisma` 를 건드리므로
  **`SOURCE_SNAPSHOT` 재핀이 다시 필요하다**(Phase 1 §3.4 절차 동일).
- `contact-blocks` CRUD 3개, 발신 시 양방향 차단 체크, 신고는 `/my/inquiries/new` 프리필 연결.
- 프론트: 팀 관리 화면 "차단한 팀" 섹션, 컨택 상세의 "신고하기".
- **끝나면 동작하는 것**: 팀이 특정 팀을 차단해 상호 컨택을 막을 수 있고, 부적절한 컨택을 기존 문의 파이프라인으로 신고할 수 있다. → **남용방지(b) 충족.**

### Phase 3 — 수신 설정(c)

- 스키마 변경 없음(컬럼은 Phase 1 에서 선반영됨). `PATCH /teams/:teamId/contact-policy` + `recruiting_only` 서브쿼리 판정.
- 프론트: 팀 관리 화면 수신 설정 3지선다.
- **끝나면 동작하는 것**: 팀이 컨택을 끄거나 "모집 중일 때만 받기"로 제한할 수 있다. → **확정 결정 전부(1~8) 충족.**

> **2026-08-21 결정**: Phase 2 와 3 을 **한 PR 로** 진행한다. 둘 다 팀 관리 화면에 UI 가 붙고 서로 인접해서,
> 나눠서 하면 같은 화면 구성을 두 번 고민하게 된다. 대신 PR 이 커지는 것은 감수한다.

### Phase 4 — 운영 고도화 (선택, 확정 범위 밖)

alpha 실사용 데이터를 본 뒤 필요하면:
- 일일 한도·만료 일수 조정 (코드 상수 변경만, 마이그레이션 불필요)
- 신고 다발 팀쌍 어드민 일괄 차단 도구
- 컨택 전용 preference 필드 분리 (마이그레이션 필요 — 이때 Phase 1 이후 처음으로 재핀 발생)
- 거절 후 재발송 쿨다운
- `originContactId`로 컨택 → 팀매치 연결 추적

---

## 12. 곁다리 발견 — 이 설계의 범위 밖

`V1TeamMatchApplication.message`(500자)가 백엔드에 있는데 `team-matches-client.tsx:290`이 `message: null`로 하드코딩해 죽어 있다. **프론트 입력 폼 하나만 추가하면 "매치 신청하면서 한마디"가 살아난다.**

이건 컨택 기능과 다른 물건이다(신청 시 1회성 메모 vs 신청 전 양방향 대화). 다만 비용이 극히 낮으므로 별도 작업으로 다룰 가치가 있다. **이 설계에는 포함하지 않는다.**

---

## 13. 위험과 미해결 사항

| 위험 | 내용 | 완화 |
|---|---|---|
| 스키마 게이트 | `schema.prisma` 수정 시 `SOURCE_SNAPSHOT_DRIFT` 발생 | Phase 1에서 한 번만 건드리고 재핀 + 근거 주석. Phase 2·3은 스키마 무변경 |
| 마이그레이션 replay | CI가 빈 DB에 전체 체인을 재생 | 순수 additive 마이그레이션만 사용. enum 값 추가는 같은 마이그레이션에서 즉시 사용하지 않음 |
| 권한 위조 | `:teamId` 경로 파라미터 신뢰 | 서버가 매번 membership 재조회. 소유권 이전·역할 해제가 즉시 반영되도록 스냅샷이 아닌 실시간 조회 |
| 채팅방 파편화 | 같은 팀쌍의 accepted 컨택이 여러 개 생기면 방이 갈림 | 중복 체크에 `accepted` 포함 + 양방향 + advisory lock |
| alpha 즉시 배포 | dev 머지가 곧 실배포 | Phase 단위로 자체 완결성 확보. 미완성 UI를 노출하는 중간 상태를 만들지 않음 |
| **알림 무성 실패** | `currentChatRecipientEntitlementWhere`의 fall-through 때문에 `team_contact` 방의 알림 수신자가 예외 없이 0명이 될 수 있음 (§3.1) | fall-through를 명시적 가드 + `throw`로 교체하는 것을 **Phase 1의 첫 작업**으로. 수신자 0명이 되면 실패하는 테스트를 함께 작성 |
| **알림 설정 오염** | `preferenceFieldForEvent`/`targetTypeForEvent`의 폴백 때문에 tsc는 통과하는데 알림이 잘못된 preference로 게이트되고 딥링크가 404 (§3.3) | 두 함수의 반환값을 직접 단언하는 유닛 테스트를 이벤트 3종 각각에 작성 |
| **통합테스트 무성 누락** | `jest.config.ts`의 integration 프로젝트는 `testMatch` 글롭을 **디렉터리마다 명시 등록**한다. 새 `test/team-contacts/` 를 등록하지 않으면 스펙이 디스크엔 있어도 CI가 **절대 실행하지 않는다** (같은 실수가 이 레포에서 4회 반복 지적됨 — 설정 파일 주석에 기록) | 통합 스펙을 만드는 커밋에서 `jest.config.ts`에 글롭을 함께 등록하고, 등록 직후 `--selectProjects integration --listTests`로 실제 선택되는지 확인 |

**미해결 사항: 없음.** §2의 8개 항목이 모두 확정됐다.

---

## 14. 검증 계획 (구현 시)

- **백엔드 유닛**: advisory lock 중복 방지(동시 2건 → 1건만 성공), 양방향 차단 체크, 일일 한도 경계(10건째 성공/11건째 429), lazy-flip 만료 판정, 권한 매트릭스(member는 전 경로 거부).
- **통합**: 요청 → 수락 → resolve → 메시지 전송 전체 흐름 1개. `alreadyProcessed` 멱등 응답.
- **프론트**: 팀 상세 CTA 노출 조건(비멤버 + 관리 팀 보유), 상태별 액션 버튼 분기.
- **시각 검증(필수)**: UI 변경이므로 📱390 / 📲768 / 🖥1440 3폭 스크린샷 갤러리를 PR 코멘트로 첨부. 라이트/다크 양쪽.
- **alpha 실측**: dev 머지 후 alpha에서 실제 두 팀 계정으로 요청→수락→채팅 왕복 1회.

과잉 검증은 피한다 — Phase 2·3의 스키마 무변경 코드 추가에는 해당 계약을 증명하는 가장 좁은 테스트만 붙인다.
