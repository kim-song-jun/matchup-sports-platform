# V1 Chat And Notifications API

## Chat Endpoints

| Method | Path | Auth | Request | Response |
|---|---|---|---|---|
| `GET` | `/api/v1/chat/rooms` | user | `roomType?`, `status?`, `cursor?`, `limit?` | linked room list |
| `POST` | `/api/v1/chat/rooms/resolve` | user participant | `{ targetType: "match" | "team" | "team_match" | "team_contact"; targetId: uuid }` | existing or created room with web route `/chat/:roomId` |
| `GET` | `/api/v1/chat/rooms/:roomId` | room participant | path id | room detail |
| `GET` | `/api/v1/chat/rooms/:roomId/messages` | room participant | `cursor?`, `limit?`, `direction?` | message list |
| `POST` | `/api/v1/chat/rooms/:roomId/messages` | room participant | `{ content: string }` | sent message |
| `PATCH` | `/api/v1/chat/rooms/:roomId/me` | room participant | `pinned?`, `lastReadMessageId?`, `mutedUntil?` | my room state; future `mutedUntil` suppresses app chat notifications |
| `POST` | `/api/v1/chat/rooms/:roomId/leave` | room participant | `{ reason?: string | null }` | left room state |

Chat v1 is linked-room and text-only for user-authored messages. A `team_contact` room is created when a team contact is sent (both teams' owner/manager become participants, the request text is the first message); list/detail items carry a `teamContact` block (`contactId`, display `status`, `expiresAt`, `declineReason`, `mySide`, `fromTeam`, `toTeam`) and sending returns `409 TEAM_CONTACT_NOT_ACCEPTED` until the contact is accepted. Match, team match, and team detail entry resolves the linked room for eligible users so chat participation is repaired automatically. Team chat is created automatically when a team is created, and owner/member participants are activated from confirmed team membership. Join approval or invitation acceptance immediately starts the member's team-chat visibility and creates the joined system notice in the same transaction, so opening the room is not required before later messages accumulate. `resolve` can still repair a missing team room or participant for an active team member. The public web room page is `/chat/:roomId`; `/api/v1/chat/rooms/:roomId` remains the API detail endpoint. DM and file attachment are deferred. The web chat list does not expose leaving a linked room; users can mute or unmute app chat notifications per room.

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
| `POST` | `/api/v1/notifications/push-devices` | user | Android installation/token/app/device metadata | token-free device summary |
| `DELETE` | `/api/v1/notifications/push-devices/:installationId` | user owner | installation id | revoke result |
| `GET` | `/api/v1/notification-preferences` | user | none | preference row |
| `PATCH` | `/api/v1/notification-preferences` | user | `importantEnabled?`, `activityEnabled?`, `marketingEnabled?` | updated preferences |

## Navigation Contract

Notification rows may carry a deep link target. Tapping a notification card opens a detail sheet rather than navigating: the card tap marks the row read, and navigation happens only from the sheet's CTA. This keeps the read mutation, list invalidation, and route navigation from racing, and gives the full body a place to render (the card clamps it to two lines). The web client accepts only same-origin root-relative paths beginning with one `/`; absolute URLs, protocol-relative URLs, backslash paths, and non-path schemes resolve to `/notifications` instead of being passed to the router.

Every notification is an in-app database row. The same emit path attempts both browser Web Push (`WebPushService.sendToUser`) and Android FCM (`FcmPushService.sendToUser`) as independent channels. An individual delivery failure does not roll back the canonical notification row or cancel the other channel. Web Push requires `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`; Android FCM requires all of `FIREBASE_PROJECT_ID` / `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY` plus a valid `V1_PUSH_ENVIRONMENT`. No Firebase Admin credentials disables FCM, while partial credentials fail startup. Permanent invalid/unregistered token results revoke only the affected device.

Android registration environment is server-owned rather than accepted from the client. `alpha` and `production` use distinct application IDs, Firebase projects, and `v1_push_devices.environment` values. Registration tokens never appear in API responses or application logs. The WebView bridge reports subscribed only after the authenticated registration API returns success, and logout attempts device revoke before clearing the session cookie.

`targetType` values are `match`, `team`, `team_match`, `chat`, `notice`, `system`, `tournament`, `inquiry`. Admin replies to a 1:1 inquiry emit `inquiry_answered` (targetType `inquiry`, deep link `/my/inquiries/:inquiryId`) to the member who asked; guest inquiries have no account and are answered through their contact details instead. That event is gated by `importantEnabled`, not `activityEnabled`.

## Primary Tables

- `v1_chat_rooms`
- `v1_chat_room_participants`
- `v1_chat_messages`
- `v1_notifications`
- `v1_notification_preferences`
- `v1_push_devices`
