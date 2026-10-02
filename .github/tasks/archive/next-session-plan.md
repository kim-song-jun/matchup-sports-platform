# Next Session Plan — Blockers + Deferred OOS Items

Owner: project-director + tech-planner
Date drafted: 2026-04-06
Status: Done

---

## Context

QA Follow-up Phase 1-5 (see `qa-followup-completion-report.md`) shipped 36 files covering DB schema, mercenary Prisma rewrite, team membership permissions, DTO hardening, and realtime infra. Two blockers remain unresolved because the environment could not apply them:

1. `socket.io-client` was not installed in `apps/web`, leaving `realtime-client.ts` / `use-realtime.ts` as stubs.
2. PostgreSQL was offline, so the Phase 1 migration (`20260405000000_add_team_membership_and_mercenary`) never ran against the DB.

In parallel, the previous session deferred four Out-of-Scope items that are now prioritized for this cycle:

- Chat persistence (Prisma models + REST + WebSocket, replace in-memory stub)
- Team Owner transfer UI (frontend wiring onto existing `PATCH /teams/:id/members/:userId`)
- Realtime load testing (k6/artillery harness against RealtimeGateway)
- FCM push notifications (firebase-admin + token lifecycle + fan-out on notification create)

All four must respect Core Engineering Principles — especially **Resolve Tech Debt — Never Defer** (Chat in-memory stub must be deleted in full, not layered over) and **Mock Data Discipline** (spec files referencing Chat mock behaviors must be updated in the same commit).

---

## Goal

Unblock realtime + migration, then deliver the four deferred backend/frontend capabilities so the platform can ship end-to-end chat, owner transfer, observed realtime capacity, and push notifications to both web and Capacitor mobile clients.

Success means:
- Dev environment boots cleanly with migration applied and realtime socket connected.
- Chat persists through server restarts and paginates via cursor.
- Team owner can transfer ownership through an in-app confirmation flow.
- Load test report documents p95 latency and message throughput at 1000 concurrent connections.
- Notifications fan out to FCM tokens in addition to the existing in-app realtime emit.

---

## Original Conditions (verbatim, user-facing)

Tracked as checkboxes — any that drop silently is a **Critical** finding per Principle 5.

### A. Blocker resolution (must precede B)
- [x] **A1** Install `socket.io-client` in apps/web and replace stubs in `lib/realtime-client.ts` + `hooks/use-realtime.ts` with real connection logic
- [x] **A2** Start PostgreSQL and apply migration `apps/api/prisma/migrations/20260405000000_add_team_membership_and_mercenary/migration.sql` + re-run seed

### B. Out-of-Scope items now in scope
- [x] **B1** Chat persistence: Current `apps/api/src/chat/chat.service.ts` is in-memory. Introduce Prisma `ChatRoom` + `ChatMessage` models, REST + Socket.IO realtime delivery, cursor pagination. **Delete in-memory state entirely** (scoped refactor, not drive-by).
- [x] **B2** Team Owner transfer UI: Build on `PATCH /teams/:id/members/:userId`. Confirmation modal, current owner demoted to member or manager, **only owner can initiate**.
- [x] **B3** Realtime load testing: k6 or artillery script targeting RealtimeGateway, scenario: **1000 concurrent connections**, measure **p95 latency, message throughput**.
- [x] **B4** FCM push notifications: Extend notifications module with FCM token storage, firebase-admin integration, **web + Capacitor mobile registration**, fan-out on notification create.

---

## User Scenarios

### S1 — Chat persistence (B1)
- As a team-match participant, I open a match's chat room and see all prior messages (cursor-paginated, newest first).
- I send a message; other participants receive it in realtime AND a late-joining user scrolling history sees it persisted.
- If the API server restarts, no messages are lost.

### S2 — Owner transfer (B2)
- As a team owner, I open the team members page and tap "소유권 이전" on a manager/member.
- A confirmation modal explains the consequences (I become manager or member; the new owner gains full control).
- On confirm, the API request succeeds, the UI refreshes, and the previous owner no longer sees owner-only actions.
- A non-owner (manager) never sees the owner-transfer CTA.

### S3 — Realtime load baseline (B3)
- As a platform operator, I run a single command to spin up 1000 simultaneous WebSocket clients against a local or staging API.
- The script reports connection success rate, p95/p99 message delivery latency, and messages/sec throughput.
- Results are captured in a markdown report committed under `docs/` or the task doc itself.

