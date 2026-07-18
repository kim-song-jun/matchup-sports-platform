# Task 109: V1 Chat Room Polish

## Status

- Branch: `feature/v1-chat-room-polish`
- Target: backend + frontend
- Mode: CODE in progress
- Scope: v1 chat only

## Problem

The current v1 chat room behavior is functionally usable but misses important room lifecycle and read-state UX:

- A user who newly enters a chat room can see all previous messages.
- The room does not show a central "user joined" system notice.
- Sent messages do not show KakaoTalk-like unread counts.

These are not only UI concerns. Correct behavior requires API and persistence changes because message visibility and read counts depend on participant lifecycle state.

## Goals

- Show a centered system notice when a user enters a chat room.
- Hide pre-entry messages from newly joined or rejoined users.
- Show unread participant count next to messages sent by the current user.
- Preserve existing active participants' access to existing chat history after migration.
- Start team-chat visibility and history at confirmed team-membership activation, without requiring the member to open the room first.

## Non-Goals

- No websocket/SSE real-time read receipt system in this task.
- No full chat notification subscription preference rebuild.
- No legacy chat or non-v1 source changes.
- No visual redesign of the whole chat surface beyond required message/system/read-count UI.

## Product Policy Decisions

### Message Visibility

- New participants see only messages sent at or after their entry visibility timestamp.
- Rejoined participants see only messages sent at or after the rejoin timestamp.
- Existing active participants keep access to existing chat history through migration backfill.
- Team chat uses confirmed membership activation as the visibility boundary.
- Match and team-match chat keep room entry as the visibility boundary.

### Join System Notice

- For team chat, a join notice is created in the same transaction that activates a new or returning team membership.
- For match and team-match chat, a join notice is created when the user first opens/enters the room in an active participation session.
- Notice copy uses profile display name or nickname:
  - `{displayName}님이 들어왔습니다`
- The notice is visible to the joining user and existing participants.
- The notice is rendered as a centered system pill, not a normal message bubble.

### Read Count

- Unread count appears only for messages sent by the current user.
- The count is placed beside the user's message bubble.
- `0` is hidden.
- A participant is counted as unread only when:
  - the participant is not the message sender,
  - the participant was able to see the message at send time,
  - the participant has not read through that message.
- Participants who join after a message was sent are not counted for that older message.

### Real-Time Behavior

- This task uses the current query/refetch model.
- Real-time read count updates through websocket/SSE are explicitly out of scope.
- Lightweight polling can be considered later if product feedback requires it.

## Proposed Data Model Changes

### `v1_chat_room_participants`

Add a participant-level visibility anchor.

```prisma
visibleFromAt DateTime? @map("visible_from_at")
```

Use:

- Team participant creation/reactivation: set to the confirmed membership activation time immediately.
- Match/team-match participant creation: set to `null`; first actual room entry sets the timestamp.
- Existing active participants during migration: backfill to a historical value that preserves current room history.

### `v1_chat_messages`

Add message classification fields.

```prisma
messageType     V1ChatMessageType       @default(text) @map("message_type")
systemEventType V1ChatSystemEventType?  @map("system_event_type")
```

Potential enums:

```prisma
enum V1ChatMessageType {
  text
  system
}

enum V1ChatSystemEventType {
  joined
  left
}
```

Implementation detail to verify:

- Current `senderUserId` is required.
- For a join system notice, the entering user can remain `senderUserId` / actor.
- The frontend must use `messageType` to render it as system, not as a sender bubble.

## API Contract Changes

### Team Membership Activation

- Team creation, join-application approval, and invitation acceptance create/reactivate the team-chat participant in the membership transaction.
- The same transaction claims a null visibility boundary, writes `visibleFromAt`, creates one joined system message, and updates `lastMessageAt`.
- Existing active memberships may repair a missing/null chat visibility boundary but do not create a duplicate joined notice.

### `GET /api/v1/chat/rooms/:roomId`

May need to finalize an active chat entry session:

- ensure participant is active,
- initialize `visibleFromAt` if missing,
- create a join system message if this active session has not emitted one.

The response should continue returning:

- `me.lastReadMessageId`
- participants
- room metadata

If needed, add:

```ts
me.visibleFromAt: string
```

### `GET /api/v1/chat/rooms/:roomId/messages`

Change message query to:

- only return messages visible to the current participant,
- include system message metadata,
- include unread count per message.

Response item shape should become:

```ts
{
  messageId: string;
  messageType: 'text' | 'system';
  systemEventType: 'joined' | 'left' | null;
  sender: {
    userId: string;
    displayName: string;
    profileImageUrl: string | null;
  };
  content: string | null;
  status: string;
  sentAt: string;
  mine: boolean;
  unreadCount: number;
}
```

### `PATCH /api/v1/chat/rooms/:roomId/me`

Continue using `lastReadMessageId`.

Validation requirement:

- only allow marking a message that belongs to the room and is visible to the participant.

## Implementation Plan

### Phase 0: Task/Contract Setup

- Keep this task doc as the implementation source of truth.
- Confirm migration names and final field names before code changes.
- Review `docs/api` chat/supporting domain docs and update if chat contract docs exist or are added.

### Phase 1: Backend Schema

- Add Prisma enums and fields.
- Add migration under `apps/v1_api/prisma/migrations`.
- Backfill existing active participants so existing chat history remains visible.
- Run/verify Prisma client generation in CI-compatible path.

