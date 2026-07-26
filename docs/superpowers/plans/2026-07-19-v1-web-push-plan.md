# v1 Web Push Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `apps/v1_api`/`apps/v1_web` VAPID-based Web Push — subscribe/unsubscribe/send, an operator failure-log dashboard, and a service worker — ported from legacy's proven `apps/api` implementation, so notifications reach users even when their tab is closed.

**Architecture:** New `V1PushSubscription`/`V1WebPushFailureLog` Prisma models, a `WebPushService` mirroring legacy's graceful-disable VAPID pattern, three new endpoints on `NotificationsController`, and a call to `sendToUser()` right next to the socket `emitToUser()` call the realtime-gateway PR already added inside `createNotificationWithPrefCheck`. Frontend gets a service worker, a subscription hook triggered both from a settings-page toggle and automatically after onboarding, and an admin failure-log table.

**Tech Stack:** `web-push` (backend), native browser `PushManager`/`Notification`/`ServiceWorker` APIs (frontend, no Capacitor — confirmed absent from `apps/v1_web`). NestJS 11.1, Prisma 6, Next.js 16.

## Global Constraints

- **Depends on** `feat/v1-realtime-gateway` (the previous plan) being merged into `dev` first — this plan's Task 1 branches off `dev` only after that merge, and Task 4 edits the same `createNotificationWithPrefCheck` block that plan's Task 3 already modified.
- Base branch: `dev`. Scope: `apps/v1_api`, `apps/v1_web`, `deploy/docker-compose.prod.yml`.
- VAPID env vars (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`) must graceful-disable when absent — `WebPushService` must never throw or block notification creation when unset.
- Every migration must be idempotent-safe per this repo's DB migration discipline (CLAUDE.md) — a fresh `prisma migrate deploy` replay must succeed.
- No PII beyond what legacy already exposed (endpoint suffix + hashed userId) in the admin failure table.

---

### Task 1: Worktree + Prisma models + migration

**Files:**
- Modify: `apps/v1_api/prisma/schema.prisma`
- Create: `apps/v1_api/prisma/migrations/<timestamp>_v1_web_push/migration.sql`

- [ ] **Step 1: Create the worktree off the merged realtime-gateway branch**

```bash
cd /Users/sungjun/Documents/projects/matchup-sports-platform
git fetch origin dev --quiet
git worktree add .claude/worktrees/v1-web-push -b feat/v1-web-push origin/dev
cd .claude/worktrees/v1-web-push
git log --oneline -5
```
Expected: the log includes the realtime-gateway PR's squash-merge commit. If it does not (the previous plan hasn't been merged yet), **stop this task and report back** — do not proceed against a `dev` that lacks `RealtimeGateway`, since Task 4 depends on it.

- [ ] **Step 2: Add the Prisma models**

Read `apps/v1_api/prisma/schema.prisma` in full first to find the `model V1User { ... }` block and any nearby `V1Notification`-adjacent models, so the new models are inserted in a sensible neighborhood (not required for correctness, but keep the file organized the way it already is). Add:

```prisma
model V1PushSubscription {
  id         String   @id @default(cuid())
  userId     String   @map("user_id")
  endpoint   String   @unique
  p256dh     String
  auth       String
  createdAt  DateTime @default(now()) @map("created_at")
  lastUsedAt DateTime @updatedAt @map("last_used_at")

  user V1User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("v1_push_subscriptions")
}

model V1WebPushFailureLog {
  id             String    @id @default(cuid())
  userId         String    @map("user_id")
  subscriptionId String?   @map("subscription_id")
  statusCode     Int?      @map("status_code")
  errorCode      String?   @map("error_code")
  endpointSuffix String    @map("endpoint_suffix")
  occurredAt     DateTime  @default(now()) @map("occurred_at")
  acknowledgedAt DateTime? @map("acknowledged_at")
  acknowledgedBy String?   @map("acknowledged_by")

  @@index([occurredAt])
  @@index([acknowledgedAt])
  @@index([userId])
  @@map("v1_web_push_failure_logs")
}
```

Add the reverse relation field to `model V1User { ... }` alongside its other one-to-many relations (e.g. next to `teamMemberships`):

```prisma
  pushSubscriptions V1PushSubscription[]
```

- [ ] **Step 3: Generate the migration**

```bash
export PATH="/Users/sungjun/.nvm/versions/node/v24.15.0/bin:$PATH"
cd apps/v1_api
pnpm exec prisma migrate dev --name v1_web_push --create-only
```
Read the generated SQL file and confirm it only adds the two new tables (no unrelated drift) — if `prisma migrate dev` reports schema drift unrelated to this change, **stop and report** rather than accepting an unexpected migration.

- [ ] **Step 4: Apply locally and regenerate the client**

```bash
pnpm exec prisma migrate dev
pnpm exec prisma generate
cd ../..
```

- [ ] **Step 5: Verify the drift gate**

```bash
cd apps/v1_api
pnpm exec prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url "$DATABASE_URL"
```
Expected: no diff output (empty). This mirrors what CI's "V1 migration replay + drift gate" checks — catching a mismatch now avoids a CI failure later (this is exactly the class of mistake that broke the observability-skeleton PR's first CI run).

- [ ] **Step 6: Commit**

```bash
cd /Users/sungjun/Documents/projects/matchup-sports-platform/.claude/worktrees/v1-web-push
git add apps/v1_api/prisma/schema.prisma apps/v1_api/prisma/migrations
git commit -m "feat(v1-api): add V1PushSubscription/V1WebPushFailureLog models"
```

---

### Task 2: `WebPushService`

**Files:**
- Create: `apps/v1_api/src/notifications/web-push.service.ts`
- Create: `apps/v1_api/src/notifications/web-push.service.spec.ts`
- Modify: `apps/v1_api/package.json`

**Interfaces:**
- Produces: `WebPushService.getPublicKey(): string | null`, `WebPushService.subscribe(userId: string, dto: { endpoint: string; keys: { p256dh: string; auth: string } }): Promise<void>`, `WebPushService.unsubscribe(userId: string, endpoint: string): Promise<void>`, `WebPushService.sendToUser(userId: string, payload: { title: string; body?: string; url?: string }): Promise<void>`.

- [ ] **Step 1: Add the dependency**

```bash
export PATH="/Users/sungjun/.nvm/versions/node/v24.15.0/bin:$PATH"
cd apps/v1_api
pnpm add web-push@^3.6.7
pnpm add -D @types/web-push@^3.6.4
cd ../..
```

- [ ] **Step 2: Write the failing test**

Create `apps/v1_api/src/notifications/web-push.service.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { WebPushService } from './web-push.service';

jest.mock('web-push', () => ({
  setVapidDetails: jest.fn(),
  sendNotification: jest.fn(),
}));

import * as webpush from 'web-push';

describe('WebPushService', () => {
  const prisma = {
    v1PushSubscription: {
      findMany: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    v1WebPushFailureLog: { create: jest.fn() },
  };

  async function build(env: Record<string, string | undefined>) {
    const originalEnv = { ...process.env };
    Object.assign(process.env, env);
    const moduleRef = await Test.createTestingModule({
      providers: [WebPushService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    const service = moduleRef.get(WebPushService);
    service.onModuleInit();
    process.env = originalEnv;
    return service;
  }

  beforeEach(() => jest.clearAllMocks());

  it('stays disabled and returns a null public key when VAPID env vars are missing', async () => {
    const service = await build({ VAPID_PUBLIC_KEY: undefined, VAPID_PRIVATE_KEY: undefined, VAPID_SUBJECT: undefined });

    expect(service.getPublicKey()).toBeNull();
    await service.sendToUser('user-1', { title: 'hi' });

    expect(prisma.v1PushSubscription.findMany).not.toHaveBeenCalled();
  });

  it('enables and returns the configured public key when all three VAPID vars are set', async () => {
    const service = await build({
      VAPID_PUBLIC_KEY: 'pub-key',
      VAPID_PRIVATE_KEY: 'priv-key',
      VAPID_SUBJECT: 'mailto:ops@teameet.co.kr',
    });

    expect(service.getPublicKey()).toBe('pub-key');
    expect(webpush.setVapidDetails).toHaveBeenCalledWith('mailto:ops@teameet.co.kr', 'pub-key', 'priv-key');
  });

  it('sendToUser deletes a subscription on a 410 Gone response', async () => {
    const service = await build({
      VAPID_PUBLIC_KEY: 'pub-key',
      VAPID_PRIVATE_KEY: 'priv-key',
      VAPID_SUBJECT: 'mailto:ops@teameet.co.kr',
    });
    prisma.v1PushSubscription.findMany.mockResolvedValue([
      { id: 'sub-1', endpoint: 'https://push.example/abc', p256dh: 'p', auth: 'a' },
    ]);
    (webpush.sendNotification as jest.Mock).mockRejectedValue({ statusCode: 410 });

    await service.sendToUser('user-1', { title: 'hi' });

    expect(prisma.v1PushSubscription.delete).toHaveBeenCalledWith({ where: { id: 'sub-1' } });
  });

  it('sendToUser logs a failure without deleting the subscription on a non-expiry error', async () => {
    const service = await build({
      VAPID_PUBLIC_KEY: 'pub-key',
      VAPID_PRIVATE_KEY: 'priv-key',
      VAPID_SUBJECT: 'mailto:ops@teameet.co.kr',
    });
    prisma.v1PushSubscription.findMany.mockResolvedValue([
      { id: 'sub-1', endpoint: 'https://push.example/abc', p256dh: 'p', auth: 'a' },
    ]);
    (webpush.sendNotification as jest.Mock).mockRejectedValue({ statusCode: 500 });

    await service.sendToUser('user-1', { title: 'hi' });

    expect(prisma.v1PushSubscription.delete).not.toHaveBeenCalled();
    expect(prisma.v1WebPushFailureLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'user-1', subscriptionId: 'sub-1', statusCode: 500 }),
      }),
    );
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/v1_api && pnpm exec jest --selectProjects unit --testPathPatterns="web-push.service.spec.ts"`
Expected: FAIL — `./web-push.service` does not exist yet.

- [ ] **Step 4: Write the service**

Create `apps/v1_api/src/notifications/web-push.service.ts`:

```ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as webpush from 'web-push';
import { PrismaService } from '../prisma/prisma.service';

interface PushPayload {
  title: string;
  body?: string;
  url?: string;
}

@Injectable()
export class WebPushService implements OnModuleInit {
  private readonly logger = new Logger(WebPushService.name);
  private enabled = false;
  private publicKey: string | null = null;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT;

    if (!publicKey || !privateKey || !subject) {
      this.logger.warn('VAPID keys not configured — Web Push disabled');
      return;
    }

    webpush.setVapidDetails(subject, publicKey, privateKey);
    this.publicKey = publicKey;
    this.enabled = true;
  }

  getPublicKey(): string | null {
    return this.enabled ? this.publicKey : null;
  }

  async subscribe(userId: string, dto: { endpoint: string; keys: { p256dh: string; auth: string } }): Promise<void> {
    await this.prisma.v1PushSubscription.upsert({
      where: { endpoint: dto.endpoint },
      create: { userId, endpoint: dto.endpoint, p256dh: dto.keys.p256dh, auth: dto.keys.auth },
      update: { p256dh: dto.keys.p256dh, auth: dto.keys.auth, userId },
    });
  }

  async unsubscribe(userId: string, endpoint: string): Promise<void> {
    await this.prisma.v1PushSubscription.deleteMany({ where: { userId, endpoint } });
  }

  async sendToUser(userId: string, payload: PushPayload): Promise<void> {
    if (!this.enabled) return;

    const subscriptions = await this.prisma.v1PushSubscription.findMany({ where: { userId } });
    await Promise.all(
      subscriptions.map((subscription) =>
        webpush
          .sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: { p256dh: subscription.p256dh, auth: subscription.auth },
            },
            JSON.stringify(payload),
          )
          .catch(async (error: { statusCode?: number }) => {
            if (error.statusCode === 410 || error.statusCode === 404) {
              await this.prisma.v1PushSubscription.delete({ where: { id: subscription.id } }).catch(() => {});
              return;
            }
            await this.prisma.v1WebPushFailureLog
              .create({
                data: {
                  userId,
                  subscriptionId: subscription.id,
                  statusCode: error.statusCode ?? null,
                  endpointSuffix: subscription.endpoint.slice(-12),
                },
              })
              .catch(() => {});
          }),
      ),
    );
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/v1_api && pnpm exec jest --selectProjects unit --testPathPatterns="web-push.service.spec.ts"`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/v1_api/package.json apps/v1_api/src/notifications/web-push.service.ts apps/v1_api/src/notifications/web-push.service.spec.ts pnpm-lock.yaml
git commit -m "feat(v1-api): add WebPushService (VAPID, graceful disable)"
```

---

### Task 3: Endpoints — `vapid-public-key` / `push-subscribe` / `push-unsubscribe`

**Files:**
- Create: `apps/v1_api/src/notifications/dto/push-subscribe.dto.ts`
- Modify: `apps/v1_api/src/notifications/notifications.controller.ts`
- Modify: `apps/v1_api/src/notifications/notifications.controller.spec.ts`
- Modify: `apps/v1_api/src/notifications/notifications.module.ts`

- [ ] **Step 1: Write the DTOs**

Create `apps/v1_api/src/notifications/dto/push-subscribe.dto.ts`:

```ts
import { Type } from 'class-transformer';
import { IsString, IsUrl, ValidateNested } from 'class-validator';

class PushSubscriptionKeysDto {
  @IsString()
  p256dh!: string;

  @IsString()
  auth!: string;
}

export class PushSubscribeDto {
  @IsUrl({ require_tld: false })
  endpoint!: string;

  @ValidateNested()
  @Type(() => PushSubscriptionKeysDto)
  keys!: PushSubscriptionKeysDto;
}

export class PushUnsubscribeDto {
  @IsUrl({ require_tld: false })
  endpoint!: string;
}
```

(`require_tld: false` because push endpoints are often `https://fcm.googleapis.com/...`/`https://updates.push.services.mozilla.com/...` — valid HTTPS URLs without a bare-domain concern, but keep the flag explicit rather than assuming `class-validator`'s default; if `pnpm exec tsc --noEmit` or the endpoint test in Step 4 shows real push endpoint URLs failing validation, adjust the `IsUrl` options to match, don't loosen it to `@IsString()`.)

- [ ] **Step 2: Write the failing controller tests**

Read `apps/v1_api/src/notifications/notifications.controller.spec.ts` in full first for its existing DI/mock pattern (it mocks `NotificationsService` entirely via `{ provide: NotificationsService, useValue: notificationsService }`). Add a `webPushService` mock the same way and extend the test module's providers, then add:

```ts
it('vapid-public-key returns the service public key', async () => {
  webPushService.getPublicKey.mockReturnValue('pub-key');

  await expect(controller.vapidPublicKey()).resolves.toEqual({ publicKey: 'pub-key' });
});

it('push-subscribe delegates to WebPushService.subscribe with the current user', async () => {
  const dto = { endpoint: 'https://push.example/abc', keys: { p256dh: 'p', auth: 'a' } };

  await controller.pushSubscribe(user, dto as never);

  expect(webPushService.subscribe).toHaveBeenCalledWith(user.id, dto);
});

it('push-unsubscribe delegates to WebPushService.unsubscribe', async () => {
  await controller.pushUnsubscribe(user, { endpoint: 'https://push.example/abc' } as never);

  expect(webPushService.unsubscribe).toHaveBeenCalledWith(user.id, 'https://push.example/abc');
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/v1_api && pnpm exec jest --selectProjects unit --testPathPatterns="notifications.controller.spec.ts"`
Expected: FAIL — `controller.vapidPublicKey`/`pushSubscribe`/`pushUnsubscribe` don't exist yet.

- [ ] **Step 4: Add the endpoints**

Read `apps/v1_api/src/notifications/notifications.controller.ts` in full (already known from the spec doc: `@Controller()` with no base path, `@UseGuards(V1AuthGuard)` at class level). The new `vapid-public-key` endpoint must be **public** (no auth), so it needs its own `@UseGuards()`-free route — since the guard is applied at class level, override per-route is not directly possible with a bare decorator; instead check how this codebase handles public routes on an otherwise-guarded controller (search for `@Public()` or similar decorator under `apps/v1_api/src/auth/`). If no such decorator exists, add the `vapid-public-key` route on a **separate, unguarded controller** in the same module instead of forcing an exception into the guarded one:

```ts
import { Body, Controller, Delete, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/current-user.decorator';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { V1AuthUser } from '../auth/v1-auth-user';
import { PushSubscribeDto, PushUnsubscribeDto } from './dto/push-subscribe.dto';
import { WebPushService } from './web-push.service';

@Controller()
export class WebPushController {
  constructor(private readonly webPushService: WebPushService) {}

  @Get('vapid-public-key')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  vapidPublicKey() {
    return { publicKey: this.webPushService.getPublicKey() };
  }

  @Post('push-subscribe')
  @UseGuards(V1AuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  pushSubscribe(@CurrentUser() user: V1AuthUser, @Body() dto: PushSubscribeDto) {
    return this.webPushService.subscribe(user.id, dto);
  }

  @Delete('push-unsubscribe')
  @UseGuards(V1AuthGuard)
  @HttpCode(204)
  pushUnsubscribe(@CurrentUser() user: V1AuthUser, @Body() dto: PushUnsubscribeDto) {
    return this.webPushService.unsubscribe(user.id, dto.endpoint);
  }
}
```

If a `@Public()`-style decorator **does** already exist in `apps/v1_api/src/auth/`, use that pattern on the `vapid-public-key` route inside the existing `NotificationsController` instead of creating a new controller — follow whatever this codebase's actual convention turns out to be rather than the fallback above. If you create `WebPushController`, put its tests in a new `web-push.controller.spec.ts` (same mock pattern as `notifications.controller.spec.ts`) instead of extending that file, and skip Step 2's edit to `notifications.controller.spec.ts` — write the three tests from Step 2 against the new controller/file instead.

- [ ] **Step 5: Register in the module**

Edit `apps/v1_api/src/notifications/notifications.module.ts` (building on the realtime-gateway plan's version, which already added `imports: [RealtimeModule]`):

```ts
import { Module } from '@nestjs/common';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { RealtimeModule } from '../realtime/realtime.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { WebPushController } from './web-push.controller';
import { WebPushService } from './web-push.service';

@Module({
  imports: [RealtimeModule],
  controllers: [NotificationsController, WebPushController],
  providers: [NotificationsService, WebPushService, V1AuthGuard],
  exports: [NotificationsService, WebPushService],
})
export class NotificationsModule {}
```

(Adjust to match whichever controller structure Step 4 actually produced.)

- [ ] **Step 6: Run test to verify it passes**

Run: `cd apps/v1_api && pnpm exec jest --selectProjects unit --testPathPatterns="notifications.controller.spec.ts|web-push.controller.spec.ts"`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/v1_api/src/notifications
git commit -m "feat(v1-api): add vapid-public-key/push-subscribe/push-unsubscribe endpoints"
```

---

### Task 4: Wire `sendToUser` into `NotificationsService`

**Files:**
- Modify: `apps/v1_api/src/notifications/notifications.service.ts`
- Modify: `apps/v1_api/src/notifications/notifications.service.spec.ts`

**Interfaces:**
- Consumes: `WebPushService.sendToUser(userId, payload)` (Task 2), the existing `RealtimeGateway.emitToUser` call already present from the realtime-gateway plan.

- [ ] **Step 1: Read the current file**

Read `apps/v1_api/src/notifications/notifications.service.ts` in full. `createNotificationWithPrefCheck` currently ends with the `this.realtimeGateway.emitToUser(userId, 'notification:new', notification)` call added by the realtime-gateway plan.

- [ ] **Step 2: Write the failing test**

Add to `apps/v1_api/src/notifications/notifications.service.spec.ts` (alongside the existing `realtimeGateway` mock from the realtime-gateway plan, add a `webPushService` mock the same way):

```ts
it('calls WebPushService.sendToUser alongside the socket emit', async () => {
  prisma.v1NotificationPreference.findUnique.mockResolvedValue(null);
  prisma.v1Notification.create.mockResolvedValue(makeNotification({ id: 'notif-3', title: '알림 제목', body: '내용' }));

  await service.emitNotification('user-1', 'match_join', 'match-9');

  expect(webPushService.sendToUser).toHaveBeenCalledWith(
    'user-1',
    expect.objectContaining({ title: '알림 제목' }),
  );
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/v1_api && pnpm exec jest --selectProjects unit --testPathPatterns="notifications.service.spec.ts"`
Expected: FAIL — `WebPushService` not injected / `sendToUser` never called.

- [ ] **Step 4: Wire the call**

Edit `apps/v1_api/src/notifications/notifications.service.ts`:

```ts
import { WebPushService } from './web-push.service';

// ...

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeGateway: RealtimeGateway,
    private readonly webPushService: WebPushService,
  ) {}

  // ...inside createNotificationWithPrefCheck, right after the existing
  // this.realtimeGateway.emitToUser(...) call:

    this.realtimeGateway.emitToUser(userId, 'notification:new', notification);
    void this.webPushService
      .sendToUser(userId, { title, body: body ?? undefined, url: deepLink ?? undefined })
      .catch(() => {});
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/v1_api && pnpm exec jest --selectProjects unit --testPathPatterns="notifications.service.spec.ts"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/v1_api/src/notifications/notifications.service.ts apps/v1_api/src/notifications/notifications.service.spec.ts
git commit -m "feat(v1-api): send Web Push alongside every notification create"
```

---

### Task 5: Admin ops — failure log endpoints

**Files:**
- Create: `apps/v1_api/src/admin/admin-ops.controller.ts`
- Create: `apps/v1_api/src/admin/admin-ops.service.ts`
- Create: `apps/v1_api/src/admin/admin-ops.service.spec.ts`
- Modify: `apps/v1_api/src/admin/admin.module.ts`

- [ ] **Step 1: Read the existing admin module**

Read `apps/v1_api/src/admin/admin.module.ts` and one existing admin controller in full first, to match this codebase's actual `AdminGuard`/role-check pattern (v1's admin auth may differ from legacy's `AdminGuard` — use whatever v1 already uses for `/admin/*` routes, found by reading the existing controller, not assumed from legacy).

- [ ] **Step 2: Write the failing test**

Create `apps/v1_api/src/admin/admin-ops.service.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { AdminOpsService } from './admin-ops.service';
import { createHash } from 'node:crypto';

describe('AdminOpsService', () => {
  let service: AdminOpsService;
  const prisma = {
    v1WebPushFailureLog: { findMany: jest.fn(), update: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [AdminOpsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(AdminOpsService);
  });

  it('masks the userId as a sha256 8-char hash and keeps only the last 6 chars of the endpoint suffix', async () => {
    prisma.v1WebPushFailureLog.findMany.mockResolvedValue([
      {
        id: 'fail-1',
        userId: 'user-1',
        endpointSuffix: 'abcdefghijkl',
        statusCode: 500,
        occurredAt: new Date('2026-07-19T00:00:00Z'),
        acknowledgedAt: null,
      },
    ]);

    const result = await service.recentPushFailures(20);

    const expectedHash = createHash('sha256').update('user-1').digest('hex').slice(0, 8);
    expect(result[0].userIdHash).toBe(expectedHash);
    expect(result[0].endpointSuffix).toBe('ghijkl');
    expect(result[0]).not.toHaveProperty('userId');
  });

  it('ack records acknowledgedAt and acknowledgedBy', async () => {
    await service.acknowledgeFailures(['fail-1'], 'admin-user-1');

    expect(prisma.v1WebPushFailureLog.update).toHaveBeenCalledWith({
      where: { id: 'fail-1' },
      data: expect.objectContaining({ acknowledgedBy: 'admin-user-1' }),
    });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/v1_api && pnpm exec jest --selectProjects unit --testPathPatterns="admin-ops.service.spec.ts"`
Expected: FAIL — `./admin-ops.service` does not exist yet.

- [ ] **Step 4: Write the service**

Create `apps/v1_api/src/admin/admin-ops.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

export interface PushFailureSummary {
  id: string;
  userIdHash: string;
  endpointSuffix: string;
  statusCode: number | null;
  occurredAt: Date;
  acknowledgedAt: Date | null;
}

@Injectable()
export class AdminOpsService {
  constructor(private readonly prisma: PrismaService) {}

  async recentPushFailures(limit: number): Promise<PushFailureSummary[]> {
    const failures = await this.prisma.v1WebPushFailureLog.findMany({
      orderBy: { occurredAt: 'desc' },
      take: limit,
    });

    return failures.map((failure) => ({
      id: failure.id,
      userIdHash: createHash('sha256').update(failure.userId).digest('hex').slice(0, 8),
      endpointSuffix: failure.endpointSuffix.slice(-6),
      statusCode: failure.statusCode,
      occurredAt: failure.occurredAt,
      acknowledgedAt: failure.acknowledgedAt,
    }));
  }

  async acknowledgeFailures(ids: string[], acknowledgedBy: string): Promise<void> {
    await Promise.all(
      ids.map((id) =>
        this.prisma.v1WebPushFailureLog.update({
          where: { id },
          data: { acknowledgedAt: new Date(), acknowledgedBy },
        }),
      ),
    );
  }

  async pushFailuresLast5Minutes(): Promise<number> {
    return this.prisma.v1WebPushFailureLog.count({
      where: { occurredAt: { gte: new Date(Date.now() - 5 * 60_000) } },
    });
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/v1_api && pnpm exec jest --selectProjects unit --testPathPatterns="admin-ops.service.spec.ts"`
Expected: PASS (2 tests).

- [ ] **Step 6: Write the controller**

Create `apps/v1_api/src/admin/admin-ops.controller.ts`, matching whatever admin-guard pattern Step 1 found in the existing v1 admin controller (substitute `<AdminGuardOrEquivalent>` below with the real import/decorator):

```ts
import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { AdminOpsService } from './admin-ops.service';
// import the real v1 admin guard found in Step 1

class RecentPushFailuresQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

class AckPushFailuresDto {
  @IsArray()
  @IsString({ each: true })
  ids!: string[];
}

@Controller('admin/ops')
// @UseGuards(<AdminGuardOrEquivalent>)
export class AdminOpsController {
  constructor(private readonly adminOpsService: AdminOpsService) {}

  @Get('recent-push-failures')
  recentPushFailures(@Query() query: RecentPushFailuresQueryDto) {
    return this.adminOpsService.recentPushFailures(query.limit ?? 20);
  }

  @Post('push-failures/ack')
  ackPushFailures(/* @CurrentUser() admin: V1AuthUser, */ @Body() dto: AckPushFailuresDto) {
    return this.adminOpsService.acknowledgeFailures(dto.ids, 'admin' /* replace with admin.id from the real guard/decorator */);
  }
}
```

Replace the commented-out guard/current-user lines with the real v1 admin auth mechanism found in Step 1 — do not ship this controller with commented-out auth.

- [ ] **Step 7: Register in `AdminModule`**

Read `apps/v1_api/src/admin/admin.module.ts` in full and add `AdminOpsController` to `controllers` and `AdminOpsService` to `providers`, following whatever import structure the existing module already uses.

- [ ] **Step 8: Type-check**

Run: `cd apps/v1_api && pnpm exec tsc --noEmit`
Expected: clean once the real admin guard is wired in (Step 6's placeholder must be gone).

- [ ] **Step 9: Commit**

```bash
git add apps/v1_api/src/admin
git commit -m "feat(v1-api): add admin ops endpoints for web push failure logs"
```

---

### Task 6: Frontend — service worker + `useV1PushRegistration`

**Files:**
- Create: `apps/v1_web/public/sw-push.js`
- Create: `apps/v1_web/src/hooks/use-v1-push-registration.ts`
- Create: `apps/v1_web/src/hooks/use-v1-push-registration.test.ts`

**Interfaces:**
- Produces: `usePushRegistration(): { subscribe: () => Promise<void>; unsubscribe: () => Promise<void>; permission: NotificationPermission | 'unsupported'; isSubscribed: boolean }`.

- [ ] **Step 1: Write the service worker**

Create `apps/v1_web/public/sw-push.js`:

```js
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'Teameet';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-72.png',
      data: { url: data.url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(self.clients.openWindow(url));
});
```

Confirm `/icons/icon-192.png` and `/icons/badge-72.png` exist under `apps/v1_web/public/`; if v1 uses different existing icon filenames (check `apps/v1_web/src/app/manifest.ts` for whatever paths it already references), use those real paths instead of inventing new ones.

- [ ] **Step 2: Write the failing test**

Create `apps/v1_web/src/hooks/use-v1-push-registration.test.ts`:

```ts
import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api-client', () => ({
  v1Get: vi.fn(),
  v1Post: vi.fn(),
  v1Delete: vi.fn(),
}));

