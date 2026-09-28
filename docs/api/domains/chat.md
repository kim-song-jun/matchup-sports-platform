# V1 chat contract

Source: `apps/v1_api/src/chat/{chat.controller,chat.service}.ts`, `dto/chat.dto.ts`,
`apps/v1_web/src/hooks/{use-v1-api,use-chat-safety,use-v1-realtime-socket}.ts`.
All paths below are prefixed with `/api/v1`; responses use `{ status, data, timestamp }`.
V1 session authentication and current room entitlement are required. Development header auth is local-only.

| Method | Path | Contract |
| --- | --- | --- |
| GET | `/chat/rooms` | `roomType`, `status`, `cursor`, `limit` (1–50); `{ items, pageInfo: { nextCursor, hasNext } }` |
| POST | `/chat/rooms/resolve` | `{ targetType: match \| team \| team_match \| team_contact, targetId }`; checks domain membership |
| GET | `/chat/rooms/:roomId` | room, linked target, current participant and context |
| GET | `/chat/rooms/:roomId/messages` | `cursor`, `limit` (1–100), `direction: before \| after`; cursor page, only messages since entry |
| POST | `/chat/rooms/:roomId/messages` | `{ content }`, nonblank, max 2,000; text only; active room, accepted team contact if applicable |
| PATCH | `/chat/rooms/:roomId/me` | optional `pinned`, `lastReadMessageId`, `mutedUntil` |
| POST | `/chat/rooms/:roomId/leave` | optional `reason`, max 500 |
| POST | `/chat/rooms/:roomId/messages/:messageId/report` | `{ reason, detail? }`; returns `{ inquiryId }` |
| POST | `/chat/rooms/:roomId/messages/:messageId/block` | empty body; returns `{ blocked: true }` |
| GET | `/chat/blocked-users` | own blocks only; `{ items: [{ userId, displayName }] }` |
| DELETE | `/chat/blocked-users/:userId` | removes caller's block only; idempotent `{ blocked: false }` |

## Linked rooms and resolve

`resolve` targets are `match`, `team`, `team_match`, or `team_contact`, checked against domain
membership. A `team_contact` room is created when a team contact is sent — both teams' owner/manager
become participants and the request text is the first message; list/detail items carry a
`teamContact` block (`contactId`, display `status`, `expiresAt`, `declineReason`, `mySide`,
`fromTeam`, `toTeam`), and sending a message returns `409 TEAM_CONTACT_NOT_ACCEPTED` until the
contact is accepted. Match, team match, and team detail entry resolves the linked room for eligible
users so chat participation is repaired automatically. Team chat is created automatically when a
team is created, and owner/member participants are activated from confirmed team membership — join
approval or invitation acceptance immediately starts the member's team-chat visibility and creates
the joined system notice in the same transaction. For personal matches, both the host and an
approved participant can resolve and enter the linked room; completing the match moves participant
rows from `active` to `completed` but preserves that room entitlement, while withdrawing before
kickoff moves them to `cancelled` and drops current match-chat entitlement. The web chat list does
not expose leaving a linked room; users can only mute/unmute per-room app chat notifications.

For a personal match host, `POST /chat/rooms/resolve` requires at least one active or completed
ordinary participant. A host with no confirmed participant receives `409
MATCH_CHAT_PARTICIPANTS_REQUIRED`; no empty room is created. Once an ordinary participant is
confirmed, the host retains room/list/notification entitlement even when `hostParticipates=false`
and therefore has no host participant row.

## Room entry and read state

- `v1_chat_room_participants.visible_from_at` is the participant visibility boundary; `GET
  /chat/rooms/:roomId/messages` returns only messages at or after it, and `PATCH
  /chat/rooms/:roomId/me` rejects `lastReadMessageId` values outside that visible window.
- Newly created or reactivated team-chat participants set `visible_from_at` at confirmed membership
  activation; match/team-match participants start with `visible_from_at = null` and the first room
  detail/message entry sets it and creates the joined system message.
- Team-membership activation creates one system message (`messageType = "system"`,
  `systemEventType = "joined"`); existing active-member repair does not duplicate it.
- Message rows include `messageType`, `systemEventType`, and `unreadCount`. `unreadCount` is
  computed per text message from active participants whose visibility boundary includes that
  message and whose `lastReadMessageId` is older or empty; system messages always return `0`.

## Reporting and blocking

- Report reasons: `spam`, `harassment`, `impersonation`, `inappropriate`, `other`; detail max 500.
- Both actions require current room entitlement, an active participant, an entered room, and a visible,
  sent text message from another user. Cross-room/invisible messages return 404; self-targets 400;
  nonparticipants 403; unauthenticated requests 401. Unknown DTO properties are rejected.
- Reports persist the server-owned message snapshot and actor/target/reason in `V1Inquiry` (`category=report`,
  `relatedType=user`). The existing operator inbox and transactional outbox receive the report; no external
  Slack request is made directly by the route. Report submission is not deduplicated; the route uses the same production 5/minute throttle as inquiry creation.
- `V1ChatUserBlock` is persistent, bilateral **within chat**, across all rooms. It filters REST history,
  last-message previews, unread totals and per-message reader counts, future message recipients, realtime content, notification creation,
  and push delivery. Other group members retain access. This does not remove shared team membership,
  erase evidence, or recall previously delivered OS notifications.
- Blocks do not prevent sending to other group members. Removing one's own block does not remove a block
  independently created by the other user. Message history may become visible again after unblocking.
- `chat:safety-changed` carries no message content. Clients cancel/reset chat caches, and refresh their
  own block list. A socket error after persistence is logged, not misreported as a failed database write.
- User final deletion removes both outgoing and incoming chat block identifiers.
- Deploy `20260919090000_chat_user_blocks` before the API. Old app shells load the updated web UI;
  no Android binary permission change is required.

## Verification

`test/chat/chat-safety.integration-spec.ts` uses actual HTTP, DTO guards and PostgreSQL, with isolated
fictional users. It verifies reporting, membership/self guards, bilateral history/preview/unread filtering,
notification/realtime recipient exclusion, other-member delivery and owner-only unblock.

The web dialog shows API errors and exposes report receipts, explicit block confirmation and an unblock
list. Browser evidence is under `output/playwright/visual-audit/android-play-readiness/`.