### Phase 2: Backend Service

- Update room resolve/detail entry flow:
  - active participant creation/rejoin updates visibility timestamp,
  - room detail entry creates one join system notice per active entry session.
- Update message query:
  - filter by participant `visibleFromAt`,
  - return message type/system event fields,
  - calculate unread count.
- Update `updateMe` read marker validation.
- Add or update unit tests in `apps/v1_api/src/chat`.

### Phase 3: Frontend Contract

- Update `apps/v1_web/src/types/api.ts`.
- Update `apps/v1_web/src/test/msw/fixtures.ts`.
- Update `apps/v1_web/src/test/msw/handlers.ts`.
- Update chat model conversion in `community-api-clients.tsx`.

### Phase 4: Frontend UI

- Render `system` messages as centered pill notices.
- Render current user's text messages with unread count beside the bubble.
- Hide unread count when it is `0`.
- Keep non-current-user bubbles unchanged.
- Verify mobile width behavior so the unread count can wrap below without overlap.

### Phase 5: Tests And QA

- Backend unit tests:
  - new participant cannot see pre-entry messages,
  - rejoined participant cannot see messages before rejoin,
  - existing active participant backfill preserves visibility,
  - join system message is generated once per active entry session,
  - unread count excludes sender and future joiners.
- Frontend tests:
  - system notice renders centered,
  - unread count renders for own message,
  - unread count hides at zero,
  - other messages do not show unread count.
- Manual QA:
  - `/chat`
  - `/chat/:id`
  - desktop and mobile viewport
  - two-user scenario when feasible
  - console/network check

## Acceptance Criteria

- Given a user is newly approved into or accepts an invitation to a team,
  when the membership transaction completes,
  then the team chat contains one joined notice and starts collecting messages for that user immediately.

- Given an existing participant opens a room after migration,
  when they load messages,
  then their previously visible history remains visible.

- Given a participant enters a room,
  when the chat thread renders,
  then a centered notice says `{nickname}님이 들어왔습니다`.

- Given I send a message,
  when other visible participants have not read it,
  then an unread count appears beside my message bubble.

- Given all visible recipients have read my message,
  when the message renders,
  then the unread count is hidden.

- Given a participant joins after my old message was sent,
  when unread counts are calculated,
  then that participant is not counted as unread for the old message.

## Validation Commands

- Backend unit:

```bash
pnpm --filter v1_api test -- chat.service.spec.ts chat.controller.spec.ts
```

- Frontend unit, if chat tests are added/updated:

```bash
pnpm --filter v1_web test
```

- Build/type safety:

```bash
pnpm --filter v1_api build
pnpm --filter v1_web build
```

- DB guardrail:

```bash
pnpm qa:v1-db-guardrails
```

## Risks

- Read count can become expensive if calculated with one query per message. Prefer batched participant/message metadata where possible.
- Join notices must be idempotent for a single active entry session to avoid duplicate notices on refresh.
- Rejoin policy requires a clean way to distinguish continuing active participants from users who left and returned.
- Existing dirty/WIP files must not be mixed into this task's commits.

## Open Implementation Notes

- Join notice idempotency uses conditional `visibleFromAt: null` update; only the request that wins the update creates the system message.
- V1 API contract doc updated at `docs/api/v1/domains/chat-notifications.md`.

## Progress Snapshot

- Added Prisma fields/enums and migration `20260710000000_v1_chat_room_polish`.
- Backend service now initializes entry visibility, creates joined system messages, filters visible messages, validates read markers, and computes per-message unread counts.
- Match/team-match resolve still creates or reactivates participants with `visibleFromAt = null`; existing active participants are preserved through migration backfill.
- Team creation, join approval, and invitation acceptance claim `visibleFromAt` and create the joined system notice during membership activation; opening the team chat is no longer required to start receiving its history.
- Frontend API types, chat model conversion, and chat thread UI now support centered system notices and own-message unread counts.
- Chat messages now show hour-and-minute timestamps, with a centered month-and-day divider at the first message and each local date boundary.
- Chat rooms keep the thread pinned to the latest message, isolate message scrolling from the app shell, and keep the mobile composer fixed below the thread without overlap.
- Chat room list timestamps show only hour and minute for messages from today, and only month and day for older messages.
- Targeted polish service tests were added in `apps/v1_api/src/chat/chat.service.polish.spec.ts`.
- Added migration `20260716100000_v1_team_chat_membership_backfill` to create or reactivate active-team rooms/participants without historical join notices and to repair null visibility boundaries from `joined_at`, falling back to membership `created_at`.
- 2026-07-16 merge-readiness validation: API typecheck/build and 512 unit tests pass; Web typecheck, production build, pattern check, and 113 unit tests pass. Local data rehearsal reduced missing active-team chat participants from 8 to 0, repaired all 16 visibility boundaries, and preserved the 10 existing system messages.
- 2026-07-17 production preflight: 57 active memberships have no missing/inactive rooms, no null `joined_at`, and 3 missing chat participants. The unapplied backfill now covers those rows plus inactive-room, inactive-participant, and null-`joined_at` repair without inserting historical system messages.
- 2026-07-17 isolated PostgreSQL rehearsal: missing/inactive rooms, missing/left participants, null `joined_at`, and existing visibility boundaries all passed. A second backfill run kept 3 rooms, 6 participants, and 2 pre-existing messages with no duplicates or historical join-message inserts.