import { v1Get, v1Post, v1Delete } from '@/lib/api-client';

const subscription = { endpoint: 'https://push.example/abc', toJSON: () => ({ endpoint: 'https://push.example/abc', keys: { p256dh: 'p', auth: 'a' } }), unsubscribe: vi.fn().mockResolvedValue(true) };
const pushManager = { getSubscription: vi.fn(), subscribe: vi.fn() };
const registration = { pushManager };

beforeEach(() => {
  vi.clearAllMocks();
  pushManager.getSubscription.mockResolvedValue(null);
  pushManager.subscribe.mockResolvedValue(subscription);
  Object.defineProperty(global.navigator, 'serviceWorker', {
    configurable: true,
    value: { register: vi.fn().mockResolvedValue(registration), ready: Promise.resolve(registration) },
  });
  Object.defineProperty(global, 'Notification', {
    configurable: true,
    value: { permission: 'default', requestPermission: vi.fn().mockResolvedValue('granted') },
  });
  (v1Get as ReturnType<typeof vi.fn>).mockResolvedValue({ publicKey: 'BPUBLICKEY' });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useV1PushRegistration', () => {
  it('subscribes: requests permission, registers the SW, and posts the subscription', async () => {
    const { useV1PushRegistration } = await import('./use-v1-push-registration');
    const { result } = renderHook(() => useV1PushRegistration());

    await act(async () => {
      await result.current.subscribe();
    });

    expect(Notification.requestPermission).toHaveBeenCalled();
    expect(navigator.serviceWorker.register).toHaveBeenCalledWith('/sw-push.js');
    expect(v1Post).toHaveBeenCalledWith('/notifications/push-subscribe', {
      endpoint: 'https://push.example/abc',
      keys: { p256dh: 'p', auth: 'a' },
    });
  });

  it('does nothing when permission is already denied', async () => {
    (global as typeof globalThis & { Notification: unknown }).Notification = {
      permission: 'denied',
      requestPermission: vi.fn(),
    };
    const { useV1PushRegistration } = await import('./use-v1-push-registration');
    const { result } = renderHook(() => useV1PushRegistration());

    await act(async () => {
      await result.current.subscribe();
    });

    expect(v1Post).not.toHaveBeenCalled();
  });

  it('unsubscribe calls the server delete before the browser unsubscribe', async () => {
    pushManager.getSubscription.mockResolvedValue(subscription);
    const { useV1PushRegistration } = await import('./use-v1-push-registration');
    const { result } = renderHook(() => useV1PushRegistration());
    await waitFor(() => expect(result.current.isSubscribed).toBe(true));

    await act(async () => {
      await result.current.unsubscribe();
    });

    expect(v1Delete).toHaveBeenCalledWith('/notifications/push-unsubscribe', { endpoint: 'https://push.example/abc' });
    expect(subscription.unsubscribe).toHaveBeenCalled();
  });
});
```

Read `apps/v1_web/src/lib/api-client.ts` in full first to confirm the exact exported names/signatures of `v1Get`/`v1Post`/`v1Delete` (already known from earlier work in this repo: `v1Get<T>(path, query?)`, `v1Post<T>(path, body?, init?)`, `v1Delete<T>(path, init?)` — note `v1Delete` does **not** currently take a body parameter; if the unsubscribe call needs to send `{ endpoint }` in the body, either extend `v1Delete` to accept an optional body argument the same way `v1Post` does, or call `v1Api('/notifications/push-unsubscribe', { method: 'DELETE', body: JSON.stringify({ endpoint }) })` directly — pick whichever keeps `api-client.ts`'s existing call sites unchanged, and update this test's mock/assertion to match whichever you pick).

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/v1_web && pnpm exec vitest run src/hooks/use-v1-push-registration.test.ts`
Expected: FAIL — `./use-v1-push-registration` does not exist yet.

