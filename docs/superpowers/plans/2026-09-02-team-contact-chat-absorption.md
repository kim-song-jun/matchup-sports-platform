# 팀 컨택 채팅 흡수 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 팀 컨택 요청을 그 시점에 열리는 `team_contact` 채팅방으로 만들고, 수락/거절/철회를 채팅방 안에서 처리하며, 마이 메뉴·팀 관리 메뉴에서 채팅으로 가는 입구를 만든다.

**Architecture:** 컨택 상태의 정본은 그대로 `V1TeamContact.status` 다. `TeamContactsService.create()` 트랜잭션이 방·참가자(양 팀 운영진 전원)·첫 메시지를 함께 만들고, `ChatService` 는 컨택 방의 전송을 `accepted` 일 때만 허용한다. 프론트는 채팅방 상단의 상태 카드에서 액션을 호출하고, 전용 컨택함 화면은 리다이렉트 페이지로 대체한다. 스키마 변경 없음, 데이터 백필 마이그레이션 1개.

**Tech Stack:** NestJS 11 + Prisma 6 (apps/v1_api), Next.js 16 + React 19 + TanStack Query 5 + Vitest (apps/v1_web), Jest 30 (unit/integration).

**Spec:** `docs/superpowers/specs/2026-09-02-team-contact-chat-absorption-design.md`

## Global Constraints

- 작업 위치: worktree `.claude/worktrees/team-contact-chat` (브랜치 `feat/v1-team-contact-chat`, base `origin/dev`). 커밋은 항상 `git commit -m "..." -- <경로>` pathspec 으로.
- `prisma generate` 금지(공유 node_modules). 새 Prisma 타입이 필요하면 로컬 union 타입으로 대체(기존 `TeamContactStatus` 관례).
- 스키마(`schema.prisma`) 변경 금지 — 마이그레이션은 데이터 SQL 만.
- 프론트 테스트는 `cd apps/v1_web && ./node_modules/.bin/vitest run <파일>` 로 앱 디렉터리 안에서 실행.
- 백엔드 unit: `cd apps/v1_api && ./node_modules/.bin/jest <파일>`.
- UI 문구는 해요체. 에러는 `extractErrorMessage(err, '…해요')`. 상태 배지는 아이콘/텍스트 병기. 터치 타겟 44px.
- `apps/v1_web/src` 변경이 있으므로 push 전 changeset 파일 필수(`.changeset/team-contact-chat-absorption.md`).
- 에러 코드 신규: `TEAM_CONTACT_NOT_ACCEPTED`(409).

---

### Task 1: 컨택 생성이 채팅방·참가자·첫 메시지를 함께 만든다

**Files:**
- Modify: `apps/v1_api/src/team-contacts/team-contacts.service.ts:70-153`
- Test: `apps/v1_api/src/team-contacts/team-contacts.service.spec.ts`

**Interfaces:**
- Produces: `create()` 반환 `{ ...contactRow, chatRoomId: string, route: '/chat/{roomId}' }`. 409 `TEAM_CONTACT_ALREADY_ACTIVE` details `{ existingContactId, existingStatus, existingChatRoomId: string | null }`.
- Produces: private `operatorUserIds(tx, teamIds: string[]): Promise<string[]>` — 양 팀 owner/manager 활성 userId 중복 제거.

- [ ] **Step 1: 실패하는 테스트 추가** — `describe('TeamContactsService.create')` 끝에:

```ts
  it('생성 트랜잭션 안에서 채팅방·양 팀 운영진 참가자·첫 메시지를 함께 만든다', async () => {
    const prisma = makePrisma();
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'm1' });
    prisma.v1TeamMembership.findMany.mockResolvedValue([
      { userId: 'u1' }, { userId: 'u2' }, { userId: 'u2' }, // 중복 1개
    ]);
    prisma.v1TeamContact.findFirst.mockResolvedValue(null);
    prisma.v1TeamContact.count.mockResolvedValue(0);
    prisma.v1TeamContact.create.mockResolvedValue({ id: 'c1', fromTeamId: 'A', toTeamId: 'B', status: 'requested' });
    prisma.v1ChatRoom.create.mockResolvedValue({ id: 'room-1' });
    const service = new TeamContactsService(prisma, makeNotifications());

    const result = await service.create(actor, 'B', dto);

    expect(result).toMatchObject({ id: 'c1', chatRoomId: 'room-1', route: '/chat/room-1' });
    expect(prisma.v1ChatRoom.create).toHaveBeenCalledWith({ data: { teamContactId: 'c1', status: 'active' } });
    const participantRows = prisma.v1ChatRoomParticipant.createMany.mock.calls[0][0].data;
    expect(participantRows.map((row: any) => row.userId).sort()).toEqual(['u1', 'u2']);
    expect(participantRows.every((row: any) => row.visibleFromAt instanceof Date)).toBe(true);
    expect(prisma.v1ChatMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ chatRoomId: 'room-1', senderUserId: 'u1', body: dto.message, messageType: 'text' }),
      }),
    );
    expect(prisma.v1ChatRoom.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'room-1' }, data: { lastMessageAt: expect.any(Date) } }),
    );
    // 알림은 roomId 로 간다 (딥링크가 /chat/{roomId})
    expect(service['notifications'].emitToManyDeferred).toHaveBeenCalledWith(
      expect.any(Function), 'team_contact_received', 'room-1', undefined,
    );
  });

  it('진행 중인 컨택이 있으면 그 방 id 도 함께 알려준다', async () => {
    const prisma = makePrisma();
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'm1' });
    prisma.v1TeamContact.findFirst.mockResolvedValue({ id: 'existing', status: 'requested', chatRoom: { id: 'room-9' } });
    const service = new TeamContactsService(prisma, makeNotifications());

    await expect(service.create(actor, 'B', dto)).rejects.toMatchObject({
      response: { code: 'TEAM_CONTACT_ALREADY_ACTIVE', details: { existingContactId: 'existing', existingChatRoomId: 'room-9' } },
    });
  });
```

