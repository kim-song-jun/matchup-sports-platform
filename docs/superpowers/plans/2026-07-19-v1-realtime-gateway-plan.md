# v1 Realtime Socket.IO Gateway Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `apps/v1_api` a Socket.IO gateway that pushes `notification:new` and `chat:message` events to the right connected user in real time, replacing v1's current polling-only frontend for those two flows.

**Architecture:** A new `RealtimeModule`/`RealtimeGateway` in `apps/v1_api/src/realtime/` authenticates each socket handshake by reusing the exact same `resolveV1RequestIdentity()` function the REST `V1AuthGuard` already uses, joins the socket to a `user:<id>` room, and exposes `emitToUser(userId, event, payload)`. `NotificationsService` and `ChatService` call that helper right after their existing DB writes (fire-and-forget, never blocking or failing the caller). `apps/v1_web` gets a `socket.io-client` connection manager and two hooks that invalidate the matching React Query cache keys when an event arrives.

**Tech Stack:** `@nestjs/websockets`, `@nestjs/platform-socket.io`, `socket.io` (backend); `socket.io-client` (frontend). NestJS 11.1, Next.js 16, React Query 5.

## Global Constraints

- Base branch: `dev`. This plan's worktree/branch is created fresh in Task 1 (do not reuse `docs/v1-realtime-push-specs`, which is docs-only).
- Scope: `apps/v1_api` + `apps/v1_web` only.
- Socket connections are per-instance, in-memory rooms (single EC2 instance today) — no Redis adapter, out of scope (spec's Ambiguity Log).
- Every new/modified backend service file needs its `*.spec.ts` kept green; new frontend hook files need a matching `*.test.ts`.
- Real behavior must be observably verified (per project verification norms) — a live two-tab manual check is required before the final task, not just unit tests.

---

### Task 1: Worktree + dependencies

**Files:** none (setup only).

- [ ] **Step 1: Create the worktree**

```bash
cd /Users/sungjun/Documents/projects/matchup-sports-platform
git fetch origin dev --quiet
git worktree add .claude/worktrees/v1-realtime-gateway -b feat/v1-realtime-gateway origin/dev
cd .claude/worktrees/v1-realtime-gateway
```

- [ ] **Step 2: Add backend dependencies**

```bash
export PATH="/Users/sungjun/.nvm/versions/node/v24.15.0/bin:$PATH"
cd apps/v1_api
pnpm add @nestjs/websockets@^11.1.18 @nestjs/platform-socket.io@^11.1.18 socket.io@^4.8.1
cd ../..
```
Expected: `apps/v1_api/package.json` `dependencies` gains all three; `@nestjs/websockets`/`@nestjs/platform-socket.io` versions must match the existing `@nestjs/common` major (11.x) already pinned in that file.

- [ ] **Step 3: Add frontend dependency**

```bash
cd apps/v1_web
pnpm add socket.io-client@^4.8.1
cd ../..
```

- [ ] **Step 4: Commit**

```bash
git add apps/v1_api/package.json apps/v1_web/package.json pnpm-lock.yaml
git commit -m "chore(v1): add socket.io dependencies for realtime gateway"
```

---

### Task 2: `RealtimeGateway` — handshake auth + `emitToUser`

**Files:**
- Create: `apps/v1_api/src/realtime/realtime.gateway.ts`
- Create: `apps/v1_api/src/realtime/realtime.gateway.spec.ts`
- Create: `apps/v1_api/src/realtime/realtime.module.ts`
- Modify: `apps/v1_api/src/app.module.ts`

**Interfaces:**
- Produces: `RealtimeGateway.emitToUser(userId: string, event: string, payload: unknown): void` — importable/injectable by other services once `RealtimeModule` exports it.

- [ ] **Step 1: Write the failing test**

Create `apps/v1_api/src/realtime/realtime.gateway.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from './realtime.gateway';

function buildSocket(handshakeHeaders: Record<string, string> = {}) {
  return {
    id: 'socket-1',
    handshake: { headers: handshakeHeaders, auth: {} },
    join: jest.fn(),
    disconnect: jest.fn(),
  };
}

describe('RealtimeGateway', () => {
  let gateway: RealtimeGateway;
  const prisma = {
    v1User: { findFirst: jest.fn() },
  };
  const server = { to: jest.fn().mockReturnThis(), emit: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    delete process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    const moduleRef = await Test.createTestingModule({
      providers: [RealtimeGateway, { provide: PrismaService, useValue: prisma }],
    }).compile();
    gateway = moduleRef.get(RealtimeGateway);
    gateway.server = server as never;
  });

  it('joins the user room on a successful dev-header handshake', async () => {
    prisma.v1User.findFirst.mockResolvedValue({
      id: 'user-1',
      accountStatus: 'active',
    });
    const socket = buildSocket({ 'x-v1-user-id': 'user-1' });

    await gateway.handleConnection(socket as never);

    expect(socket.join).toHaveBeenCalledWith('user:user-1');
    expect(socket.disconnect).not.toHaveBeenCalled();
  });

  it('disconnects a socket with no resolvable identity', async () => {
    const socket = buildSocket({});

    await gateway.handleConnection(socket as never);

    expect(socket.join).not.toHaveBeenCalled();
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('disconnects a socket for a suspended account', async () => {
    prisma.v1User.findFirst.mockResolvedValue({
      id: 'user-1',
      accountStatus: 'suspended',
    });
    const socket = buildSocket({ 'x-v1-user-id': 'user-1' });

    await gateway.handleConnection(socket as never);

    expect(socket.join).not.toHaveBeenCalled();
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('emitToUser sends the event to that user room only', () => {
    gateway.emitToUser('user-1', 'notification:new', { id: 'notif-1' });

    expect(server.to).toHaveBeenCalledWith('user:user-1');
    expect(server.emit).toHaveBeenCalledWith('notification:new', { id: 'notif-1' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/v1_api && pnpm exec jest --selectProjects unit --testPathPatterns="realtime.gateway.spec.ts"`
Expected: FAIL — `./realtime.gateway` does not exist yet.

- [ ] **Step 3: Write the gateway**

Create `apps/v1_api/src/realtime/realtime.gateway.ts`:

```ts
import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { currentRuntimeConfiguration, resolveV1RequestIdentity } from '../auth/v1-session';
import { assertChatParticipant } from '../chat/chat-participant.guard';

type V1Socket = Socket & { data: { userId?: string } };

@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class RealtimeGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(private readonly prisma: PrismaService) {}

  async handleConnection(client: V1Socket): Promise<void> {
    const identity = resolveV1RequestIdentity(
      {
        headers: { cookie: toSingleValue(client.handshake.headers.cookie) },
        header: (name: string) => toSingleValue(client.handshake.headers[name.toLowerCase()]),
      },
      currentRuntimeConfiguration(),
    );

    if (!identity) {
      client.disconnect(true);
      return;
    }

    const user = await this.prisma.v1User.findFirst({
      where: identity.kind === 'user_id' ? { id: identity.userId } : { email: identity.email },
      select: { id: true, accountStatus: true },
    });

    if (!user || ['suspended', 'blocked', 'deleted'].includes(user.accountStatus)) {
      client.disconnect(true);
      return;
    }

    client.data.userId = user.id;
    await client.join(`user:${user.id}`);
    this.logger.debug(`Socket ${client.id} joined user:${user.id}`);
  }

  @SubscribeMessage('chat:join')
  async handleChatJoin(client: V1Socket, payload: { roomId?: string }): Promise<void> {
    const userId = client.data.userId;
    const roomId = payload?.roomId;
    if (!userId || !roomId) return;

    const isParticipant = await assertChatParticipant(this.prisma, userId, roomId);
    if (!isParticipant) return;

    await client.join(`chat:${roomId}`);
  }

  emitToUser(userId: string, event: string, payload: unknown): void {
    this.server.to(`user:${userId}`).emit(event, payload);
  }
}

function toSingleValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
```

- [ ] **Step 4: Extract a reusable participant check**

`ChatService` already has participant-membership logic inline (`getActiveParticipantRoom`). Read `apps/v1_api/src/chat/chat.service.ts` in full first. Create `apps/v1_api/src/chat/chat-participant.guard.ts` with a standalone function that the gateway (Step 3, above) and `ChatService` can both call:

```ts
import { PrismaService } from '../prisma/prisma.service';

export async function assertChatParticipant(
  prisma: PrismaService,
  userId: string,
  roomId: string,
): Promise<boolean> {
  const participant = await prisma.v1ChatRoomParticipant.findFirst({
    where: { chatRoomId: roomId, userId, status: 'active' },
    select: { id: true },
  });
  return participant !== null;
}
```

Then edit `apps/v1_api/src/chat/chat.service.ts`: find the existing `getActiveParticipantRoom` (or equivalent) method, keep its current behavior (it likely does more — loads the full room, not just a boolean), and do **not** replace it. `assertChatParticipant` is a new, narrower helper used only by the gateway's `chat:join` handshake check — it must not change `ChatService`'s own logic or its existing tests.

- [ ] **Step 5: Write the module**

Create `apps/v1_api/src/realtime/realtime.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';

@Module({
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
```

- [ ] **Step 6: Register `RealtimeModule` in `AppModule`**

Edit `apps/v1_api/src/app.module.ts` — add `import { RealtimeModule } from './realtime/realtime.module';` and insert `RealtimeModule` into the `imports` array right before `NotificationsModule` (Task 3 makes `NotificationsModule` depend on it).

- [ ] **Step 7: Run test to verify it passes**

Run: `cd apps/v1_api && pnpm exec jest --selectProjects unit --testPathPatterns="realtime.gateway.spec.ts"`
Expected: PASS (4 tests).

- [ ] **Step 8: Type-check**

Run: `cd apps/v1_api && pnpm exec tsc --noEmit`
Expected: clean. If `chat-participant.guard.ts`'s import of `PrismaService`'s generated `v1ChatRoomParticipant` delegate doesn't match the real Prisma Client shape, fix the field/model name to match what's actually in `apps/v1_api/prisma/schema.prisma` (read it first — do not guess).

- [ ] **Step 9: Commit**

```bash
git add apps/v1_api/src/realtime apps/v1_api/src/chat/chat-participant.guard.ts apps/v1_api/src/app.module.ts
git commit -m "feat(v1-api): add RealtimeGateway with dev-header/session handshake auth"
```

---

### Task 3: Wire `notification:new` into `NotificationsService`

**Files:**
- Modify: `apps/v1_api/src/notifications/notifications.service.ts`
- Modify: `apps/v1_api/src/notifications/notifications.service.spec.ts`
- Modify: `apps/v1_api/src/notifications/notifications.module.ts`

**Interfaces:**
- Consumes: `RealtimeGateway.emitToUser(userId, event, payload)` (Task 2).

- [ ] **Step 1: Read the current file in full**

Read `apps/v1_api/src/notifications/notifications.service.ts` completely before editing — the exact private method is `createNotificationWithPrefCheck` (around line 313). It currently returns `Promise<void>` and does one `prisma.v1Notification.create({...})` call.

- [ ] **Step 2: Write the failing test**

Read `apps/v1_api/src/notifications/notifications.service.spec.ts` in full first to see its existing `beforeEach`/mock shape (it instantiates `NotificationsService` via `Test.createTestingModule` with a mocked `PrismaService`). Add a new test alongside the existing ones:

```ts
import { RealtimeGateway } from '../realtime/realtime.gateway';

// ...inside the existing describe block, add a new gateway mock to the
// existing prisma mock setup and pass it into Test.createTestingModule's
// providers as { provide: RealtimeGateway, useValue: realtimeGateway }.
// Add this test:

it('emits notification:new to the recipient after creating the row', async () => {
  prisma.v1NotificationPreference.findUnique.mockResolvedValue(null);
  prisma.v1Notification.create.mockResolvedValue(makeNotification({ id: 'notif-2' }));

  await service.emitNotification('user-1', 'match_join', 'match-9');

  expect(realtimeGateway.emitToUser).toHaveBeenCalledWith(
    'user-1',
    'notification:new',
    expect.objectContaining({ id: 'notif-2' }),
  );
});
```

(Declare `const realtimeGateway = { emitToUser: jest.fn() };` alongside the file's existing `prisma` mock declaration, and reset it in the existing `beforeEach`'s `jest.clearAllMocks()` — if the file doesn't already call `jest.clearAllMocks()` per test, read how it resets mocks between tests and follow that same pattern instead.)

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/v1_api && pnpm exec jest --selectProjects unit --testPathPatterns="notifications.service.spec.ts"`
Expected: FAIL — `RealtimeGateway` is not injected yet, or `emitToUser` is never called.

- [ ] **Step 4: Wire the emit**

Edit `apps/v1_api/src/notifications/notifications.service.ts`:

```ts
import { RealtimeGateway } from '../realtime/realtime.gateway';

// ...

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  // ...

  private async createNotificationWithPrefCheck(
    userId: string,
    targetType: V1NotificationTargetType,
    targetId: string | null,
    title: string,
    body: string | null,
    deepLink: string | null,
    prefField: keyof { matchEnabled: boolean; teamEnabled: boolean; teamMatchEnabled: boolean; activityEnabled: boolean },
  ): Promise<void> {
    const pref = await this.prisma.v1NotificationPreference.findUnique({
      where: { userId },
      select: { [prefField]: true },
    });
    const enabled = pref ? (pref as Record<string, boolean>)[prefField] !== false : true;
    if (!enabled) return;

    const notification = await this.prisma.v1Notification.create({
      data: {
        recipientUserId: userId,
        targetType,
        targetId,
        title,
        body,
        deepLink,
      },
    });

    this.realtimeGateway.emitToUser(userId, 'notification:new', notification);
  }
```

- [ ] **Step 5: Update the module to import `RealtimeModule`**

Edit `apps/v1_api/src/notifications/notifications.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { RealtimeModule } from '../realtime/realtime.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [RealtimeModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, V1AuthGuard],
  exports: [NotificationsService],
})
export class NotificationsModule {}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd apps/v1_api && pnpm exec jest --selectProjects unit --testPathPatterns="notifications.service.spec.ts"`
Expected: PASS (all existing tests + the new one).

- [ ] **Step 7: Commit**

```bash
git add apps/v1_api/src/notifications
git commit -m "feat(v1-api): emit notification:new after every notification create"
```

---

### Task 4: Wire `chat:message` (and `notification:new`) into `ChatService.sendMessage`

**Files:**
- Modify: `apps/v1_api/src/chat/chat.service.ts`
- Modify: `apps/v1_api/src/chat/chat.service.spec.ts`
- Modify: `apps/v1_api/src/chat/chat.module.ts`

**Interfaces:**
- Consumes: `RealtimeGateway.emitToUser` (Task 2).

- [ ] **Step 1: Read the current file in full**

Read `apps/v1_api/src/chat/chat.service.ts` completely. `sendMessage(user, roomId, dto)` already does a `$transaction` that creates the `V1ChatMessage` row and bulk-creates `V1Notification` rows for every active, non-muted, non-sender participant via `tx.v1Notification.createMany(...)`. `createMany` does not return the created rows, so you cannot emit the exact notification row per recipient from inside the transaction — emit a lighter payload after the transaction resolves instead (see Step 3).

- [ ] **Step 2: Write the failing test**

Read `apps/v1_api/src/chat/chat.service.spec.ts` in full first for its existing mock/DI shape. Add:

```ts
import { RealtimeGateway } from '../realtime/realtime.gateway';