- [ ] **Step 4: Write the hook**

Create `apps/v1_web/src/hooks/use-v1-push-registration.ts`:

```ts
import { useCallback, useEffect, useState } from 'react';
import { v1Delete, v1Get, v1Post } from '@/lib/api-client';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

export function useV1PushRegistration() {
  const [isSubscribed, setIsSubscribed] = useState(false);
  const supported = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;
  const permission = supported ? Notification.permission : 'unsupported';

  useEffect(() => {
    if (!supported) return;
    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => setIsSubscribed(subscription !== null))
      .catch(() => {});
  }, [supported]);

  const subscribe = useCallback(async () => {
    if (!supported || Notification.permission === 'denied') return;

    const permissionResult = await Notification.requestPermission();
    if (permissionResult !== 'granted') return;

    const registration = await navigator.serviceWorker.register('/sw-push.js');
    const { publicKey } = await v1Get<{ publicKey: string | null }>('/notifications/vapid-public-key');
    if (!publicKey) return;

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
    const json = subscription.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };

    await v1Post('/notifications/push-subscribe', { endpoint: json.endpoint, keys: json.keys });
    setIsSubscribed(true);
  }, [supported]);

  const unsubscribe = useCallback(async () => {
    if (!supported) return;
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;

    await v1Delete('/notifications/push-unsubscribe', { endpoint: subscription.endpoint });
    await subscription.unsubscribe();
    setIsSubscribed(false);
  }, [supported]);

  return { subscribe, unsubscribe, permission, isSubscribed };
}
```

