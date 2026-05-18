# V1 Chat And Notifications API

## Chat Endpoints

| Method | Path | Auth | Request | Response |
|---|---|---|---|---|
| `GET` | `/api/v1/chat/rooms` | user | `roomType?`, `status?`, `cursor?`, `limit?` | linked room list |
| `POST` | `/api/v1/chat/rooms/resolve` | user participant | `{ targetType: "match" | "team_match"; targetId: uuid }` | existing or created room |
| `GET` | `/api/v1/chat/rooms/:roomId` | room participant | path id | room detail |
| `GET` | `/api/v1/chat/rooms/:roomId/messages` | room participant | `cursor?`, `limit?`, `direction?` | message list |
| `POST` | `/api/v1/chat/rooms/:roomId/messages` | room participant | `{ content: string }` | sent message |
| `PATCH` | `/api/v1/chat/rooms/:roomId/me` | room participant | `pinned?`, `lastReadMessageId?`, `mutedUntil?` | my room state |
| `POST` | `/api/v1/chat/rooms/:roomId/leave` | room participant | `{ reason?: string | null }` | left room state |

Chat v1 is linked-room and text-only. DM, permanent team chat, and file attachment are deferred.

## Notification Endpoints

| Method | Path | Auth | Request | Response |
|---|---|---|---|---|
| `GET` | `/api/v1/notifications` | user | `status?`, `type?`, `cursor?`, `limit?` | notification list |
| `PATCH` | `/api/v1/notifications/:notificationId/read` | user owner | path id | read notification |
| `POST` | `/api/v1/notifications/read-all` | user | `{ type?: string | null }` | read-all result |
| `GET` | `/api/v1/notification-preferences` | user | none | preference row |
| `PATCH` | `/api/v1/notification-preferences` | user | `importantEnabled?`, `activityEnabled?`, `marketingEnabled?` | updated preferences |

## Navigation Contract

Notification rows may carry a deep link target. Frontend must use explicit read-and-navigate handling so read mutation, list invalidation, and route navigation do not race.

## Primary Tables

- `v1_chat_rooms`
- `v1_chat_room_participants`
- `v1_chat_messages`
- `v1_notifications`
- `v1_notification_preferences`