`makePrisma()` 에 추가:

```ts
    v1TeamMembership: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    v1ChatRoom: { create: jest.fn().mockResolvedValue({ id: 'room-1' }), update: jest.fn(), findUnique: jest.fn() },
    v1ChatRoomParticipant: { createMany: jest.fn() },
    v1ChatMessage: { create: jest.fn().mockResolvedValue({ id: 'msg-1', sentAt: new Date() }) },
```

기존 create 테스트들은 `v1TeamContact.create` 의 mockResolvedValue 가 `fromTeamId/toTeamId` 를 안 가진 경우가 있다 — 그런 케이스는 `{ id: 'new', status: 'requested', fromTeamId: 'A', toTeamId: 'B' }` 로 보강한다.

- [ ] **Step 2: 실패 확인** — `cd apps/v1_api && ./node_modules/.bin/jest src/team-contacts/team-contacts.service.spec.ts -t '채팅방'` → FAIL (`v1ChatRoom.create` 미호출 / `chatRoomId` undefined).

- [ ] **Step 3: 구현** — `create()` 의 트랜잭션 안 `active` 조회에 `include: { chatRoom: { select: { id: true } } }` 를 추가하고 details 에 `existingChatRoomId: active.chatRoom?.id ?? null`. `return tx.v1TeamContact.create(...)` 를 아래로 교체:

```ts
      const contact = await tx.v1TeamContact.create({
        data: { fromTeamId: dto.fromTeamId, toTeamId, requestedByUserId: user.id, message: dto.message, expiresAt },
      });
      // 컨택 = 채팅방. 요청 시점에 방을 열고 양 팀 운영진 전원을 참가자로 넣는다(스펙 §3.2).
      // visibleFromAt 을 now 로 두어 "들어왔습니다" 시스템 메시지 없이 첫 메시지가 바로 보이고,
      // 수신자에게 미읽음 1 로 잡힌다.
      const room = await tx.v1ChatRoom.create({ data: { teamContactId: contact.id, status: 'active' } });
      const operatorIds = await this.operatorUserIds(tx, [dto.fromTeamId, toTeamId]);
      await tx.v1ChatRoomParticipant.createMany({
        data: operatorIds.map((userId) => ({ chatRoomId: room.id, userId, status: 'active', visibleFromAt: now })),
        skipDuplicates: true,
      });
      const firstMessage = await tx.v1ChatMessage.create({
        data: { chatRoomId: room.id, senderUserId: user.id, body: dto.message, status: 'sent', messageType: 'text', sentAt: now },
      });
      await tx.v1ChatRoom.update({ where: { id: room.id }, data: { lastMessageAt: firstMessage.sentAt } });
      return { ...contact, chatRoomId: room.id, route: `/chat/${room.id}` };
    });
    this.notifyTeamManagers(created.toTeamId, 'team_contact_received', created.chatRoomId);
    return created;
```

`private async operatorUserIds(tx: Prisma.TransactionClient, teamIds: string[])`:

```ts
  private async operatorUserIds(tx: Prisma.TransactionClient, teamIds: string[]) {
    const rows = await tx.v1TeamMembership.findMany({
      where: { teamId: { in: teamIds }, status: 'active', role: { in: ['owner', 'manager'] } },
      select: { userId: true },
    });
    return Array.from(new Set(rows.map((row) => row.userId)));
  }
```

- [ ] **Step 4: 통과 확인** — 같은 명령 전체 파일 실행 → PASS (기존 케이스 포함).
- [ ] **Step 5: 커밋** — `git commit -m "feat(v1-team-contacts): 컨택 생성 시 채팅방·운영진 참가자·첫 메시지를 함께 만든다" -- apps/v1_api/src/team-contacts/team-contacts.service.ts apps/v1_api/src/team-contacts/team-contacts.service.spec.ts`

---

### Task 2: 응답(수락/거절/철회)이 시스템 메시지를 남기고, 알림이 채팅방으로 간다

**Files:**
- Modify: `apps/v1_api/src/team-contacts/team-contacts.service.ts:167-229`
- Modify: `apps/v1_api/src/notifications/notifications.service.ts` (targetType 매핑 ~:251, `deepLinkForEvent` ~:354)
- Test: `apps/v1_api/src/team-contacts/team-contacts.service.spec.ts`, `apps/v1_api/src/notifications/notifications.service.spec.ts:529-540`

**Interfaces:**
- Produces: `accept/decline/withdraw` 반환 `{ contact, alreadyProcessed, chatRoomId: string | null }`.
- Produces: 시스템 메시지 본문 상수 `CONTACT_SYSTEM_MESSAGE = { accepted: '컨택을 수락했어요', declined: '컨택을 거절했어요', withdrawn: '컨택을 철회했어요' }`.