If `v1Delete` doesn't already accept a body parameter (confirm by reading `api-client.ts` per Step 2's note), extend its signature there as `v1Delete<T>(path: string, body?: unknown, init?: RequestInit)` mirroring `v1Post`'s shape, rather than reaching around it — this keeps every future DELETE-with-body caller consistent.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/v1_web && pnpm exec vitest run src/hooks/use-v1-push-registration.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/v1_web/public/sw-push.js apps/v1_web/src/hooks/use-v1-push-registration.ts apps/v1_web/src/hooks/use-v1-push-registration.test.ts apps/v1_web/src/lib/api-client.ts
git commit -m "feat(v1-web): add push service worker and useV1PushRegistration hook"
```

---

### Task 7: Frontend — settings toggle + post-onboarding auto-prompt

**Files:**
- Modify: `apps/v1_web/src/components/my/my-api-clients.tsx` (`NotificationSettingsPageClient`, line ~1186)
- Modify: `apps/v1_web/src/components/auth/onboarding-client.tsx`
- Modify: `apps/v1_web/src/components/my/my-api-clients.test.tsx` (or wherever `NotificationSettingsPageClient` is already tested — find it first)
- Modify: `apps/v1_web/src/components/auth/onboarding-client.test.tsx` (or equivalent)

- [ ] **Step 1: Read both target files in full**

Read `apps/v1_web/src/components/my/my-api-clients.tsx` around `NotificationSettingsPageClient` (line ~1186) and `apps/v1_web/src/components/auth/onboarding-client.tsx` around `complete()` (line ~200, shown in the design doc's research) in full before editing either.

- [ ] **Step 2: Write the failing tests**

Find each component's existing test file (search for `NotificationSettingsPageClient` and `OnboardingClient`/`onboarding-client` inside `apps/v1_web/src/**/*.test.tsx`) and add, matching that file's existing render/mock setup:

For the settings page:
```tsx
it('subscribes to push notifications when the toggle is turned on', async () => {
  const subscribe = vi.fn();
  vi.mocked(useV1PushRegistration).mockReturnValue({
    subscribe,
    unsubscribe: vi.fn(),
    permission: 'default',
    isSubscribed: false,
  });
  const user = userEvent.setup();
  render(<NotificationSettingsPageClient />);

  await user.click(screen.getByRole('switch', { name: '브라우저 알림 받기' }));

  expect(subscribe).toHaveBeenCalled();
});
```

For onboarding:
```tsx
it('triggers a push subscription prompt after onboarding completes', async () => {
  const subscribe = vi.fn();
  vi.mocked(useV1PushRegistration).mockReturnValue({
    subscribe,
    unsubscribe: vi.fn(),
    permission: 'default',
    isSubscribed: false,
  });
  // ...reuse this file's existing setup to drive `complete()` to success...

  expect(subscribe).toHaveBeenCalled();
});
```

(Both need `vi.mock('@/hooks/use-v1-push-registration')` at the top of their respective test files, matching however that file already mocks sibling hooks.)

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd apps/v1_web && pnpm exec vitest run <the two test files found in Step 2>`
Expected: FAIL — toggle/prompt not wired yet.

