# V1 Chat And Notifications API

## Chat Endpoints

| Method | Path | Auth | Request | Response |
|---|---|---|---|---|
| `GET` | `/api/v1/chat/rooms` | user | `roomType?`, `status?`, `cursor?`, `limit?` | linked room list |
| `POST` | `/api/v1/chat/rooms/resolve` | user participant | `{ targetType: "match" | "team" | "team_match"; targetId: uuid }` | existing or created room with web route `/chat/:roomId` |
| `GET` | `/api/v1/chat/rooms/:roomId` | room participant | path id | room detail |
| `GET` | `/api/v1/chat/rooms/:roomId/messages` | room participant | `cursor?`, `limit?`, `direction?` | message list |
| `POST` | `/api/v1/chat/rooms/:roomId/messages` | room participant | `{ content: string }` | sent message |
| `PATCH` | `/api/v1/chat/rooms/:roomId/me` | room participant | `pinned?`, `lastReadMessageId?`, `mutedUntil?` | my room state; future `mutedUntil` suppresses app chat notifications |
| `POST` | `/api/v1/chat/rooms/:roomId/leave` | room participant | `{ reason?: string | null }` | left room state |

Chat v1 is linked-room and text-only for user-authored messages. Match, team match, and team detail entry resolves the linked room for eligible users so chat participation is repaired automatically. Team chat is created automatically when a team is created, and owner/member participants are activated from confirmed team membership. Join approval or invitation acceptance immediately starts the member's team-chat visibility and creates the joined system notice in the same transaction, so opening the room is not required before later messages accumulate. `resolve` can still repair a missing team room or participant for an active team member. The public web room page is `/chat/:roomId`; `/api/v1/chat/rooms/:roomId` remains the API detail endpoint. DM and file attachment are deferred. The web chat list does not expose leaving a linked room; users can mute or unmute app chat notifications per room.

## Chat Room Entry And Read State

- `v1_chat_room_participants.visible_from_at` is the participant visibility boundary.
- Existing active participants are migration-backfilled to keep their existing chat history visible.
- Follow-up migration `20260716100000_v1_team_chat_membership_backfill` creates missing rooms and participant rows for existing active team memberships, uses membership activation as their visibility boundary, and does not synthesize historical join notices.
- Newly created or reactivated team-chat participants set `visible_from_at` at confirmed membership activation.
- Team-membership activation creates one system message with `messageType = "system"` and `systemEventType = "joined"`; existing active-member repair does not duplicate it.
- Match and team-match participants still start with `visible_from_at = null`; first room detail/message entry sets it and creates the joined system message.
- `GET /api/v1/chat/rooms/:roomId/messages` returns only messages at or after the caller's visibility boundary.
- Message rows include `messageType`, `systemEventType`, and `unreadCount`.
- `unreadCount` is computed per text message from active participants whose visibility boundary includes that message and whose `lastReadMessageId` is older or empty. System messages always return `0`.
- `PATCH /api/v1/chat/rooms/:roomId/me` rejects `lastReadMessageId` values outside the caller's visible message window.

## Notification Endpoints

| Method | Path | Auth | Request | Response |
|---|---|---|---|---|
| `GET` | `/api/v1/notifications` | user | `status?`, `type?`, `cursor?`, `limit?` | notification list |
| `PATCH` | `/api/v1/notifications/:notificationId/read` | user owner | path id | read notification |
| `POST` | `/api/v1/notifications/read-all` | user | `{ type?: string | null }` | read-all result |
| `GET` | `/api/v1/notification-preferences` | user | none | preference row |
| `PATCH` | `/api/v1/notification-preferences` | user | `importantEnabled?`, `activityEnabled?`, `marketingEnabled?` | updated preferences |

## Navigation Contract

Notification rows may carry a deep link target. Tapping a notification card opens a detail sheet rather than navigating: the card tap marks the row read, and navigation happens only from the sheet's CTA. This keeps the read mutation, list invalidation, and route navigation from racing, and gives the full body a place to render (the card clamps it to two lines). The web client accepts only same-origin root-relative paths beginning with one `/`; absolute URLs, protocol-relative URLs, backslash paths, and non-path schemes resolve to `/notifications` instead of being passed to the router.

Every notification is an in-app database row. The same emit path also attempts a Web Push delivery (`WebPushService.sendToUser`) on a separate, non-blocking channel: when `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` are unset the service logs a warning at boot and every send is a silent no-op, so the in-app row is still created. Push therefore requires those three environment variables in the target environment — see `docs/ops/vapid-setup.md`.

`targetType` values are `match`, `team`, `team_match`, `chat`, `notice`, `system`, `tournament`, `inquiry`. Admin replies to a 1:1 inquiry emit `inquiry_answered` (targetType `inquiry`, deep link `/my/inquiries/:inquiryId`) to the member who asked; guest inquiries have no account and are answered through their contact details instead. That event is gated by `importantEnabled`, not `activityEnabled`.

## Primary Tables

- `v1_chat_rooms`
- `v1_chat_room_participants`
- `v1_chat_messages`
- `v1_notifications`
- `v1_notification_preferences`