- [ ] **Step 1: 실패하는 테스트** — service spec 의 respond 계열 describe 에:

```ts
  it('수락하면 방에 시스템 메시지를 남기고 lastMessageAt 을 갱신하며 roomId 로 알림을 보낸다', async () => {
    const prisma = makePrisma();
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'm1' });
    const contact = { id: 'c1', fromTeamId: 'A', toTeamId: 'B', status: 'requested', expiresAt: new Date(Date.now() + 86400000) };
    prisma.v1TeamContact.findUnique.mockResolvedValue(contact);
    prisma.v1TeamContact.updateMany.mockResolvedValue({ count: 1 });
    prisma.v1TeamContact.findUniqueOrThrow.mockResolvedValue({ ...contact, status: 'accepted' });
    prisma.v1ChatRoom.findUnique.mockResolvedValue({ id: 'room-1' });
    const notifications = makeNotifications();
    const service = new TeamContactsService(prisma, notifications);

    const result = await service.accept(actor, 'c1');

    expect(result).toMatchObject({ alreadyProcessed: false, chatRoomId: 'room-1' });
    expect(prisma.v1ChatMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ chatRoomId: 'room-1', messageType: 'system', body: '컨택을 수락했어요' }) }),
    );
    expect(prisma.v1ChatRoom.update).toHaveBeenCalled();
    expect(notifications.emitToManyDeferred).toHaveBeenCalledWith(expect.any(Function), 'team_contact_accepted', 'room-1', undefined);
  });
```

notifications spec 529-540 의 단언을 `targetType: 'chat'`, `deepLink: '/chat/contact-1'` 로 바꾸고 it 제목을 `"targetType 이 'chat' 이고 딥링크가 /chat/{roomId} 로 간다"` 로.

- [ ] **Step 2: 실패 확인** — 두 spec 실행 → FAIL.
- [ ] **Step 3: 구현**
  - `respond()`: `updateMany` 를 `this.prisma.$transaction(async (tx) => {...})` 로 감싸고, count>0 이면 `const room = await tx.v1ChatRoom.findUnique({ where: { teamContactId: contactId }, select: { id: true } })`; room 이 있으면 시스템 메시지 create(`sentAt: new Date()`) + room update. 반환에 `chatRoomId: room?.id ?? null`. 멱등 반환 두 곳에도 `chatRoomId` 를 붙인다(findUnique 로 조회).
  - 알림: `this.notifyTeamManagers(contact.fromTeamId, ..., roomId ?? contactId)` — roomId 없는 레거시 행은 백필 후 없지만 방어.
  - `notifications.service.ts`: targetType 매핑에서 `team_contact_*` 3개를 `'team'` 분기에서 빼고 `'chat'` 을 돌려주는 분기에 넣는다(기존 `chat` 반환 분기가 없으면 `if (type.startsWith('team_contact_')) return 'chat';` 를 `team` 분기 **앞**에 둔다). `deepLinkForEvent` 컨택 분기는 `` `/chat/${targetId}` `` 로.
- [ ] **Step 4: 통과 확인** — 두 spec PASS.
- [ ] **Step 5: 커밋** — `git commit -m "feat(v1-team-contacts): 수락·거절·철회를 방 시스템 메시지로 남기고 알림을 채팅방으로 보낸다" -- apps/v1_api/src/team-contacts/team-contacts.service.ts apps/v1_api/src/team-contacts/team-contacts.service.spec.ts apps/v1_api/src/notifications/notifications.service.ts apps/v1_api/src/notifications/notifications.service.spec.ts`

---

### Task 3: 채팅 서비스 — 자격 완화, 전송 게이트, teamContact 블록

**Files:**
- Modify: `apps/v1_api/src/chat/chat-entitlement.ts:72-82`
- Modify: `apps/v1_api/src/chat/chat.service.ts` (`rooms`, `detail`, `sendMessage`, `resolveTeamContactRoom`, `assertCanUseTeamContactChat`, `roomInclude`, `toRoomListItem`, `getLinkedTarget`)
- Test: `apps/v1_api/src/chat/chat-entitlement.spec.ts`, `apps/v1_api/src/chat/chat-room-shape.spec.ts`, Create `apps/v1_api/src/chat/chat.service.team-contact.spec.ts`

**Interfaces:**
- Produces: 방 목록 항목/상세에 `teamContact?: { contactId, status, expiresAt, declineReason, mySide: 'from'|'to', fromTeam: {id,name}, toTeam: {id,name} }`.
- Produces: `getLinkedTarget(room, counterpartTeamId?)` — 컨택 방이면 `route: /teams/{counterpartTeamId}`.
- Produces: exported `contactDisplayStatus(status, expiresAt): status` (requested 이고 만료면 `'expired'`).

- [ ] **Step 1: 실패하는 테스트**
  - `chat-entitlement.spec.ts`: 기존 team_contact 케이스에서 `status: 'accepted'` 가 **없어야** 함을 단언 (`expect(JSON.stringify(where)).not.toContain('"status":"accepted"')`).
  - `chat-room-shape.spec.ts` "링크는 컨택 상세로 간다" → "링크는 상대 팀으로 간다": `getLinkedTarget({...}, 'B')` 의 `route` 가 `/teams/B`.
  - 새 `chat.service.team-contact.spec.ts` (mock prisma, `RealtimeGateway`/`WebPushService`/logger 는 `{}`/jest.fn 스텁):