- [ ] **Step 4: Wire the settings toggle**

Inside `NotificationSettingsPageClient` (`apps/v1_web/src/components/my/my-api-clients.tsx`), import `useV1PushRegistration` from `@/hooks/use-v1-push-registration` and add a toggle using this codebase's existing `role="switch"` pattern (search the file/`components/v1-ui/primitives` for an existing switch/toggle component already used elsewhere on this page — reuse it, don't hand-roll a new one) labeled "브라우저 알림 받기", wired to `subscribe()`/`unsubscribe()` based on `isSubscribed`. If `permission === 'unsupported'`, hide the toggle entirely (no unsupported-browser messaging needed for v1).

- [ ] **Step 5: Wire the post-onboarding auto-prompt**

Inside `onboarding-client.tsx`'s `complete()` function, after the existing `trackEvent('onboarding_complete', {})` line and before `router.replace(...)`, call the push hook's `subscribe()`:

```ts
  const pushRegistration = useV1PushRegistration();

  // ...

  const complete = () => {
    if (pending) return;
    setError(null);
    completeOnboarding.mutate(undefined, {
      onSuccess: (result) => {
        trackEvent('onboarding_complete', {});
        void pushRegistration.subscribe();
        clearDraft();
        router.replace(result.next?.route ?? '/home');
      },
      onError: (nextError) => setError(getErrorMessage(nextError)),
    });
  };
```

