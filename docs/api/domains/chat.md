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

## Reporting and blocking

- Report reasons: `spam`, `harassment`, `impersonation`, `inappropriate`, `other`; detail max 500.
- Both actions require current room entitlement, an active participant, an entered room, and a visible,
  sent text message from another user. Cross-room/invisible messages return 404; self-targets 400;
  nonparticipants 403; unauthenticated requests 401. Unknown DTO properties are rejected.
- Reports persist the server-owned message snapshot and actor/target/reason in `V1Inquiry` (`category=report`,
  `relatedType=user`). The existing operator inbox and transactional outbox receive the report; no external
  Slack request is made directly by the route. Report submission is not deduplicated: avoid repeated taps.
- `V1ChatUserBlock` is persistent, bilateral **within chat**, across all rooms. It filters REST history,
  last-message previews, unread totals, future message recipients, realtime content, notification creation,
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