```ts
function makeRoom(status: string, expiresAt = new Date(Date.now() + 86400000)) {
  return {
    id: 'room-1', status: 'active', matchId: null, teamId: null, teamMatchId: null, teamContactId: 'c1',
    match: null, team: null, teamMatch: null,
    teamContact: { id: 'c1', fromTeamId: 'A', toTeamId: 'B', status, expiresAt, declineReason: null, fromTeam: { id: 'A', name: '가팀' }, toTeam: { id: 'B', name: '나팀' } },
    participants: [{ id: 'p1', userId: 'u1', status: 'active', visibleFromAt: new Date(0), pinnedAt: null, mutedUntil: null, lastReadMessageId: null, user: { id: 'u1', profile: null } }],
    messages: [],
  };
}
it('컨택이 requested 면 전송을 409 TEAM_CONTACT_NOT_ACCEPTED 로 막는다', ...)   // sendMessage → rejects code
it('컨택이 accepted 면 전송이 통과한다', ...)                                     // $transaction 호출됨
it('requested 인데 만료 시각이 지났으면 expired 로 계산해 막는다', ...)
it('resolve 로 나중에 들어오는 운영진은 visibleFromAt 이 방 생성 시각이다', ...)   // v1ChatRoomParticipant.create data.visibleFromAt === room.createdAt
it('방 목록 항목에 teamContact 블록과 mySide 가 실린다', ...)                     // u1 이 A 의 owner 면 mySide 'from'
```

- [ ] **Step 2: 실패 확인** → FAIL.
- [ ] **Step 3: 구현**
  - `chat-entitlement.ts`: teamContact 분기에서 `status: 'accepted',` 줄 삭제.
  - `chat.service.ts`
    - `roomInclude().teamContact.select` 에 `status: true, expiresAt: true, declineReason: true` 추가. `RoomWithRelations` 타입도 동일.
    - `assertCanUseTeamContactChat`: `where: { id: teamContactId }` (status 조건 제거), 메시지 그대로.
    - `resolveTeamContactRoom`: `ensureResolvedParticipant` 대신 컨택 전용:
      ```ts
      const participant = await this.prisma.v1ChatRoomParticipant.findUnique({ where: { chatRoomId_userId: { chatRoomId: room.id, userId } } });
      if (!participant) await this.prisma.v1ChatRoomParticipant.create({ data: { chatRoomId: room.id, userId, status: 'active', visibleFromAt: room.createdAt } });
      else if (participant.status === 'left') await this.prisma.v1ChatRoomParticipant.update({ where: { id: participant.id }, data: { status: 'active', leftAt: null, lastReadMessageId: null, visibleFromAt: room.createdAt } });
      ```
    - `sendMessage`: `getActiveParticipantRoom` 직후
      ```ts
      if (room.teamContact) {
        const status = contactDisplayStatus(room.teamContact.status, room.teamContact.expiresAt);
        if (status !== 'accepted') throw stateConflict('수락한 뒤에 대화할 수 있어요.', 'TEAM_CONTACT_NOT_ACCEPTED');
      }
      ```
    - `private async contactSide(userId, contact)` → `'to'` 우선: toTeam 운영진이면 `'to'`, 아니면 `'from'` (findFirst membership).
    - `toRoomListItem` / `detail`: `teamContact` 블록 구성 + `linkedTarget: getLinkedTarget(room, counterpartTeamId)`.
    - `getLinkedTarget(room, counterpartTeamId?: string)`: teamContact 분기 route `` `/teams/${counterpartTeamId ?? room.teamContact.fromTeam.id}` ``.
    - `export function contactDisplayStatus(status: string, expiresAt: Date)`.
- [ ] **Step 4: 통과 확인** — 세 spec PASS. `./node_modules/.bin/tsc -p apps/v1_api/tsconfig.json --noEmit` 0.
- [ ] **Step 5: 커밋** — `git commit -m "feat(v1-chat): 컨택 방을 요청 시점부터 보이게 하고 전송은 수락 뒤에만 허용한다" -- apps/v1_api/src/chat/`

---

### Task 4: summary 엔드포인트 신설 + 목록·상세 엔드포인트 삭제

**Files:**
- Modify: `apps/v1_api/src/team-contacts/team-contacts.controller.ts`, `team-contacts.service.ts`, `dto/team-contact.dto.ts`
- Test: `team-contacts.controller.spec.ts`, `team-contacts.service.spec.ts`

**Interfaces:**
- Produces: `GET /me/team-contacts/summary` → `{ pendingInbound: number, byTeam: Array<{ teamId: string, pendingInbound: number }> }`.
- Removes: `listForTeam`, `detail`, `ListTeamContactsQueryDto`, `toListItem`, `assertParticipantSide`.

- [ ] **Step 1: 실패하는 테스트** — service spec:

```ts
describe('TeamContactsService.summary', () => {
  it('운영 팀 전체의 대기 중 받은 컨택을 팀별로 세고, 세기 전에 만료 건을 정리한다', async () => {
    const prisma = makePrisma();
    prisma.v1TeamMembership.findMany.mockResolvedValue([{ teamId: 'A' }, { teamId: 'B' }]);
    prisma.v1TeamContact.groupBy = jest.fn().mockResolvedValue([{ toTeamId: 'A', _count: { _all: 2 } }]);
    const service = new TeamContactsService(prisma, makeNotifications());

    await expect(service.summary(actor)).resolves.toEqual({ pendingInbound: 2, byTeam: [{ teamId: 'A', pendingInbound: 2 }, { teamId: 'B', pendingInbound: 0 }] });
    expect(prisma.v1TeamContact.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ toTeamId: { in: ['A', 'B'] }, status: 'requested' }), data: { status: 'expired' } }),
    );
  });
});
```

