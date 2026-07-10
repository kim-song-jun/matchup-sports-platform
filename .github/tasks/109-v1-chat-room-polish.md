# Task 109: V1 Chat Room Polish

## Status

- Branch: `feature/v1-chat-room-polish`
- Target: backend + frontend
- Mode: CODE after this plan is approved
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
- Keep the same policy for match, team, and team-match chat rooms.

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
- Same policy applies to all v1 chat room types:
  - `match`
  - `team`
  - `team_match`

### Join System Notice

- A join notice is created when a user actually opens/enters the chat room screen for the first time in an active participation session.
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
visibleFromAt DateTime @default(now()) @map("visible_from_at")
```

Use:

- Initial participant creation: set to current time unless backfilling existing active participants.
- Rejoin: update to current time.
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

- Given a user joins a chat room for the first time,
  when they open the room,
  then they see only messages at or after their entry point.

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

- Need to decide exact idempotency marker for join notices:
  - possible: detect a recent/latest `system joined` message by same sender after current `visibleFromAt`;
  - possible: add participant `lastJoinedNoticeAt`;
  - possible: use status transition log plus message existence.
- Need to inspect whether API docs have a chat domain file; if not, add or update the closest `docs/api` contract document.

