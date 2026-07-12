# 95 - V1 Team Chat Auto Sync And Team Share

## Scope

- Backend: `apps/v1_api`
- Frontend: `apps/v1_web`
- Docs: `docs/api/v1`

## Requirements

- Creating a team creates an active team chat room automatically.
- The team owner is added as an active chat participant when the team is created.
- Approved team join applications add or reactivate the applicant in the team chat.
- Removing a team member marks that user's team chat participant row as left.
- Team chat rooms are returned as `roomType: "team"` with the linked team target.
- Team detail has a share action in the upper-right area.
- Share action uses native Web Share when available and falls back to copying the team URL.

## Acceptance Criteria

- Given a team is created, when the create transaction commits, then `v1_chat_rooms.team_id` and an owner `v1_chat_room_participants` row exist.
- Given a join application is approved, when the transaction commits, then the applicant is an active participant in that team's chat room.
- Given a non-owner membership is removed, when the transaction commits, then the matching team chat participant is `left`.
- Given an active team member resolves a team chat, then `/api/v1/chat/rooms/resolve` accepts `{ targetType: "team" }`.
- Given the team detail screen is open, then the hero area exposes a share button that triggers native share or clipboard copy.

## Progress Snapshot

- Implemented Prisma schema and migration for team-linked chat rooms.
- Implemented team creation/join/removal chat participant synchronization.
- Extended chat API DTOs/service/types for `team` rooms.
- Added team detail share action with Web Share API fallback.
- Synced v1 chat/deferred API docs.
- 2026-07-01: Fixed team detail chat CTA 404 caused by using API-style `/chat/rooms/:roomId` as a web route; resolve now returns `/chat/:roomId`, and web clients normalize stale API-style routes before navigation.

## Validation Notes

- Pending local validation. Current workspace has known Windows pnpm/node_modules shim issues from earlier attempts.