controller spec: `listForTeam`/`detail` 을 mock 에서 지우고 `summary: jest.fn()` 추가 + `routes summary to the service` 케이스.

- [ ] **Step 2: 실패 확인** → FAIL.
- [ ] **Step 3: 구현**

```ts
  async summary(user: V1AuthUser) {
    const teams = await this.prisma.v1TeamMembership.findMany({
      where: { userId: user.id, status: 'active', role: { in: ['owner', 'manager'] }, team: { status: 'active', deletedAt: null } },
      select: { teamId: true },
    });
    const teamIds = teams.map((row) => row.teamId);
    if (teamIds.length === 0) return { pendingInbound: 0, byTeam: [] };
    await this.prisma.v1TeamContact.updateMany({
      where: { toTeamId: { in: teamIds }, status: 'requested', expiresAt: { lt: new Date() } },
      data: { status: 'expired' },
    });
    const groups = await this.prisma.v1TeamContact.groupBy({
      by: ['toTeamId'], where: { toTeamId: { in: teamIds }, status: 'requested' }, _count: { _all: true },
    });
    const byTeam = teamIds.map((teamId) => ({ teamId, pendingInbound: groups.find((g) => g.toTeamId === teamId)?._count._all ?? 0 }));
    return { pendingInbound: byTeam.reduce((sum, row) => sum + row.pendingInbound, 0), byTeam };
  }
```

컨트롤러: `@Get('me/team-contacts/summary')` 추가, `list`/`detail` 핸들러 삭제. `ListTeamContactsQueryDto` 삭제. 서비스에서 `listForTeam`, `detail`, `toListItem`, `assertParticipantSide`, `DEFAULT_PAGE_SIZE/MAX_PAGE_SIZE` 삭제. `settleExpiry` 는 respond 가 쓰므로 유지. 스펙의 listForTeam/detail 테스트 삭제.

- [ ] **Step 4: 통과 확인** — 두 spec PASS, tsc 0.
- [ ] **Step 5: 커밋** — `git commit -m "feat(v1-team-contacts): 대기 컨택 요약 엔드포인트 신설, 컨택함 목록·상세 API 삭제" -- apps/v1_api/src/team-contacts/`

---

### Task 5: 데이터 백필 마이그레이션

**Files:**
- Create: `apps/v1_api/prisma/migrations/20260902000000_v1_team_contact_rooms_backfill/migration.sql`

- [ ] **Step 1: SQL 작성** (idempotent, 스키마 변경 없음):

```sql
-- 팀 컨택의 채팅 흡수(스펙 2026-09-02 §3.7): 기존 컨택에 방·참가자·첫 메시지를 채운다.
-- 1) 방이 없는 requested/accepted 컨택에 방 생성
INSERT INTO v1_chat_rooms (id, team_contact_id, status, created_at, updated_at)
SELECT gen_random_uuid(), c.id, 'active', c.created_at, now()
FROM v1_team_contacts c
LEFT JOIN v1_chat_rooms r ON r.team_contact_id = c.id
WHERE r.id IS NULL AND c.status IN ('requested', 'accepted');

-- 2) 양 팀 owner/manager 활성 멤버를 참가자로 (없으면 삽입, 있으면 visible_from_at 을 앞당김)
INSERT INTO v1_chat_room_participants (id, chat_room_id, user_id, status, visible_from_at, created_at, updated_at)
SELECT gen_random_uuid(), r.id, m.user_id, 'active', c.created_at, now(), now()
FROM v1_team_contacts c
JOIN v1_chat_rooms r ON r.team_contact_id = c.id
JOIN v1_team_memberships m ON m.team_id IN (c.from_team_id, c.to_team_id)
  AND m.status = 'active' AND m.role IN ('owner', 'manager')
ON CONFLICT (chat_room_id, user_id) DO UPDATE
  SET visible_from_at = LEAST(v1_chat_room_participants.visible_from_at, EXCLUDED.visible_from_at);

-- 3) 요청 메시지가 없는 방에 첫 메시지
INSERT INTO v1_chat_messages (id, chat_room_id, sender_user_id, body, status, message_type, sent_at, created_at, updated_at)
SELECT gen_random_uuid(), r.id, c.requested_by_user_id, c.message, 'sent', 'text', c.created_at, now(), now()
FROM v1_team_contacts c
JOIN v1_chat_rooms r ON r.team_contact_id = c.id
WHERE NOT EXISTS (
  SELECT 1 FROM v1_chat_messages m
  WHERE m.chat_room_id = r.id AND m.sender_user_id = c.requested_by_user_id AND m.sent_at = c.created_at
);

-- 4) last_message_at 정렬
UPDATE v1_chat_rooms r
SET last_message_at = sub.max_sent
FROM (SELECT chat_room_id, MAX(sent_at) AS max_sent FROM v1_chat_messages GROUP BY chat_room_id) sub
WHERE sub.chat_room_id = r.id AND r.team_contact_id IS NOT NULL
  AND (r.last_message_at IS NULL OR r.last_message_at < sub.max_sent);
```