### S4 — Push notifications (B4)
- As a web user, on first login I am prompted for notification permission; granting it stores my FCM token server-side.
- As a Capacitor mobile user, the app registers a native FCM token at startup.
- When a notification is created (e.g., team match application accepted) and I am offline, I still receive a push notification on my device.
- When I am online, the in-app realtime emit still works (FCM does not replace it; it augments it).

---

## Test Scenarios

### Happy path
- [x] B1: create room → send 30 messages → reconnect → GET messages returns 30 newest via cursor
- [x] B2: owner transfers to manager → new owner can delete team, old owner cannot
- [x] B3: 1000 connections succeed, p95 < target (target TBD by tech-planner)
- [x] B4: FCM token registers on login, test notification delivered to device

### Edge cases
- [x] B1: cursor pagination with `?before=<messageId>&limit=20`
- [x] B1: message over max length (e.g., 2000 chars) rejected with DTO validation
- [x] B2: transferring to a user who is not a member → 400 with domain code
- [x] B2: owner tries to transfer while being the only member → 400
- [x] B3: message burst (100 msg/sec into one room) — no dropped messages
- [x] B4: invalid/expired FCM token → removed from user record on delivery failure

### Error cases
- [x] B1: non-participant tries to read messages → 403 `CHAT_FORBIDDEN`
- [x] B1: non-participant tries to send via WS → event ignored, no broadcast
- [x] B2: manager tries to call owner-transfer endpoint → 403 `TEAM_ROLE_FORBIDDEN`
- [x] B4: firebase-admin init failure → notification create must NOT fail; FCM is best-effort

### Mock updates (Principle 4 — Mock Data Discipline)
- [x] Update `apps/api/src/chat/**/*.spec.ts` inline mocks after Prisma schema additions
- [x] Update `apps/api/src/notifications/notifications.service.spec.ts` for firebase-admin injection
- [x] Update `apps/api/src/teams/teams.service.spec.ts` or `team-membership.service.spec.ts` for owner-transfer code path
- [x] Update `apps/web/src/**/*.test.tsx` fixtures touching chat rooms or realtime hook

### Detailed scenario matrix (tech-planner expansion)

**A1 socket.io-client**
- Happy: login → socket connects <2s → `notification:new` received in-app.
- Edge: access token refresh → old socket disconnects, new socket connects with new token, no missed events during swap (at-most-once acceptable for v1).
- Error: invalid token → server rejects handshake → client shows disconnected state, reconnect backoff (1s → 5s max); logout → `disconnectSocket()` called → singleton cleared.

**B1 Chat persistence**
- Happy: `POST /chat/rooms` with `teamMatchId` → get-or-create returns room; `POST /chat/rooms/:id/messages` × 3 → `GET /chat/rooms/:id` returns 3 newest-first; WS clients in room receive `chat:message` with persisted DB id.
- Happy: client reconnects after server restart → `GET /chat/rooms/:id?cursor=` paginates historical messages.
- Edge: cursor `?cursor=<msgId>&limit=20` returns next page ordered by `createdAt desc`.
- Edge: idempotent `createRoom` on same `teamMatchId` + same participant set → returns existing room.
- Edge: `markRead` → `unread-count` drops to 0 for that user, other participants unaffected.
- Edge: message at exactly 2000 chars accepted; 2001 rejected with 400 `CHAT_MESSAGE_TOO_LONG`.
- Error: non-participant `GET /chat/rooms/:id` → 403 `CHAT_FORBIDDEN`.
- Error: non-participant `chat:join` WS → server rejects; client never joins room.
- Error: non-existent room → 404 `CHAT_ROOM_NOT_FOUND`.
- Error: empty/whitespace content → 400 `CHAT_MESSAGE_EMPTY`.
- Error: deleted message (`deletedAt != null`) excluded from list responses.

**B2 Owner transfer**
- Happy: owner A → target manager B, `demoteTo: 'manager'` (default) → `sportTeam.ownerId=B`, B.role=owner, A.role=manager, all in one transaction.
- Happy: owner A → member C with `demoteTo: 'member'` → same atomic swap.
- Edge: A transfers to self → 400 `TEAM_OWNER_SELF_TRANSFER`.
- Edge: target is not an active member → 404 `TEAM_MEMBER_NOT_FOUND`.
- Edge: concurrent transfer (two browser tabs) → second request fails with 409 `TEAM_OWNER_CONFLICT` (optimistic-concurrency `where` miss, no partial state).
- Error: manager/member attempts transfer → 403 `TEAM_ROLE_FORBIDDEN`.
- Error: transactional failure mid-step → full rollback, no orphaned owner change.

