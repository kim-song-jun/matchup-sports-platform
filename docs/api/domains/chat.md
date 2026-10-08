# V1 chat contract

Source: `apps/v1_api/src/chat/{chat.controller,chat.service}.ts`, `dto/chat.dto.ts`,
`apps/v1_web/src/hooks/{use-v1-api,use-chat-safety,use-v1-realtime-socket}.ts`.
All paths below are prefixed with `/api/v1`; responses use `{ status, data, timestamp }`.
V1 session authentication and current room entitlement are required. Development header auth is local-only.

| Method | Path | Contract |
| --- | --- | --- |
| GET | `/chat/rooms` | `roomType`, `status`, `cursor`, `limit` (1–50); `{ items, pageInfo: { nextCursor, hasNext } }`. Order is `lastMessageAt` desc with rooms that have no message last, then `createdAt` desc. Each item carries `linkedTargetCancelled` (`true` only when the linked personal match is `cancelled`; the room stays listed). Platform team-match rooms with no real message (system lines excluded) are omitted — see below |
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

- `GET /chat/rooms` checks the same current entitlement, active chat participant, requested room
  status and platform-room eligibility when fetching both ordering keys and room contents. A room
  revoked, left or archived between those reads contributes no title or message preview. If candidates
  disappear, the list refills from the remaining ordered keys in bounded batches. `hasNext` requires
  an entitled lookahead row, and `nextCursor` names the last returned room. If no eligible candidate
  remains, the page ends with `hasNext=false`, `nextCursor=null`. A cursor already absent at the next request remains
  an end cursor rather than restarting the list. Ordering and participant history boundaries are unchanged.

### Platform team-match rooms

- Platform recruitment creation atomically creates a `team_match` chat room and adds the creating
  operator (`createdByUserId`). Each HOME/AWAY approval atomically adds that team's active
  owner/manager accounts. Ordinary members and unapproved applicants have no access.
- The creating operator needs an active, non-revoked `owner`/`ops` admin account and active user
  account. This is scoped to their own `platformManaged` match; other admins gain no implicit access.
  Operator entitlement is checked for list, resolve, detail, messages and delivery recipients.
- A platform room is created at recruitment time but stays out of `GET /chat/rooms` until it holds at
  least one sent, non-system message. `resolve` and room detail/entry still work for entitled users
  at any time. Ordinary team-match, personal-match, team and team-contact rooms are always listed.
- Platform chat is available during `recruiting`, `closed`, `matched`, and `completed`; cancelled,
  expired and deleted matches are excluded. Ordinary team matches still require both assigned teams
  and `matched`/`completed`. Failed team-match entitlement returns `403 PERMISSION_DENIED`.
- The creating operator cannot leave (`403 PLATFORM_OPERATOR_REQUIRED`). Membership alone never
  preserves admin access after suspension, revocation, or a change to the support role.
- New automatic participants see history from room creation. Existing participant visibility,
  read cursors, preferences and team exits are preserved. The data-only migration
  `20261002110000_v1_platform_team_match_chat_backfill` adds missing rooms/participants and repairs
  a left creator only if they still have active operator authorization. Existing archived rooms
  remain archived; no existing messages are overwritten.
- No Prisma model/schema changes. `prisma migrate deploy` applies the backfill on deployment,
  including production after the user's dev-to-main promotion. Migration SQL is rerunnable.

- `v1_chat_room_participants.visible_from_at` is the participant visibility boundary; `GET
  /chat/rooms/:roomId/messages` returns only messages at or after it, and `PATCH
  /chat/rooms/:roomId/me` rejects `lastReadMessageId` values outside that visible window.
- Newly created or reactivated team-chat participants set `visible_from_at` at confirmed membership
  activation; ordinary on-demand team-match participants start with `visible_from_at = null` and the first room
  detail/message entry sets it and creates the joined system message.
- Personal match: approving an application (`POST /match-applications/:id/approve`) creates or finds the
  match room in the same transaction, registers the approved participant with `visible_from_at` = the
  approval time (`v1_match_participants.approved_at`) plus the joined system message — every approval resets it
  (and `last_read_message_id`), so a participant re-approved after cancelling never sees the cancelled period —
  and registers the host
  with `visible_from_at = room.created_at` (a host who left the room is not re-added). So the room shows in
  both users' chat list with unread counts and notifications from approval, and opening it late still shows
  messages sent since approval. Participants approved before this rule (no row, `null`, or an entry-time
  boundary) are pulled back to their approval time — host: `room.created_at` — on the next room access
  (no backfill, the same pattern as `team_match`). Messages before the approval stay hidden.
- Personal-match joined lines ("○○님이 들어왔어요") mark the **approval moment**, not the first room entry. A room
  first created by an approval gets `created_at` = that approval time so the host sees the first line too. A
  participant approved before this rule who enters with no boundary gets the line at `approved_at` (or
  `room.created_at` if the room is newer); such a past-dated line is not pushed over realtime and only moves
  `last_message_at` forward. Someone who already has a joined line (re-entry after leaving) gets it at entry
  time. The host has no joined line.
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
  to the match page the opposing team can open — a friendly to `/team-matches/:id`, a regular-league fixture to
  `/league-matches/:leagueId/fixtures/:id`, a tournament match to `/tournaments/:tournamentId/matches/:id` — otherwise
  `/teams/:teamId/schedules/:id`; matches route to `/matches/:id`. Cards stored earlier with `/team-matches/:id` for a
  league/tournament match are returned with the competition route on read (the stored snapshot is unchanged). The
  target page enforces the recipient's own access. `shareCard` is `null` when hidden/deleted or when
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

## Realtime message delivery

- After `sendMessage` persists successfully, `chat:message` is emitted to the sender's authenticated `user:<id>` channel as well as the existing eligible other recipients. All tabs/devices of that account can refresh their own stored message; this event does not mark it read.
- The sender remains excluded from notification rows, `notification:new` and web push. Existing other-recipient mute, current entitlement, blocking and notification preference checks remain in effect. Storage/permission failures emit no sender message; a realtime delivery failure after commit is logged and does not turn the persisted send into an API failure.
- Both the open room and standalone chat list subscribe to `chat:message`. The room refreshes its detail/message subtree once; the list refreshes base and filtered list queries without also refreshing that subtree. This works without sending a self notification or relying on a focus change. System-line delivery retains its existing actor-excluded recipient contract above.

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

`src/chat/chat.service.rooms-entitlement.spec.ts` invokes the real service and serializer while an
in-memory Prisma dependency evaluates current predicates before and after access changes. It covers
all linked room types, revoked operator access, chat exit/archive/platform eligibility, refill/cursor
and null-message boundaries, and database error propagation. It is query-contract regression coverage;
actual PostgreSQL concurrency and authenticated alpha behavior require separate integration/QA evidence.

`test/chat/chat-safety.integration-spec.ts` uses actual HTTP, DTO guards and PostgreSQL, with isolated
fictional users. It verifies reporting, membership/self guards, bilateral history/preview/unread filtering,
notification/realtime recipient exclusion, other-member delivery and owner-only unblock.

The web dialog shows API errors and exposes report receipts, explicit block confirmation and an unblock
list. Browser evidence is under `output/playwright/visual-audit/android-play-readiness/`.