실제 컬럼명(`created_at`/`updated_at` 존재 여부, `@map` 이름)은 `schema.prisma` 의 `V1ChatRoom`/`V1ChatRoomParticipant`/`V1ChatMessage` 에서 확인해 맞춘다. `visible_from_at` 이 NULL 인 기존 참가자는 `LEAST(NULL, x)` 가 x 가 되도록 `COALESCE` 를 쓴다.

- [ ] **Step 2: 검증** — 로컬 DB 가 없으므로 `psql` 문법 검사만: `./node_modules/.bin/prisma migrate diff` 는 스키마 전용이라 쓰지 않는다. CI 의 "V1 migration replay" 게이트가 빈 DB 에서 재생한다. 컬럼명은 `grep -n '@map' schema.prisma` 로 교차 확인.
- [ ] **Step 3: 커밋** — `git commit -m "feat(v1-db): 기존 팀 컨택에 채팅방·참가자·첫 메시지 백필" -- apps/v1_api/prisma/migrations/20260902000000_v1_team_contact_rooms_backfill/`

---

### Task 6: 통합 스펙 재작성

**Files:**
- Modify: `apps/v1_api/test/team-contacts/team-contact-flow.integration-spec.ts`
- Modify: `apps/v1_api/test/team-contacts/team-contact-guards.integration-spec.ts` (create 응답 단언만)

- [ ] **Step 1: 흐름 재작성** (setup 은 그대로):
  1. A owner 발신 → 201, `data.chatRoomId` 문자열, `data.route === /chat/{id}`. DB: 방 1, 참가자 2(ownerA, ownerB), 메시지 1(body = 요청문).
  2. B owner `GET /chat/rooms` → 해당 방이 목록에 있고 `teamContact.status === 'requested'`, `mySide === 'to'`, `unreadCount === 1`.
  3. B owner `POST /chat/rooms/{id}/messages` → 409 `TEAM_CONTACT_NOT_ACCEPTED`.
  4. 재발신 → 409 details `existingChatRoomId === roomId`.
  5. B owner accept → 200, `chatRoomId`. DB 메시지 2개(마지막 system, body '컨택을 수락했어요'). 알림 row: `targetType 'chat'`, `deepLink /chat/{id}`, recipient ownerA.
  6. A owner 전송 → 201.
  7. outsider `GET /chat/rooms/{id}` → 403.
- [ ] **Step 2: 실행** — `cd apps/v1_api && pnpm test:integration -- team-contacts` (로컬 DB 필요. 없으면 CI 로 검증하고 그 사실을 PR 에 적는다).
- [ ] **Step 3: 커밋** — `git commit -m "test(v1-team-contacts): 통합 스펙을 요청→방 노출→전송 차단→수락→전송 흐름으로 재작성" -- apps/v1_api/test/team-contacts/`

---

### Task 7: 프론트 타입·훅 정리

**Files:**
- Modify: `apps/v1_web/src/types/api.ts:1809-1866`, `apps/v1_web/src/hooks/use-v1-api.ts:1141-1231`, `apps/v1_web/src/lib/query-keys.ts:37-50`
- Modify: `apps/v1_web/src/components/teams/team-contact-new-client.tsx:50-66`
- Test: `apps/v1_web/src/components/teams/team-contact-new-client.test.tsx`

**Interfaces:**
- Produces: `V1ChatRoomTeamContact` 타입, `V1ChatRoom.teamContact?: V1ChatRoomTeamContact`, `V1ChatRoomDetail.teamContact?: V1ChatRoomTeamContact`.
- Produces: `useV1TeamContactSummary()` → `{ pendingInbound, byTeam }` (`v1Keys.teamContactSummary()` = `[...all, 'me', 'team-contacts', 'summary']`).
- Produces: `useV1CreateTeamContact` 응답 `V1TeamContact & { chatRoomId: string; route: string }`; accept/decline/withdraw 응답에 `chatRoomId`, 성공 시 `chatRooms()`·`chatRoom(roomId)`·`chatMessages(roomId)`·`teamContactSummary()` 무효화.
- Removes: `useV1TeamContacts`, `useV1TeamContact`, `V1TeamContactList`, keys `teamContacts/teamContactsAll/teamContact`.

- [ ] **Step 1: 실패하는 테스트** — new-client test: 성공 mock 응답에 `route: '/chat/room-1'` 을 넣고 `router.push` 가 `/chat/room-1` 로 호출되는지; 409 `existingChatRoomId: 'room-9'` 이면 링크 href 가 `/chat/room-9`.
- [ ] **Step 2: 실패 확인** — `cd apps/v1_web && ./node_modules/.bin/vitest run src/components/teams/team-contact-new-client.test.tsx`.
- [ ] **Step 3: 구현** — 타입/훅/키 위 인터페이스대로. new-client: `onSuccess: (data) => router.push(data.route)`, 에러 href `existingChatRoomId ? /chat/${existingChatRoomId} : '/chat?category=team_contact'`.
- [ ] **Step 4: 통과 확인** + `./node_modules/.bin/tsc --noEmit -p apps/v1_web/tsconfig.json` (아직 my-team-contacts-client 가 삭제 전이라 에러가 나면 Task 11 까지 보류하고 기록).
- [ ] **Step 5: 커밋** — pathspec 4파일 + 테스트.