// add `const realtimeGateway = { emitToUser: jest.fn() };` next to the
// file's existing mocks, pass `{ provide: RealtimeGateway, useValue: realtimeGateway }`
// into the module's providers, and reset it wherever the file resets its other mocks.

it('emits chat:message and notification:new to every other active recipient', async () => {
  // Reuse this spec file's existing fixtures/mocks for a room with two
  // OTHER active participants (e.g. 'user-2', 'user-3') plus the sender
  // ('user-1'), matching however the rest of this file already sets up
  // getActiveParticipantRoom / the participant list for sendMessage tests.

  await service.sendMessage(user, 'room-1', { content: 'hello' } as never);

  expect(realtimeGateway.emitToUser).toHaveBeenCalledWith(
    'user-2',
    'chat:message',
    expect.objectContaining({ roomId: 'room-1', content: 'hello' }),
  );
  expect(realtimeGateway.emitToUser).toHaveBeenCalledWith(
    'user-2',
    'notification:new',
    expect.objectContaining({ targetType: 'chat', targetId: 'room-1' }),
  );
  expect(realtimeGateway.emitToUser).not.toHaveBeenCalledWith('user-1', expect.anything(), expect.anything());
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/v1_api && pnpm exec jest --selectProjects unit --testPathPatterns="chat.service.spec.ts"`
Expected: FAIL — `RealtimeGateway` not injected / `emitToUser` never called.

- [ ] **Step 4: Wire the emits**

Edit `apps/v1_api/src/chat/chat.service.ts` — add the constructor dependency, and after the `$transaction` block in `sendMessage` returns (the `return created;` inside the transaction stays as-is; add the emit loop using the `recipients` list and the `message`/`content` values that are already in scope after the `await this.prisma.$transaction(...)` line):

```ts
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}
```

(Read the existing constructor first — if `ChatService` already takes other dependencies, add `realtimeGateway` as an additional parameter, don't replace the existing ones.)

```ts
  async sendMessage(user: V1AuthUser, roomId: string, dto: SendChatMessageDto) {
    const content = dto.content.trim();
    if (!content) throw validationError('content is required', 'content');
    const room = await this.getActiveParticipantRoom(user.id, roomId);
    if (room.status !== 'active') throw stateConflict('Chat room is not active');

    const { message, recipientUserIds } = await this.prisma.$transaction(async (tx) => {
      const created = await tx.v1ChatMessage.create({
        data: { chatRoomId: room.id, senderUserId: user.id, body: content, status: 'sent' },
      });
      await tx.v1ChatRoom.update({
        where: { id: room.id },
        data: { lastMessageAt: created.sentAt },
      });
      const recipients = await tx.v1ChatRoomParticipant.findMany({
        where: {
          chatRoomId: room.id,
          status: 'active',
          userId: { not: user.id },
          OR: [{ mutedUntil: null }, { mutedUntil: { lte: new Date() } }],
          AND: [currentChatRecipientEntitlementWhere(room)],
        },
        select: { userId: true },
      });
      if (recipients.length > 0) {
        await tx.v1Notification.createMany({
          data: recipients.map((participant) => ({
            recipientUserId: participant.userId,
            targetType: 'chat',
            targetId: room.id,
            title: getRoomTitle(room),
            body: content.slice(0, 120),
            deepLink: `/chat/${room.id}`,
          })),
        });
      }
      return { message: created, recipientUserIds: recipients.map((r) => r.userId) };
    });

    const chatMessagePayload = {
      messageId: message.id,
      roomId: room.id,
      content: message.body,
      status: message.status,
      sentAt: message.sentAt,
      senderUserId: user.id,
    };
    for (const recipientUserId of recipientUserIds) {
      this.realtimeGateway.emitToUser(recipientUserId, 'chat:message', chatMessagePayload);
      this.realtimeGateway.emitToUser(recipientUserId, 'notification:new', {
        targetType: 'chat',
        targetId: room.id,
      });
    }

    return chatMessagePayload;
  }
```

Note the return value's shape is unchanged from the original (`{ messageId, roomId, content, status, sentAt }` — `senderUserId` is new but additive, existing consumers reading named fields are unaffected; if any existing test asserts the response object with strict/exact equality rather than `objectContaining`, update that assertion to include `senderUserId: user.id`).

- [ ] **Step 5: Update the module to import `RealtimeModule`**

Edit `apps/v1_api/src/chat/chat.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { RealtimeModule } from '../realtime/realtime.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

@Module({
  imports: [RealtimeModule],
  controllers: [ChatController],
  providers: [ChatService, V1AuthGuard],
})
export class ChatModule {}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd apps/v1_api && pnpm exec jest --selectProjects unit --testPathPatterns="chat.service.spec.ts"`
Expected: PASS (all existing tests + the new one). If an existing test breaks because it asserts the exact return shape of `sendMessage` without `senderUserId`, update that one assertion per the note in Step 4 — do not weaken the new field away.

- [ ] **Step 7: Commit**

```bash
git add apps/v1_api/src/chat
git commit -m "feat(v1-api): emit chat:message and notification:new on new chat messages"
```

---

### Task 5: Frontend — socket connection manager

**Files:**
- Create: `apps/v1_web/src/lib/v1-socket.ts`
- Create: `apps/v1_web/src/lib/v1-socket.test.ts`

**Interfaces:**
- Consumes: `getV1DevAuthHeaders()` from `apps/v1_web/src/lib/api-client.ts` (existing).
- Produces: `getV1Socket(): Socket` (lazy singleton), `disconnectV1Socket(): void`.

- [ ] **Step 1: Write the failing test**

Create `apps/v1_web/src/lib/v1-socket.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';

const mockSocket = { connected: false, connect: vi.fn(), disconnect: vi.fn(), on: vi.fn(), off: vi.fn(), emit: vi.fn() };
const ioMock = vi.fn(() => mockSocket);

vi.mock('socket.io-client', () => ({ io: ioMock }));
vi.mock('./session-storage', () => ({
  getStoredV1Session: () => ({ userId: 'user-1', userEmail: null }),
}));

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe('getV1Socket', () => {
  it('creates exactly one socket across repeated calls', async () => {
    const { getV1Socket } = await import('./v1-socket');

    const a = getV1Socket();
    const b = getV1Socket();

    expect(a).toBe(b);
    expect(ioMock).toHaveBeenCalledTimes(1);
  });

  it('passes dev auth headers as the handshake auth payload', async () => {
    const { getV1Socket } = await import('./v1-socket');

    getV1Socket();

    const [, options] = ioMock.mock.calls[0];
    expect(options.auth).toEqual(expect.objectContaining({ 'x-v1-user-id': 'user-1' }));
  });
});

describe('disconnectV1Socket', () => {
  it('disconnects and clears the singleton so the next call reconnects', async () => {
    const { getV1Socket, disconnectV1Socket } = await import('./v1-socket');
    getV1Socket();

    disconnectV1Socket();
    getV1Socket();

    expect(mockSocket.disconnect).toHaveBeenCalledTimes(1);
    expect(ioMock).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/v1_web && pnpm exec vitest run src/lib/v1-socket.test.ts`
Expected: FAIL — `./v1-socket` does not exist yet.

- [ ] **Step 3: Write the implementation**

Create `apps/v1_web/src/lib/v1-socket.ts`:

```ts
import { io, type Socket } from 'socket.io-client';
import { getStoredV1Session } from './session-storage';

let socket: Socket | null = null;

export function getV1Socket(): Socket {
  if (socket) return socket;

  const { userId, userEmail } = getStoredV1Session();
  socket = io('/', {
    path: '/socket.io',
    auth: {
      ...(userId ? { 'x-v1-user-id': userId } : {}),
      ...(userEmail ? { 'x-v1-user-email': userEmail } : {}),
    },
    withCredentials: true,
  });
  return socket;
}

export function disconnectV1Socket(): void {
  socket?.disconnect();
  socket = null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/v1_web && pnpm exec vitest run src/lib/v1-socket.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Add the dev proxy rewrite for the socket path**

Read `apps/v1_web/next.config.ts` in full. Its `rewrites()` already proxies `/api/:path*` and `/uploads/:path*` to `internalApiOrigin` for local dev (production serves everything through the same origin behind nginx, so this step is dev-only). Add a third rewrite entry so `/socket.io/*` reaches `apps/v1_api` the same way:

```ts
      {
        source: '/socket.io/:path*',
        destination: `${internalApiOrigin}/socket.io/:path*`,
      },
```

Insert it as a third object in the array literal already returned by `rewrites()`, alongside the existing `/api/:path*` and `/uploads/:path*` entries — do not change those two.

- [ ] **Step 6: Commit**

```bash
git add apps/v1_web/src/lib/v1-socket.ts apps/v1_web/src/lib/v1-socket.test.ts apps/v1_web/next.config.ts
git commit -m "feat(v1-web): add v1 socket.io connection manager"
```

---

### Task 6: Frontend — `useV1NotificationSocket` + `useV1ChatRoomSocket`

**Files:**
- Create: `apps/v1_web/src/hooks/use-v1-realtime-socket.ts`
- Create: `apps/v1_web/src/hooks/use-v1-realtime-socket.test.ts`
- Modify: `apps/v1_web/src/app/providers.tsx`

**Interfaces:**
- Consumes: `getV1Socket()` (Task 5).
- Produces: `useV1NotificationSocket(): void`, `useV1ChatRoomSocket(roomId: string): void`.

- [ ] **Step 1: Write the failing test**

Create `apps/v1_web/src/hooks/use-v1-realtime-socket.test.ts`:

```tsx
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

const listeners: Record<string, (payload: unknown) => void> = {};
const mockSocket = {
  on: vi.fn((event: string, cb: (payload: unknown) => void) => {
    listeners[event] = cb;
  }),
  off: vi.fn(),
  emit: vi.fn(),
};

vi.mock('@/lib/v1-socket', () => ({ getV1Socket: () => mockSocket }));

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

afterEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(listeners)) delete listeners[key];
});

describe('useV1NotificationSocket', () => {
  it('subscribes to notification:new and unsubscribes on unmount', async () => {
    const { useV1NotificationSocket } = await import('./use-v1-realtime-socket');
    const { unmount } = renderHook(() => useV1NotificationSocket(), { wrapper });

    expect(mockSocket.on).toHaveBeenCalledWith('notification:new', expect.any(Function));

    unmount();

    expect(mockSocket.off).toHaveBeenCalledWith('notification:new', expect.any(Function));
  });
});

describe('useV1ChatRoomSocket', () => {
  it('joins the room and subscribes to chat:message', async () => {
    const { useV1ChatRoomSocket } = await import('./use-v1-realtime-socket');
    renderHook(() => useV1ChatRoomSocket('room-1'), { wrapper });

    expect(mockSocket.emit).toHaveBeenCalledWith('chat:join', { roomId: 'room-1' });
    expect(mockSocket.on).toHaveBeenCalledWith('chat:message', expect.any(Function));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/v1_web && pnpm exec vitest run src/hooks/use-v1-realtime-socket.test.ts`
Expected: FAIL — `./use-v1-realtime-socket` does not exist yet.

- [ ] **Step 3: Write the implementation**

Create `apps/v1_web/src/hooks/use-v1-realtime-socket.ts`:

```ts
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getV1Socket } from '@/lib/v1-socket';

export function useV1NotificationSocket(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const socket = getV1Socket();
    const handler = () => {
      queryClient.invalidateQueries({ queryKey: ['v1-notifications'] });
      queryClient.invalidateQueries({ queryKey: ['v1-notification-unread-summary'] });
    };
    socket.on('notification:new', handler);
    return () => socket.off('notification:new', handler);
  }, [queryClient]);
}

export function useV1ChatRoomSocket(roomId: string): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const socket = getV1Socket();
    socket.emit('chat:join', { roomId });
    const handler = () => {
      queryClient.invalidateQueries({ queryKey: ['v1-chat-room', roomId] });
    };
    socket.on('chat:message', handler);
    return () => socket.off('chat:message', handler);
  }, [queryClient, roomId]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/v1_web && pnpm exec vitest run src/hooks/use-v1-realtime-socket.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Mount `useV1NotificationSocket` app-wide for logged-in users**

Read `apps/v1_web/src/lib/session-storage.ts` in full to find the existing function/hook that exposes whether a v1 session is currently present (used elsewhere for auth-gated UI, e.g. `useRequireAuth` or the session-storage read used by `getV1DevAuthHeaders`). Create a small client component that only calls `useV1NotificationSocket()` when a session exists — do not connect for anonymous visitors. Then edit `apps/v1_web/src/app/providers.tsx` to mount it:

```tsx
'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Suspense, type ReactNode, useState } from 'react';
import { PendingSocialSignupGate } from '@/components/auth/pending-social-signup-gate';
import { ClientErrorListener } from '@/components/providers/client-error-listener';
import { GoogleAnalytics } from '@/components/providers/google-analytics';
import { getGaMeasurementId } from '@/lib/analytics';
import { GlobalPopup } from '@/components/popups/global-popup';
import { NotificationSocketBridge } from '@/components/providers/notification-socket-bridge';

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: true,
          },
          mutations: {
            retry: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ClientErrorListener />
      <NotificationSocketBridge />
      {getGaMeasurementId() && (
        <Suspense fallback={null}>
          <GoogleAnalytics />
        </Suspense>
      )}
      <PendingSocialSignupGate>{children}</PendingSocialSignupGate>
      <GlobalPopup />
    </QueryClientProvider>
  );
}
```

Create `apps/v1_web/src/components/providers/notification-socket-bridge.tsx`:

```tsx
'use client';

import { useV1NotificationSocket } from '@/hooks/use-v1-realtime-socket';
import { getStoredV1Session } from '@/lib/session-storage';

export function NotificationSocketBridge() {
  const { userId } = getStoredV1Session();
  return userId ? <NotificationSocketMount /> : null;
}

function NotificationSocketMount() {
  useV1NotificationSocket();
  return null;
}
```

(`getStoredV1Session()` reads synchronously from storage — confirm its exact return shape by reading `apps/v1_web/src/lib/session-storage.ts` first; if the field name differs from `userId`, use the real one.)

- [ ] **Step 6: Type-check and lint**

Run: `cd apps/v1_web && pnpm exec tsc --noEmit && pnpm lint`
Expected: both clean.

- [ ] **Step 7: Commit**

```bash
git add apps/v1_web/src/hooks/use-v1-realtime-socket.ts apps/v1_web/src/hooks/use-v1-realtime-socket.test.ts apps/v1_web/src/components/providers/notification-socket-bridge.tsx apps/v1_web/src/app/providers.tsx
git commit -m "feat(v1-web): subscribe to notification:new/chat:message over socket.io"
```

---

### Task 7: Whole-branch verification + manual two-tab check

**Files:** None modified — verification only.

- [ ] **Step 1: Backend full unit suite**

Run: `cd apps/v1_api && pnpm test`
Expected: all suites pass, including `realtime.gateway.spec.ts` and the modified `notifications.service.spec.ts`/`chat.service.spec.ts`.

- [ ] **Step 2: Backend type-check**

Run: `cd apps/v1_api && pnpm exec tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Frontend full test suite + lint**

Run: `cd apps/v1_web && pnpm test && pnpm lint`
Expected: all pass, clean.

- [ ] **Step 4: Manual two-tab realtime check**

Start the v1 stack locally per this repo's dev commands (DB + `apps/v1_api` on :8121 + `apps/v1_web` on :3013 — check `lsof` first per CLAUDE.md's port-hygiene note before starting anything new). Open two browser tabs logged in as two different dev-auth users who share a chat room. In tab A, send a chat message; confirm it appears in tab B's chat view within ~1s without a manual refresh. Trigger any notification-producing action (e.g. a team application) targeting tab B's user; confirm tab B's notification badge updates without a refresh. Record the observation (pass/fail, what you saw) — this is the actual behavioral proof the spec calls for, not just unit test green.

- [ ] **Step 5: Push and open the PR**

```bash
git push -u origin feat/v1-realtime-gateway
gh pr create --base dev --title "feat(v1): realtime Socket.IO gateway for notifications + chat" --body "$(cat <<'EOF'
## Summary
- New RealtimeGateway (apps/v1_api/src/realtime) authenticates socket handshakes via the same resolveV1RequestIdentity() REST already uses, joins user:<id> rooms
- NotificationsService and ChatService.sendMessage now emit notification:new / chat:message over the socket right after their existing DB writes (fire-and-forget)
- apps/v1_web: socket.io-client connection manager + useV1NotificationSocket / useV1ChatRoomSocket hooks invalidating the matching React Query caches

Spec: docs/superpowers/specs/2026-07-19-v1-realtime-gateway-design.md
Plan: docs/superpowers/plans/2026-07-19-v1-realtime-gateway-plan.md

## Test plan
- [x] apps/v1_api unit suite green (new realtime.gateway.spec.ts + updated notifications/chat specs)
- [x] apps/v1_web test suite green
- [x] Manual two-tab check: chat message and notification both arrived live without refresh
EOF
)"
```

Do not merge — CI + `.changeset/*.md` requirement apply (this branch touches `apps/v1_api`/`apps/v1_web`, so add a changeset before pushing if not already done in an earlier task's commit — none of the tasks above created one; add it now):

```bash
cat > .changeset/v1-realtime-gateway.md << 'EOF'
---
"v1_api": minor
"v1_web": minor
---

Add a Socket.IO realtime gateway so notifications and chat messages arrive live instead of waiting for the next poll.
EOF
git add .changeset/v1-realtime-gateway.md
git commit -m "chore(changeset): realtime gateway"
git push
```

## Self-Review Notes

- **Spec coverage:** handshake auth reusing `resolveV1RequestIdentity` (Task 2), `emitToUser` helper (Task 2), `notification:new` trigger (Task 3), `chat:message` + room-join trigger (Task 2 `chat:join`, Task 4), frontend connection manager (Task 5), frontend hooks + cache invalidation (Task 6), manual live-behavior proof (Task 7). Redis adapter and multi-instance scaling are explicitly out of scope per the spec's Ambiguity Log — no task references them.
- **Placeholder scan:** no TBD/TODO; every step has complete code or an explicit "read this file first, then do X" instruction with the exact target described (never "handle appropriately").
- **Type consistency:** `emitToUser(userId: string, event: string, payload: unknown): void` signature is identical across Task 2 (definition), Task 3, and Task 4 (both call sites). `getV1Socket()` / `disconnectV1Socket()` names match between Task 5 (definition) and Task 6 (consumption).
