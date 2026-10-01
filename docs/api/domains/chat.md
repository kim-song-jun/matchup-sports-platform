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
| GET | `/chat/rooms/:roomId/messages` | `cursor`, `limit` (1–100), `direction: before \| after`; cursor page, only messages since the participant's visibility boundary |
| POST | `/chat/rooms/:roomId/messages` | exactly one of `{ content }` (nonblank, max 2,000), `{ imageUrl }` (sender's own image upload from `POST /uploads`, else 400 `VALIDATION_FAILED` field `imageUrl`), `{ share: { kind: team_schedule \| match, targetId } }` (object; sender must be able to view the target, else 400 field `share`) or `{ fileId }` (sender's own chat file from `POST /uploads/files`, else 400 field `fileId`); several/none → 400; active room, accepted team contact if applicable. Returns `{ messageId, roomId, messageType, content, imageUrl, shareCard, file, status, sentAt, senderUserId }` |
| GET | `/chat/rooms/:roomId/messages/:messageId/file` | download a file message — same visibility rules as the message list (entered active participant, message at/after the visibility boundary, not blocked, `status = sent`); 403 non-participant, 404 otherwise. Raw file body (not the JSON envelope), `Content-Disposition: attachment; filename*=UTF-8''…`, `X-Content-Type-Options: nosniff`, `Cache-Control: private, no-store` |
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
  activation; team-match participants start with `visible_from_at = null` and the first room
  detail/message entry sets it and creates the joined system message.
- Personal match: approving an application (`POST /match-applications/:id/approve`) creates or finds the
  match room in the same transaction, registers the approved participant with `visible_from_at` = the
  approval time (`v1_match_participants.approved_at`) plus the joined system message, and registers the host
  with `visible_from_at = room.created_at` (a host who left the room is not re-added). So the room shows in
  both users' chat list with unread counts and notifications from approval, and opening it late still shows
  messages sent since approval. Participants approved before this rule (no row, `null`, or an entry-time
  boundary) are pulled back to their approval time — host: `room.created_at` — on the next room access
  (no backfill, the same pattern as `team_match`). Messages before the approval stay hidden.
- A `team_match` room is visible to every participant from the room's creation (`visible_from_at =
  room.created_at`, the same invariant as `team_contact`), so messages the other team's leader sent
  before this participant entered are listed and counted as unread. The joined system message is still
  created at entry time. A participant whose boundary was set to an entry time earlier is pulled back to
  `room.created_at` on the next room access (no backfill). Team rooms keep the entry-time boundary.
- Team-membership activation creates one system message (`messageType = "system"`,
  `systemEventType = "joined"`); existing active-member repair does not duplicate it. Leaving or being
  removed from a team writes `systemEventType = "left"` (`○○님이 나갔어요` for both — the room does not
  reveal who removed the member).
- Team-contact responses write one system line as the responder (`컨택을 수락했어요` / `컨택을 거절했어요` /
  `컨택을 철회했어요`, `systemEventType = null`; a decline reason stays on the contact, not in the line).
  Expiry and blocking write no line.
- Every system line goes through `ChatService` only: `recordSystemLine` persists it inside the membership or
  contact-response transaction, and after commit `deliverSystemLine` emits `chat:message` to the same
  recipients a text message from that user would reach — the actor is excluded, and a declined/withdrawn
  contact room still receives the line although it is archived (payload = text payload + `messageType`,
  `systemEventType`). No notification row or push is created, and a socket failure is logged, not surfaced.
- Message rows include `messageType` (`text | system | image | share | file`), `systemEventType`, `imageUrl` (image messages only), `shareCard`, `file`, and `unreadCount`.
  `unreadCount` is computed per non-system message from active participants whose visibility boundary includes that
  message and whose `lastReadMessageId` is older or empty; system messages always return `0`.
- Image messages (Task 181): `messageType = "image"`, `body`/`content = "사진"` (so previews, report snapshots and
  body-only readers stay readable), `imageUrl` = the referenced `V1UploadAsset.url`. `imageUrl` is `null` when the
  message is hidden/deleted (same rule as `content`) or the upload was deleted (FK `ON DELETE SET NULL`).
  Notification/push body is "사진을 보냈어요". Room-list `unreadCount` counts every non-system message.
- Share messages (Task 181 ②): `messageType = "share"`, `content = "[일정] 제목" | "[매치] 제목"`, `shareCard` =
  `{ kind, targetId, title, startAt, place, sub, route }` snapshotted at send time. Visibility is checked against the
  **sender** with the same rules as the target's own detail page: a team schedule needs an active, non-deleted team and
  either `visibility = PUBLIC` or an active membership; a match must not be deleted. A team-match schedule's card routes
  to `/team-matches/:id` (the opposing team can open it), otherwise `/teams/:teamId/schedules/:id`; matches route to
  `/matches/:id`. The target page enforces the recipient's own access. `shareCard` is `null` when hidden/deleted or when
  the stored JSON is malformed (`route` must be a same-origin path). Notification body "일정을 공유했어요 · 제목" /
  "매치를 공유했어요 · 제목".
- File messages (Task 181 ③): `messageType = "file"`, `content = "[파일] 이름"`, `file = { name, size, mimeType }` (never
  the storage path; `null` when hidden/deleted or the upload was deleted). Notification body "파일을 보냈어요 · 이름".
  Files live outside the public `/uploads` path and are readable only through the download route above. Reports append
  the file name.
- Image privacy: chat photos are served from the same **public, unguessable UUID path** (`/uploads/...`) as other
  uploads — anyone holding the URL can open it (no room-membership check on the static file). The web client always
  re-encodes chat photos before upload (`useV1UploadImages({ stripMetadata: true })`) so EXIF (GPS location, device)
  does not travel with them. Chat **files** (Task 181 ③) use a participant-only download route; photos stay on the public path for now.

## Reporting and blocking

- Report reasons: `spam`, `harassment`, `impersonation`, `inappropriate`, `other`; detail max 500.
- Both actions require current room entitlement, an active participant, an entered room, and a visible,
  sent non-system (text or image) message from another user. Image reports append the image path to the snapshot. Cross-room/invisible messages return 404; self-targets 400;
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