---

### Task 8: 채팅방 상태 카드 + 입력 잠금

**Files:**
- Create: `apps/v1_web/src/components/community/team-contact-status-card.tsx`
- Create: `apps/v1_web/src/components/community/team-contact-status-card.test.tsx`
- Modify: `apps/v1_web/src/components/community/community.types.ts` (`ChatRoomViewModel.teamContact?`, `inputLockedMessage?`), `community-api-clients.tsx:76-143`, `community-page.tsx:134-144, 209-226`
- Move: `ReportContactDialog`, `formatExpiresIn` 을 `my-team-contacts-client.tsx` 에서 새 파일로 (Task 11 에서 원본 삭제).

**Interfaces:**
- Produces: `TeamContactStatusCard({ roomId, contact: V1ChatRoomTeamContact })` — 내부에서 `useV1AcceptTeamContact(contact.contactId)` 등 훅을 직접 사용.
- Produces: `contactStatusLabel(status): { label: string; badgeClass: 'tm-badge-blue'|'tm-badge-green'|'tm-badge-grey'|'tm-badge-orange'; Icon }`.

- [ ] **Step 1: 실패하는 테스트** (`renderWithClient` + 훅 mock 패턴은 `community-api-clients.test.tsx` 를 따른다):

```ts
it('받는 팀 운영진에게는 수락·거절 버튼이 보인다', ...)             // mySide 'to', requested
it('보낸 팀 운영진에게는 철회 버튼만 보인다', ...)                    // mySide 'from', requested
it('수락 클릭 시 accept mutate 가 호출된다', ...)
it('거절은 사유 입력을 거쳐 decline mutate 에 reason 을 넘긴다', ...)
it('accepted 면 액션 버튼이 없고 배지가 "수락됨" 이다', ...)
it('declined 면 사유가 표시된다', ...)
it('신고하기를 누르면 신고 다이얼로그가 열린다', ...)
```

`community-api-clients.test.tsx` 에 추가:

```ts
it('컨택 방이 requested 면 입력창이 잠기고 안내 문구가 보인다', ...)   // placeholder '수락하면 대화할 수 있어요', 전송 disabled
it('컨택 방이 declined 면 "종료된 컨택이에요" 로 잠긴다', ...)
```

- [ ] **Step 2: 실패 확인**.
- [ ] **Step 3: 구현**
  - 카드 마크업: `<section className="tm-card" aria-label="컨택 상태">` 안에 상단 행(배지 + 상대 팀 링크 `/teams/{id}` + 만료 문구), 액션 행(`tm-btn tm-btn-lg`, `minHeight: 44`), 보조 행("신고하기" `tm-btn-ghost`, 차단 2단계 인라인 — 기존 코드 이식). 색 토큰만 사용.
  - `community-api-clients.tsx` `ChatRoomPageClient`: `const contact = room.data?.teamContact;` `inputLockedMessage = contact ? (contact.status === 'requested' ? '수락하면 대화할 수 있어요' : contact.status !== 'accepted' ? '종료된 컨택이에요' : undefined) : undefined;` 모델에 `teamContact: contact`, `inputLockedMessage`.
  - `community-page.tsx`: `model.teamContact ? <TeamContactStatusCard roomId={roomId} contact={model.teamContact} /> : <기존 context 카드>`. 입력 `disabled={... || Boolean(model.inputLockedMessage)}`, `placeholder={model.inputLockedMessage ?? '메시지 입력'}`, 전송 버튼 disabled 조건에 추가.
  - 액션 훅 onSuccess 는 Task 7 에서 방 키를 무효화하므로 카드는 추가 무효화 없음.
- [ ] **Step 4: 통과 확인** — 두 테스트 파일 PASS.
- [ ] **Step 5: 커밋**.

---

### Task 9: 채팅 목록 — 상태 배지 + `?category` 프리셀렉트

**Files:**
- Modify: `community.types.ts` (`ChatRoomModel.contactStatus?`, `contactNeedsReply?`), `community-api-clients.tsx:41-74, 192-208`, `community-page.tsx:373-489`
- Test: `community-api-clients.test.tsx`

- [ ] **Step 1: 실패하는 테스트**: 팀컨택 방(requested, mySide to) 행에 텍스트 "답장 필요" 배지; `useSearchParams` mock 을 `new URLSearchParams('category=team_contact')` 로 바꾼 케이스에서 활성 chip 이 `팀컨택`.
- [ ] **Step 2: 실패 확인**.
- [ ] **Step 3: 구현** — `useChatListPageModel` 초기값: `const params = useSearchParams(); const initial = params.get('category') === 'team_contact' ? '팀컨택' : '전체';`. `toChatRoomModel` 에 `contactStatus: room.teamContact?.status`, `contactNeedsReply: room.teamContact?.status === 'requested' && room.teamContact.mySide === 'to'`. `ChatRoomRow` 제목 옆에 `contactNeedsReply ? <span className="tm-badge tm-badge-orange">답장 필요</span> : contactStatus ? <span className="tm-badge tm-badge-grey">{label}</span> : null` (label: 수락됨/거절됨/철회됨/만료됨; requested+from → "대기 중").
- [ ] **Step 4: 통과 확인**. **Step 5: 커밋**.

---

### Task 10: 입구 — 마이 메뉴 "채팅" 행 + 팀 관리 "받은 컨택" 행

