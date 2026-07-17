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

Chat v1 is linked-room and text-only. Match, team match, and team detail entry resolves the linked room for eligible users so chat participation is repaired automatically. Team chat is created automatically when a team is created, owner/member participants are synced from team membership, and `resolve` can repair a missing team room for an active team member. The public web room page is `/chat/:roomId`; `/api/v1/chat/rooms/:roomId` remains the API detail endpoint. DM and file attachment are deferred. The web chat list does not expose leaving a linked room; users can mute or unmute app chat notifications per room.

## Notification Endpoints

| Method | Path | Auth | Request | Response |
|---|---|---|---|---|
| `GET` | `/api/v1/notifications` | user | `status?`, `type?`, `cursor?`, `limit?` | notification list |
| `PATCH` | `/api/v1/notifications/:notificationId/read` | user owner | path id | read notification |
| `POST` | `/api/v1/notifications/read-all` | user | `{ type?: string | null }` | read-all result |
| `GET` | `/api/v1/notification-preferences` | user | none | preference row |
| `PATCH` | `/api/v1/notification-preferences` | user | `importantEnabled?`, `activityEnabled?`, `marketingEnabled?` | updated preferences |

## Navigation Contract

Notification rows may carry a deep link target. Frontend must use explicit read-and-navigate handling so read mutation, list invalidation, and route navigation do not race. The web client accepts only same-origin root-relative paths beginning with one `/`; absolute URLs, protocol-relative URLs, backslash paths, and non-path schemes resolve to `/notifications` instead of being passed to the router.

These are in-app database notifications. Browser Push API, service-worker delivery, VAPID subscriptions, and browser notification permission prompts are not part of the active v1 runtime contract.

## Primary Tables

- `v1_chat_rooms`
- `v1_chat_room_participants`
- `v1_chat_messages`
- `v1_notifications`
- `v1_notification_preferences`