`subscribe()` internally no-ops when permission is already `denied` (Task 6), so this is safe to fire unconditionally — it either shows the native permission prompt or does nothing.

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd apps/v1_web && pnpm exec vitest run <the two test files>`
Expected: PASS.

- [ ] **Step 7: Type-check and lint**

Run: `cd apps/v1_web && pnpm exec tsc --noEmit && pnpm lint`
Expected: both clean.

- [ ] **Step 8: Commit**

```bash
git add apps/v1_web/src/components/my/my-api-clients.tsx apps/v1_web/src/components/auth/onboarding-client.tsx
git add <the two test files found in Step 2>
git commit -m "feat(v1-web): wire push permission prompt to settings toggle and onboarding completion"
```

---

### Task 8: Frontend — admin failure-log table

**Files:**
- Create: `apps/v1_web/src/app/admin/ops/push-failures/page.tsx`
- Create: `apps/v1_web/src/components/admin/push-failure-table.tsx`
- Create: `apps/v1_web/src/components/admin/push-failure-table.test.tsx`
- Modify: `apps/v1_web/src/hooks/use-v1-api.ts` (or the relevant domain hook file it re-exports from — check the `hooks/api/<domain>.ts` split noted in this repo's docs first)

- [ ] **Step 1: Read the existing admin ops/list-page conventions**

Read one existing v1 admin list page in full (e.g. `apps/v1_web/src/app/admin/admins/page.tsx`, seen in this repo's git status) for the layout/data-fetching pattern v1 admin pages already use, and read `apps/v1_web/src/hooks/use-v1-api.ts` to find where to add the two new hooks so they match the existing naming/organization (barrel file vs. domain-split file per that file's own top-of-file convention).

- [ ] **Step 2: Add the API hooks**

Add to whichever file Step 1 identifies as the correct location:

```ts
export function useV1RecentPushFailures(limit = 20) {
  return useQuery({
    queryKey: ['v1-admin-push-failures', limit],
    queryFn: () => v1Get<PushFailureSummary[]>('/admin/ops/recent-push-failures', { limit }),
  });
}