**Files:**
- Modify: `apps/v1_web/src/components/my/my.types.ts:23-28` (`badge?: number`), `my.view-model.ts:39-49`, `my-page.tsx:53, 489-520`, `my-api-clients.tsx:104-160` (summary 훅 → 배지 주입)
- Modify: `apps/v1_web/src/components/teams/teams.types.ts:105` (`badge?: number`), `teams-client.tsx:334, 793-816`, `teams-page.tsx:352-380`
- Test: `apps/v1_web/src/components/my/my-home-chat-entry.test.tsx` (신규), `apps/v1_web/src/components/teams/teams-client.test.tsx` (있으면 케이스 추가, 없으면 신규)

- [ ] **Step 1: 실패하는 테스트**: 마이 홈에 링크 `/chat` 텍스트 "채팅" 이 있고 summary `pendingInbound: 3` 이면 배지 "3"; 0이면 배지 없음. 팀 상세 operations 에 "받은 컨택" 행 href `/chat?category=team_contact`, byTeam 해당 팀 2 → 라벨 "받은 컨택 2".
- [ ] **Step 2: 실패 확인**.
- [ ] **Step 3: 구현** — `MENU_ICON_MAP` 에 `MessageCircle` 추가(lucide import). `MenuSection` 라벨 옆 `item.badge ? <span className="tm-badge tm-badge-blue" aria-label={`대기 ${item.badge}건`}>{item.badge}</span> : null`. `toMyHomeModel` 에 `pendingContacts` 인자를 추가해 `href === '/chat'` 항목에 badge 주입. `buildTeamOperations(team, pendingInbound)` 에 행 추가(멤버 관리 다음). `TeamOperationsSection` 이 `badge` 를 라벨 옆에 그린다. `teams-client.tsx` 상세 모델에서 `useV1TeamContactSummary()` 를 부르되 운영진일 때만 `enabled`.
- [ ] **Step 4: 통과 확인**. **Step 5: 커밋**.

---

### Task 11: 컨택함 화면 삭제 + 리다이렉트 + 문서

**Files:**
- Delete: `apps/v1_web/src/components/my/my-team-contacts-client.tsx`, `.test.tsx`, `apps/v1_web/src/app/my/team-contacts/loading.tsx`, `apps/v1_web/src/app/my/team-contacts/[contactId]/loading.tsx`, `scripts/capture-team-contacts-alpha.mjs`
- Rewrite: `apps/v1_web/src/app/my/team-contacts/page.tsx` → `redirect('/chat?category=team_contact')` (next/navigation 서버 redirect)
- Rewrite: `apps/v1_web/src/app/my/team-contacts/[contactId]/page.tsx` → 클라이언트 컴포넌트 `TeamContactRedirectClient({ contactId })` (신규 `components/community/team-contact-redirect-client.tsx`): mount 시 `useV1ResolveChatRoom().mutate({ targetType:'team_contact', targetId })` → `router.replace(route)`; 실패 시 `ErrorState` + "채팅 목록으로" 링크.
- Modify: `apps/v1_web/src/lib/route-chrome/fragments/my-secondary.ts:35-42` 제목 "채팅으로 이동 중"
- Modify: `docs/team-contact-message-guide.md` §4 (채팅 기준), `docs/api/v1/domains/chat-notifications.md:8,15` (`team_contact` 추가), `scripts/README-alpha-verify.md` 에서 캡처 스크립트 항목 제거
- Create: `.changeset/team-contact-chat-absorption.md`
- Test: `apps/v1_web/src/components/community/team-contact-redirect-client.test.tsx`

- [ ] **Step 1: 실패하는 테스트** — redirect client: resolve 성공 시 `router.replace('/chat/room-1')`; 실패 시 에러 문구.
- [ ] **Step 2: 실패 확인**. **Step 3: 구현·삭제·문서**. 남은 `formatExpiresIn`/`ReportContactDialog` 참조가 0인지 `grep -rn "my-team-contacts-client" apps/v1_web/src` 로 확인.
- [ ] **Step 4: 전체 게이트** — `cd apps/v1_web && ./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/vitest run src/components/community src/components/my src/components/teams` PASS; `cd apps/v1_api && ./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/jest src/team-contacts src/chat src/notifications` PASS; lint 두 앱 0.
- [ ] **Step 5: 커밋**.

---

### Task 12: PR · Copilot · alpha 실측

- [ ] `node scripts/…changeset 정책` (push 전 `push-runs-changeset-policy-first` 메모리 참조) 통과 확인.
- [ ] `git push -u origin feat/v1-team-contact-chat` → `gh pr create --base dev --repo kim-song-jun/matchup-sports-platform` (본문: 스펙 링크, 트레이드오프, 백필 마이그레이션 명시). URL 에서 번호 파싱.
- [ ] Copilot 리뷰 요청 → clean 까지 루프. CI green. `baseRefName === dev` 확인 후 `gh pr merge <N> --merge`.
- [ ] 머지 후 메인 트리 `git fetch origin dev -q && git merge --ff-only origin/dev`.
- [ ] alpha 배포 SHA 확인 → A·B 팀장 계정으로 요청→목록→수락→대화 실측 + 📱390/📲768/🖥1440 갤러리(채팅 목록·채팅방 requested/accepted·마이 메뉴·팀 관리 메뉴) PR 코멘트 게시. 매뉴얼 스크린샷 링크 교체 후속 커밋.