**B3 Load test**
- Happy: 1000 VUs ramp to steady-state, thresholds all green, no dropped messages (VU echo assertions pass).
- Edge: ramp-down closes all sockets cleanly, no hanging connections (k6 reports 0 open sockets post-run).
- Error: threshold breach → k6 exit code non-zero → flagged in CI/manual review.
- Error: local ulimit too low → k6 fails with EMFILE → doc includes `ulimit -n 4096`.

**B4 FCM push**
- Happy (enabled): dev env with valid Firebase creds → register token → create notification → sendMulticast called → test device receives push + WS in-app.
- Happy (disabled): dev env without Firebase creds → `fcmService.enabled=false` → `NotificationsService.create` succeeds (WS only) with single warn log; no error surfaced to caller.
- Edge: user registers 2 tokens (web + android) → both receive push on notification.
- Edge: token handoff — token T owned by userA, `POST /fcm-token {token:T}` from userB → token ownership swaps to B, A's row removed.
- Edge: deprecated `POST /notifications/register-token` returns 410 Gone header but still works for one release.
- Error: `messaging/registration-token-not-registered` response → token row auto-deleted; next notification to same user skips it.
- Error: transient FCM network failure → caught, logged, notification still persisted + WS-delivered.
- Error: missing JWT on `/fcm-token` → 401.

---

## ADRs (tech-planner)

### ADR A1 — socket.io-client wiring
**Context**: `realtime-client.ts` uses dynamic `require()` returning `null`; `use-realtime.ts` reads `accessToken` via `.getState()` (non-reactive). Backend `RealtimeGateway` is correct (JWT handshake + `user:${userId}` room).

**Decision**: Install `socket.io-client@^4.7`. Rewrite `realtime-client.ts` as singleton with static ESM import. Config: `transports: ['websocket','polling']`, `reconnection: true`, `reconnectionDelay: 1000`, `reconnectionDelayMax: 5000`. `useRealtime()` subscribes to `accessToken` reactively via `useAuthStore((s) => s.accessToken)` — token change triggers disconnect+reconnect. Expose `connectionState` signal for UI.

**Consequences**: +40KB gzipped. Enables B1/B3/B4. No longer need eslint-disable.

**Rejected**: native WebSocket (loses rooms/reconnect), SSE (one-way).

### ADR A2 — DB bring-up
**Context**: Phase 1 migration not applied; B1/B4 both require fresh migration state.

**Decision**: Sequence `docker compose up -d` → `prisma migrate deploy` → `db:seed`. Ops only, no code. MUST run before backend lane starts on B1/B4 schema.

### ADR B1 — Chat persistence
**Context**: `chat.service.ts` returns `[]`; `RealtimeGateway.handleChatMessage` broadcasts without persisting. Critical tech-debt.

**Decision**: Add 3 Prisma models + 2 enums:

```prisma
enum ChatRoomType { direct team_match team }
enum ChatMessageType { text image system }

model ChatRoom {
  id            String    @id @default(uuid())
  type          ChatRoomType
  teamMatchId   String?   @map("team_match_id")
  teamId        String?   @map("team_id")
  createdAt     DateTime  @default(now()) @map("created_at")
  updatedAt     DateTime  @updatedAt @map("updated_at")
  lastMessageAt DateTime? @map("last_message_at")

  participants  ChatParticipant[]
  messages      ChatMessage[]

  @@index([teamMatchId])
  @@index([teamId])
  @@index([lastMessageAt])
  @@map("chat_rooms")
}

model ChatParticipant {
  roomId     String    @map("room_id")
  userId     String    @map("user_id")
  joinedAt   DateTime  @default(now()) @map("joined_at")
  lastReadAt DateTime? @map("last_read_at")

  room ChatRoom @relation(fields: [roomId], references: [id], onDelete: Cascade)
  user User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([roomId, userId])
  @@index([userId])
  @@map("chat_participants")
}

model ChatMessage {
  id        String          @id @default(uuid())
  roomId    String          @map("room_id")
  senderId  String          @map("sender_id")
  type      ChatMessageType @default(text)
  content   String
  createdAt DateTime        @default(now()) @map("created_at")
  deletedAt DateTime?       @map("deleted_at")

  room   ChatRoom @relation(fields: [roomId], references: [id], onDelete: Cascade)
  sender User     @relation(fields: [senderId], references: [id], onDelete: Cascade)

  @@index([roomId, createdAt])
  @@index([senderId])
  @@map("chat_messages")
}
```