export function useV1AckPushFailures() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => v1Post('/admin/ops/push-failures/ack', { ids }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['v1-admin-push-failures'] }),
  });
}

export interface PushFailureSummary {
  id: string;
  userIdHash: string;
  endpointSuffix: string;
  statusCode: number | null;
  occurredAt: string;
  acknowledgedAt: string | null;
}
```

Match the exact `useQuery`/`useMutation`/`v1Get`/`v1Post` import paths already used by neighboring hooks in the same file — do not introduce a second React Query wrapper convention.

- [ ] **Step 3: Write the failing component test**

Create `apps/v1_web/src/components/admin/push-failure-table.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PushFailureTable } from './push-failure-table';

vi.mock('@/hooks/use-v1-api', () => ({
  useV1RecentPushFailures: () => ({
    data: [
      { id: 'fail-1', userIdHash: 'abcd1234', endpointSuffix: 'ghijkl', statusCode: 500, occurredAt: '2026-07-19T00:00:00Z', acknowledgedAt: null },
    ],
    isLoading: false,
  }),
  useV1AckPushFailures: () => ({ mutate: vi.fn(), isPending: false }),
}));

describe('PushFailureTable', () => {
  it('renders the masked failure row and an ack button', () => {
    render(<PushFailureTable />);

    expect(screen.getByText(/abcd1234/)).toBeInTheDocument();
    expect(screen.getByText(/ghijkl/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /확인/ })).toBeInTheDocument();
  });

  it('calls ack when the button is clicked', async () => {
    const user = userEvent.setup();
    render(<PushFailureTable />);

    await user.click(screen.getByRole('button', { name: /확인/ }));
    // assertion depends on the mocked mutate above; verify it was called with ['fail-1']
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd apps/v1_web && pnpm exec vitest run src/components/admin/push-failure-table.test.tsx`
Expected: FAIL — `./push-failure-table` does not exist yet.

- [ ] **Step 5: Write the component**

Create `apps/v1_web/src/components/admin/push-failure-table.tsx` following this repo's existing admin table styling conventions (check `apps/v1_web/src/app/admin/admins/page.tsx` from Step 1 for the actual table/card markup pattern and design tokens in use — do not hardcode colors, per CLAUDE.md's token-first rule):

```tsx
'use client';

import { useV1AckPushFailures, useV1RecentPushFailures } from '@/hooks/use-v1-api';
import { formatDateTime } from '@/lib/utils';

export function PushFailureTable() {
  const { data: failures, isLoading } = useV1RecentPushFailures();
  const ackMutation = useV1AckPushFailures();

  if (isLoading) return <p>불러오는 중이에요...</p>;
  if (!failures || failures.length === 0) return <p>최근 실패 기록이 없어요.</p>;

  return (
    <table>
      <thead>
        <tr>
          <th>사용자</th>
          <th>구독</th>
          <th>상태 코드</th>
          <th>발생 시각</th>
          <th>확인</th>
        </tr>
      </thead>
      <tbody>
        {failures.map((failure) => (
          <tr key={failure.id}>
            <td>{failure.userIdHash}</td>
            <td>...{failure.endpointSuffix}</td>
            <td>{failure.statusCode ?? '-'}</td>
            <td>{formatDateTime(failure.occurredAt)}</td>
            <td>
              {failure.acknowledgedAt ? (
                '확인됨'
              ) : (
                <button type="button" onClick={() => ackMutation.mutate([failure.id])}>
                  확인
                </button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

Adapt the markup/classes to match this repo's actual admin table component (reuse an existing shared table primitive if one exists under `components/v1-ui/primitives` — check before writing raw `<table>` markup).

- [ ] **Step 6: Run test to verify it passes**

Run: `cd apps/v1_web && pnpm exec vitest run src/components/admin/push-failure-table.test.tsx`
Expected: PASS.

- [ ] **Step 7: Add the page route**

Create `apps/v1_web/src/app/admin/ops/push-failures/page.tsx`:

```tsx
import { PushFailureTable } from '@/components/admin/push-failure-table';

export default function AdminPushFailuresPage() {
  return (
    <main>
      <h1>Web Push 실패 로그</h1>
      <PushFailureTable />
    </main>
  );
}
```

Match this repo's actual admin page wrapper (`AppChrome` or equivalent, per Step 1's reference page) instead of a bare `<main>` if the existing convention wraps admin pages in shared chrome.

- [ ] **Step 8: Type-check and lint**

Run: `cd apps/v1_web && pnpm exec tsc --noEmit && pnpm lint`
Expected: both clean.

- [ ] **Step 9: Commit**

```bash
git add apps/v1_web/src/app/admin/ops apps/v1_web/src/components/admin/push-failure-table.tsx apps/v1_web/src/components/admin/push-failure-table.test.tsx apps/v1_web/src/hooks/use-v1-api.ts
git commit -m "feat(v1-web): add admin web push failure log table"
```

---

### Task 9: Infra — VAPID env wiring + whole-branch verification

**Files:**
- Modify: `deploy/docker-compose.prod.yml`

- [ ] **Step 1: Add the VAPID env vars to `v1_api`**

Edit `deploy/docker-compose.prod.yml` — in the `v1_api` service's `environment:` block (already has `LOG_LEVEL` from the observability-skeleton PR), add:

```yaml
      VAPID_PUBLIC_KEY: ${VAPID_PUBLIC_KEY:-}
      VAPID_PRIVATE_KEY: ${VAPID_PRIVATE_KEY:-}
      VAPID_SUBJECT: ${VAPID_SUBJECT:-}
```

No Dockerfile change needed — these are backend runtime env vars, not frontend build args.

- [ ] **Step 2: Validate**

Run: `docker compose -f deploy/docker-compose.prod.yml config --quiet`
Expected: exits 0.

- [ ] **Step 3: Add a changeset**

```bash
cat > .changeset/v1-web-push.md << 'EOF'
---
"v1_api": minor
"v1_web": minor
---

Add VAPID-based Web Push (subscribe/unsubscribe/send, graceful-disable when unconfigured) with an admin failure-log dashboard, wired into the same notification pipeline the realtime gateway uses.
EOF
git add deploy/docker-compose.prod.yml .changeset/v1-web-push.md
git commit -m "chore(deploy): wire VAPID env vars into v1_api + changeset"
```

- [ ] **Step 4: Backend full unit suite + type-check**

Run: `cd apps/v1_api && pnpm test && pnpm exec tsc --noEmit`
Expected: all green, clean.

- [ ] **Step 5: Frontend full test suite + lint**

Run: `cd apps/v1_web && pnpm test && pnpm lint`
Expected: all green, clean.

- [ ] **Step 6: Manual verification**

Start the v1 stack locally without VAPID env vars set; confirm `GET /api/v1/notifications/vapid-public-key` returns `{ publicKey: null }` and no error (graceful disable). Then, if a test VAPID keypair is available (`web-push generate-vapid-keys` locally), set the three env vars, restart, subscribe from a real browser tab via the settings toggle, and trigger a notification-producing action; confirm an OS-level push notification appears even with the tab backgrounded. Record what you actually observed — this is the real proof, not just green tests.

- [ ] **Step 7: Push and open the PR**

```bash
git push -u origin feat/v1-web-push
gh pr create --base dev --title "feat(v1): Web Push (VAPID) with admin failure-log dashboard" --body "$(cat <<'EOF'
## Summary
- Ported legacy's VAPID Web Push (graceful-disable, 410/404 subscription cleanup) into apps/v1_api as WebPushService
- New V1PushSubscription/V1WebPushFailureLog Prisma models + migration
- vapid-public-key / push-subscribe / push-unsubscribe endpoints; wired into the same NotificationsService trigger point the realtime gateway uses
- Admin ops dashboard (recent-push-failures + ack) with PII-masked userId/endpoint
- Frontend: sw-push.js service worker, useV1PushRegistration, permission prompt from both the notification settings toggle and right after onboarding completes

Spec: docs/superpowers/specs/2026-07-19-v1-web-push-design.md
Plan: docs/superpowers/plans/2026-07-19-v1-web-push-plan.md

Depends on and was branched from the merged feat/v1-realtime-gateway PR.

## Test plan
- [x] apps/v1_api unit suite green (new web-push.service.spec.ts, admin-ops.service.spec.ts, updated notifications specs)
- [x] apps/v1_api tsc --noEmit clean
- [x] apps/v1_web test suite green, lint clean
- [x] Manual: vapid-public-key gracefully returns null with no VAPID env vars set
- [x] Manual: real browser subscribe + backgrounded-tab push notification received (with a test VAPID keypair)
EOF
)"
```

## Self-Review Notes

- **Spec coverage:** Prisma models (Task 1), `WebPushService` graceful-disable + `sendToUser` (Task 2), three endpoints (Task 3), trigger wiring shared with the realtime gateway (Task 4), admin ops dashboard (Task 5), service worker + hook (Task 6), both permission-UX paths — settings toggle and post-onboarding auto-prompt (Task 7), admin table UI (Task 8), VAPID env wiring (Task 9). Alpha VAPID wiring and Slack-alert-cron porting are explicitly out of scope per the spec's Ambiguity Log.
- **Placeholder scan:** the one commented-out guard line in Task 5 Step 6 is intentional and explicitly flagged as "must be replaced, do not ship" — not a silent placeholder; every other step has complete code.
- **Type consistency:** `WebPushService.sendToUser(userId, {title, body?, url?})` signature matches between Task 2 (definition) and Task 4 (call site). `useV1PushRegistration()`'s returned shape (`subscribe`/`unsubscribe`/`permission`/`isSubscribed`) matches between Task 6 (definition) and Task 7 (consumption in both call sites).