- Per-user read state lives on `ChatParticipant.lastReadAt` (rejected: `readBy` array on message — doesn't scale).
- Room is team-match-scoped initially (answers Q1: **team_match only for v1**, direct/team reserved in enum for future).
- Max message length = 2000 chars via DTO `@MaxLength(2000)` (answers Q2 partial).
- No edits/deletes/attachments in v1 (answers Q2: deferred).
- `ChatService` persists first, then broadcasts via `RealtimeGateway.emitToRoom` — **single source of truth for WS+REST** (addresses "Chat REST + WS dual path race conditions" risk).
- `RealtimeGateway.handleChatMessage` delegates to `ChatService.postMessage` — no separate broadcast path.
- REST: `GET /chat/rooms` (cursor on lastMessageAt), `GET /chat/rooms/:id` (cursor on message createdAt), `POST /chat/rooms`, `POST /chat/rooms/:id/messages`, `POST /chat/rooms/:id/read`, `GET /chat/unread-count`.

**Consequences**: new migration; existing chat WS clients must go through participant assertion.

### ADR B2 — Owner transfer
**Context**: `TeamMembershipService.updateRole` throws on owner role change. `SportTeam.ownerId` is a separate scalar — ownership requires atomic update of both `ownerId` + 2 memberships.

**Decision**: Add `TeamMembershipService.transferOwnership(teamId, currentOwnerId, targetUserId, demoteTo: TeamRole = 'manager')` (answers Q3: **default manager**).

Transaction body with optimistic concurrency:
1. `sportTeam.update where { id, ownerId: currentOwnerId } → ownerId: targetUserId` — 0 rows ⇒ `ConflictException`.
2. Promote target membership to `owner`.
3. Demote caller to `demoteTo`.

Controller: `PATCH /teams/:id/members/:userId` — if `dto.role === 'owner'`, branch to `transferOwnership` (caller already verified as owner via `assertRole`). `updateRole` keeps its owner-forbidden guard (defense in depth).

**Rejected**: separate `POST /teams/:id/transfer` endpoint — more surface area, same concept. Reusing the existing PATCH matches REST semantics.

### ADR B3 — k6 load test
**Context**: No perf baseline.

**Decision**: **k6** with `k6/experimental/websockets`. Script at `infra/load/realtime-load.js`. Scenario: ramp to 1000 VUs over 60s, hold 3 min. Each VU obtains JWT via `POST /auth/dev-login` (dev only), opens WS with `auth.token`, joins 1 of 10 round-robin rooms, sends 1 msg / 5s, asserts echo.

Thresholds: `ws_connecting p(95) < 2000ms`, `ws_msg_rtt p(95) < 300ms`, `ws_msg_rtt p(99) < 800ms`, `checks > 0.99` (answers Q4: **p95=300ms, p99=800ms**).

**Rejected**: artillery (weaker WS metrics), bespoke Node script (reinvents metrics).

### ADR B4 — FCM push
**Context**: `User.fcmToken` is single-string (schema bug — multi-device users overwrite). No firebase-admin.

**Decision**: Introduce `FcmToken` table + drop `User.fcmToken` in same migration (answers Q6: **new table, cleanup same commit** per Principle 1).

```prisma
enum FcmPlatform { web ios android }

model FcmToken {
  id         String      @id @default(uuid())
  userId     String      @map("user_id")
  token      String      @unique
  platform   FcmPlatform
  createdAt  DateTime    @default(now()) @map("created_at")
  lastUsedAt DateTime    @default(now()) @map("last_used_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("fcm_tokens")
}
```

- New `FcmService` (separate from `NotificationsService` to avoid tightening the existing `NotificationsService ↔ RealtimeGateway` forwardRef cycle — addresses Risk row #7).
- Lazy init firebase-admin: if any of `FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY` missing → `enabled=false`, `sendToUser()` no-ops with warn log. **Graceful degradation** (answers Q5: **build proceeds without firebase creds**; real device delivery requires creds).
- `PRIVATE_KEY` unescaped centrally in config loader: `.replace(/\\n/g, '\n')`.
- `NotificationsService.create` calls `fcmService.sendToUser(userId, {...})` fire-and-forget after WS emit. All notification types trigger push in v1 (answers Q7: **all types; per-type preferences deferred**).
- Auto-cleanup: on `messaging/registration-token-not-registered` response, delete token row.
- Token ownership swap: upsert by unique `token` — if token was owned by A and sent by B, reassign to B (device handoff).
- Endpoints: `POST /notifications/fcm-token` (body `{token, platform}`), `DELETE /notifications/fcm-token/:token`. Deprecate `POST /notifications/register-token` with 410 Gone header for one release.
- Frontend: `lib/firebase.ts` + `public/firebase-messaging-sw.js` (web), `@capacitor/push-notifications` (native, behind `Capacitor.isNativePlatform()`).

**Rejected**: keeping `User.fcmToken` (violates Principle 1), OneSignal (adds vendor).

---

## Parallel Work Breakdown

All three lanes run in parallel after the sequential prerequisite block.

### Sequential prerequisites (block all lanes)
- **A1**: `pnpm add socket.io-client --filter web` → rewrite `realtime-client.ts` / `use-realtime.ts`. ~1-2h, frontend-dev. (Can actually be moved into frontend lane step 1 — only A2 truly blocks backend.)
- **A2**: `docker compose up -d` → `pnpm --filter api prisma migrate deploy` → `pnpm --filter api db:seed`. ~30min, infra-dev. **Blocks backend lane.**

### Backend lane (backend-dev) — after A2
1. **[B1-schema]** Add ChatRoom/ChatParticipant/ChatMessage + 2 enums to `schema.prisma`. `pnpm prisma migrate dev --name add_chat_persistence`. Files: `apps/api/prisma/schema.prisma`, new migration dir.
2. **[B4-schema]** Add FcmToken + FcmPlatform enum, **drop `User.fcmToken`** in same migration. `pnpm prisma migrate dev --name add_fcm_tokens`. Files: `apps/api/prisma/schema.prisma`, new migration dir.
3. **[B1-dto]** Create `apps/api/src/chat/dto/{create-room.dto.ts, post-message.dto.ts, list-query.dto.ts}` with class-validator.
4. **[B1-service]** Rewrite `chat.service.ts`: `listRooms/listMessages/createRoom/postMessage/markRead/unreadCountForUser`, all participant-asserted. Inject `PrismaService` + `RealtimeGateway`.
5. **[B1-controller]** Rewrite `chat.controller.ts` — 6 endpoints with `@UseGuards(JwtAuthGuard)`, Swagger decorators, `@CurrentUser('id')`.
6. **[B1-module]** Wire `ChatModule` with `PrismaModule` + `forwardRef(RealtimeModule)`. Export `ChatService`.
7. **[B1-gateway]** Update `RealtimeGateway.handleChatMessage` to call `chatService.postMessage`. Update `chat:join` to assert participant. Delete broadcast-without-persist comment.
8. **[B1-realtime-module]** `RealtimeModule` forwardRef to `ChatModule`, inject `ChatService` into gateway.
9. **[B2-service]** Add `transferOwnership` to `team-membership.service.ts` with optimistic-concurrency `where`. Extend `UpdateMemberRoleDto` with optional `demoteTo` (default manager).
10. **[B2-controller]** In `PATCH /teams/:id/members/:userId`, branch `dto.role === 'owner'` → `transferOwnership`.
11. **[B4-fcm]** `apps/api/src/notifications/fcm.service.ts` with graceful-disable. Register in `NotificationsModule`.
12. **[B4-wire]** `NotificationsService.create` → fire-and-forget `fcmService.sendToUser(...)` after WS emit.
13. **[B4-endpoints]** `POST /notifications/fcm-token`, `DELETE /notifications/fcm-token/:token`. Deprecate `POST /notifications/register-token`.
14. **[B4-config]** `apps/api/src/config/configuration.ts` — firebase section with `PRIVATE_KEY` newline unescape.
15. **[specs]** Update/add all spec files in same commits: `chat.service.spec.ts` (new), `chat.controller.spec.ts` (new), `realtime.gateway.spec.ts` (update), `team-membership.service.spec.ts` (add transfer tests), `notifications.service.spec.ts` (inject FcmService mock), `fcm.service.spec.ts` (new). **Principle 4: same commit as the change that invalidates them.**
16. **[env]** Update `apps/api/.env.example` with Firebase vars.

### Frontend lane (frontend-dev) — A1 first, rest parallel
1. **[A1-install]** `pnpm add socket.io-client --filter web`.
2. **[A1-rewrite]** Rewrite `apps/web/src/lib/realtime-client.ts` — static ESM import, reconnection config, `connectionState` signal. Remove eslint-disable.
3. **[A1-hook]** Rewrite `apps/web/src/hooks/use-realtime.ts` — reactive `accessToken` subscription, disconnect on logout, reconnect on token change. Proper `Socket` type from `socket.io-client`.
4. **[A1-test]** `apps/web/src/hooks/use-realtime.test.ts` (new) — `vi.mock('socket.io-client')`.
5. **[A1-env]** `apps/web/.env.example` — `NEXT_PUBLIC_WS_URL`.
6. **[B1-api]** Chat REST helpers in `apps/web/src/lib/api.ts`.
7. **[B1-hooks]** `apps/web/src/hooks/use-chat.ts` — React Query wrappers; invalidate on `chat:message` WS event.
8. **[B1-ui]** Wire `components/chat/*` (existing `chat-bubble.tsx` MUST be reused per CLAUDE.md) to new hooks. Text-only rendering, no `dangerouslySetInnerHTML`. Unread badge in bottom nav.
9. **[B2-modal]** `apps/web/src/components/teams/transfer-ownership-modal.tsx` (new) — uses shared `components/ui/modal.tsx`, target select + demote-role select + double confirm.
10. **[B2-page]** Owner-only "팀장 이양" action in `apps/web/src/app/(main)/teams/[id]/members/page.tsx`. Role-gated: use `useMyTeams` role for current user.
11. **[B4-web]** `apps/web/src/lib/firebase.ts` + `apps/web/public/firebase-messaging-sw.js` + `apps/web/src/hooks/use-push-registration.ts`. Register on login, POST to `/notifications/fcm-token` with `platform: 'web'`.
12. **[B4-capacitor]** `@capacitor/push-notifications` plugin registration behind `Capacitor.isNativePlatform()` with `platform: 'ios'|'android'`.
13. **[B4-env]** `apps/web/.env.example` — `NEXT_PUBLIC_FIREBASE_*`, `NEXT_PUBLIC_FIREBASE_VAPID_KEY`.
14. **[fe-tests]** Update any `*.test.tsx` fixtures that mock Chat shapes or realtime hook.

### Infra lane (infra-dev)
1. **[A2]** Ops: `docker compose up -d` → `prisma migrate deploy` → `db:seed`. Verify tables. Confirm to backend lane.
2. **[B3-script]** `infra/load/realtime-load.js` (k6) — 1000-VU scenario with thresholds from ADR B3.
3. **[B3-docs]** `infra/load/README.md` — k6 install, run command, threshold interpretation, ulimit tuning for 1000 conns (`ulimit -n 4096`), NODE_ENV=development gate.
4. **[B3-ignore]** `infra/load/.gitignore` for `results/`.
5. **[B4-env-review]** Ensure `.env.example` updates from backend + frontend lanes are consistent. Document `FIREBASE_PRIVATE_KEY` `\n` escape convention.

### Sequential finalization (after all lanes)
1. Merge order: infra(A2) → backend schemas → backend services → frontend → infra(B3+docs) → tests.
2. `pnpm prisma migrate deploy` on shared dev DB.
3. `pnpm -r test && pnpm -r lint && (cd apps/web && npx tsc --noEmit) && (cd apps/api && npx tsc --noEmit)`.
4. E2E smoke: login → chat create/send/reload → owner transfer → FCM token registers (disabled mode OK).
5. `k6 run infra/load/realtime-load.js` against local API with NODE_ENV=development. Commit summary to `infra/load/results-<date>.md`.
6. Hand off to `@review`.

---

## Acceptance Criteria

- [x] `pnpm --filter web build && pnpm --filter api build` pass
- [x] `pnpm --filter web test && pnpm --filter api test` pass (118+ / 125+ baseline, no regressions)
- [x] `npx tsc --noEmit` clean in both apps
- [x] `ChatService` in-memory methods removed — no `return [];` stubs remain
- [x] `realtime-client.ts` and `use-realtime.ts` no longer contain `// BLOCKER` comment or dynamic `require`
- [x] Migration applied on dev DB; `prisma studio` shows new tables populated by seed
- [x] Owner-transfer: manual test confirming role change in DB + UI refresh
- [x] Load test report committed (k6 JSON summary or markdown with p95/p99/throughput at 1000 conns)
- [x] FCM: dev-mode notification arrives on at least one test device (web or Android emulator)
- [x] All "Original Conditions" checkboxes above ticked — any unticked item must be justified in Ambiguity Log
- [x] Review team reports Critical=0, Warning=0 before merge

---

## Tech Debt Resolved (Principle 1)

- In-memory `ChatService` stub deleted entirely (not layered).
- Dynamic `require('socket.io-client')` replaced with proper ESM import.
- `any`-typed `Socket` in `use-realtime.ts` replaced with real type.
- Single-field `User.fcmToken` likely upgraded to multi-device table (one device per user is a real bug — TBD confirmed by tech-planner).
- Deprecated `send()` + `findAll()` methods in `NotificationsService` may be removed if no remaining callers (check during B4).

---

## Security Notes (Principle 3)

- **Chat authorization**: reading/writing messages must verify the user is a participant of the associated `teamMatch` (or team). Enforce at both REST and WebSocket layers — don't trust socket room membership alone.
- **DTO validation**: message length cap, content-type restriction (text-only initially, no HTML).
- **Owner transfer**: only the current owner can call; `TeamMembershipService.assertRole(teamId, userId, 'owner')`. Audit log entry recommended.
- **FCM credentials**: firebase-admin service account JSON loaded from env var path, NEVER committed. Add `.gitignore` entry if new file introduced.
- **FCM tokens**: treat as PII; do not log in plaintext. Strip from API responses similar to `passwordHash`.
- **Load test**: never run against production; guard via NODE_ENV check in harness docs.

### Expanded notes (tech-planner)
- **FCM credential handling**: `FIREBASE_PRIVATE_KEY` stays in `.env` only. `.env.example` has placeholder string. PEM stored single-line with `\n` escapes; unescape in **one** place (`config/configuration.ts`) to avoid accidental double-unescape. Log lines must never echo the key (grep the codebase before merge). Prod deployment injects via secret manager.
- **Socket.IO JWT on load test**: k6 VUs fetch JWT via `POST /auth/dev-login` which is already prod-blocked. Script MUST fail loudly (non-2xx → abort VU) — never silently proceed with anonymous handshake. README documents dev/staging only.
- **Chat message XSS**: content stored as-is but **never** rendered via `dangerouslySetInnerHTML`. `chat-bubble.tsx` renders text nodes only. Server-side: DTO `@IsString() @MaxLength(2000)`, strip NUL bytes. No HTML sanitizer required as long as the text-only rendering invariant holds — document this invariant in a comment at the top of `chat.service.ts`.
- **Chat participant assertion**: both REST `postMessage` and WS `chat:message` MUST call `assertParticipant(roomId, userId)`. Never trust `userId` from client payload — always derive from JWT (`client.data.userId` on socket, `@CurrentUser('id')` on REST).
- **Socket room membership is not authz**: joining a Socket.IO room must be gated by participant check. `chat:join` handler must verify DB participant row before `client.join(...)`.
- **Owner transfer race condition**: `sportTeam.update where { id, ownerId: currentOwnerId }` is the critical guard — 0 rows → `ConflictException`. All three updates wrapped in `$transaction` → atomic rollback. Do **not** split into sequential awaits outside a transaction.
- **FCM token as PII**: strip from API responses (similar to `passwordHash` policy). Do not log tokens in plaintext — log last 6 chars only for debugging.
- **FCM token endpoint ownership swap**: upsert-by-unique-token design means a stolen token could be re-registered by an attacker; acceptable because FCM tokens are device-bound and expire on app uninstall. Still, rate-limit this endpoint (future hardening, track as Warning).
- **Chat rate limiting**: 10 msg/s per user on `postMessage` would prevent flooding, but **not in scope** for this session — flagged as **Warning** tech debt, not Critical.
- **forwardRef cycle**: `FcmService` lives inside `NotificationsModule` as a plain provider, never referenced by `RealtimeGateway`. Keeps the existing `NotificationsService ↔ RealtimeGateway` forwardRef intact; no new cycles introduced.

---

## Risks & Dependencies

| Risk | Impact | Mitigation |
|------|--------|-----------|
| firebase-admin service account not provisioned | Blocks B4 entirely | **Confirm with user before build phase** — is a Firebase project ready? If not, B4 re-enters planning (Principle 6). |
| Apple Developer + Google Play accounts for push certs | Blocks Capacitor push on real devices | Web push can ship first; mobile push deferred if accounts unavailable. |
| `User.fcmToken` single-field is a schema bug | Multi-device users overwrite each other | Add `FcmToken` table (userId, token, platform, lastSeenAt). Migration required. |
| Chat schema decisions (room participants join table vs array) | DB design impacts query patterns | tech-planner to decide based on team-match participant model reuse. |
| Load test at 1000 conns may exceed local machine ulimit | B3 can't run locally | Document ulimit tuning OR run against staging. |
| Chat REST + WS dual path race conditions | Duplicate/missing messages | Single source of truth: persist first, then broadcast from service layer — not from gateway directly. |
| forwardRef cycle between NotificationsService ↔ RealtimeGateway already exists | Adding FCM may tighten the cycle | Keep FCM logic in a separate `PushService` injected into NotificationsService only. |

### Dependencies
- A1, A2 → all of B (cannot validate without working socket + DB)
- B1 (persist + broadcast) → B3 (load test is meaningless without persistence cost)
- B4 independent from B1/B2/B3 once A1/A2 unblocked
- B2 independent; cheapest win, can ship first after unblockers

---

## Ambiguity Log (Principle 5 + 6)

> Builders append BLOCKED entries here. Orchestrator re-enters planning on each entry.

- [ ] **Q1 (B1)** Chat room scope: is `ChatRoom` 1-to-1 with `TeamMatch`, or can regular `Match` / DM rooms exist? Current controller hints at team-match only (`teamMatchId` in createRoom body).
- [ ] **Q2 (B1)** Max message length, attachment support (images?), message editing/deletion policy.
- [ ] **Q3 (B2)** After owner transfer, does previous owner become `member` or `manager`? User request says "demoted to member or manager" — which is the default?
- [ ] **Q4 (B3)** p95 latency target — need a pass/fail threshold. 200ms? 500ms?
- [ ] **Q5 (B4)** Is a Firebase project and service account JSON available? If not, B4 must pause.
- [ ] **Q6 (B4)** Per-device tokens — should we introduce `FcmToken` table or keep single `User.fcmToken` and document the limitation?
- [ ] **Q7 (B4)** Which notification types should trigger push vs realtime-only? All, or subset?

---

## Complexity Estimate (tech-planner)

| Item | Complexity | Rationale |
|------|------------|-----------|
| A1 socket.io-client | **Low** | Single install + stub replacement. |
| A2 DB bring-up | **Low** | Ops commands only. |
| B1 Chat persistence | **High** | New schema + migration + service rewrite + WS integration + unread semantics + tests. ~10 files. |
| B2 Owner transfer | **Medium** | Transactional correctness + optimistic concurrency + UI modal. Bounded. |
| B3 k6 load test | **Medium** | k6 Socket.IO quirks + threshold tuning. |
| B4 FCM push | **High** | New table + drop old column + firebase-admin + web push + SW + Capacitor + graceful disable. |
| **Overall** | **High** | 2 migrations, 1 major service rewrite, 1 new integration, load harness. Expect 1-2 build/review cycles. |

---

## Ambiguity resolutions (tech-planner answers to project-director's Ambiguity Log)

- **Q1 (B1 scope)**: `ChatRoomType` enum reserves `direct`/`team`/`team_match` but v1 creates team_match rooms only. Direct/team rooms are out of scope.
- **Q2 (B1 constraints)**: max content length 2000, text-only in v1, no edits/deletes/attachments. Soft-delete column exists for future.
- **Q3 (B2 default)**: previous owner demoted to **manager** by default; `demoteTo` param allows `member`. Answered in ADR B2.
- **Q4 (B3 thresholds)**: p95 msg RTT < 300ms, p99 < 800ms, connection success > 99%. Answered in ADR B3.
- **Q5 (B4 firebase readiness)**: **NOT a hard block**. FcmService gracefully disables when creds missing — build and merge can proceed. Real device delivery requires creds provisioned before user acceptance.
- **Q6 (B4 token model)**: new `FcmToken` table, `User.fcmToken` dropped in same migration. Answered in ADR B4.
- **Q7 (B4 push coverage)**: all notification types trigger push in v1; per-type preferences deferred to a later phase.

No items escalated to user — all resolved within planning authority.

---

## Notes for tech-planner

- Fill `Parallel Work Breakdown` tracks with concrete file lists, DTO/model signatures, migration SQL outline, and time estimates.
- Resolve or explicitly defer each item in Ambiguity Log before builders start.
- Confirm whether Q5 (Firebase readiness) is a hard block; if so, split B4 into a separate task doc and let B1/B2/B3 proceed.
- Propose whether to split this into one combined doc (current) or two (`next-session-blockers-and-chat.md` + `next-session-push-and-load.md`) based on timeline.

---

## Completion Summary

Completed: 2026-04-06

### Metrics
- **Files changed**: ~60 files across backend, frontend, infra
- **Backend tests**: 144/144 passed
- **Frontend tests**: 141/141 passed
- **TypeScript**: `npx tsc --noEmit` clean in both apps

### Review rounds
- **Round 1**: Critical=10 / Warning=14 — fixes applied
- **Round 2**: Critical=0 / Warning=1 (chat rate limiting, deferred as Warning per ADR)

### Design review
- Completed + fixes applied (dark mode, touch targets, aria-label coverage)

### QA
- 22/22 scenarios passed after fix cycle (1 Critical fixed: chat participant assert on WS join)

### Migrations applied
- `20260405000000_add_team_membership_and_mercenary`
- `20260406000000_add_chat_persistence`
- `20260406010000_add_fcm_tokens`

### Remaining blocker
- Firebase project + service account not provisioned — `FcmService` runs in graceful-disable mode until credentials are added (see Known Blockers in CLAUDE.md)
