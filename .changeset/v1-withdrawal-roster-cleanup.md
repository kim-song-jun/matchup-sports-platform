---
'v1_api': patch
'v1_web': patch
---

Clear tournament rosters when a user leaves a team, and let admins edit a roster at all.

A member requested withdrawal, the owner removed them from the team, and they stayed on the tournament roster holding one of twelve slots. The team could then only add one more player instead of two, and nothing on screen explained why. Verified in production on 2026-08-03: the account was `withdrawal_pending`, the membership was `removed`, and the roster entry was still active.

All three ways out of a team ignored the roster — `withdrawalRequest`, `removeMembership` (the path this incident took), and `leaveTeam`. Prisma's `onDelete` cannot cover this: every "delete" in the domain is a status-column update, so no cascade ever fires. The cleanup is now explicit and shared by all three, and withdrawal additionally releases team memberships as `left`.

The cleanup update rechecks `removedAt` so a concurrent removal is not overwritten, and audit counts report only rows actually changed.

Completed tournaments are deliberately excluded. Awards, reviews and standings reference the roster, so removing a name from a finished tournament would rewrite history to fix a capacity problem that only exists for upcoming ones.

Admin deactivation (`changeUserStatus`, `deleteUser`) now refuses a user who still holds team ownership, the same rule self-withdrawal already enforced. Without it an admin could deactivate an owner and leave the team `active` with `ownerUserId` pointing at a dead account — self-withdrawal blocked that, the admin path did not.

The reason the incident produced no error is that the admin console had no way to change a roster: it could list, export, and set eligibility, but there was no add or remove route, so the request never reached the server (24h of logs for that registration: zero POSTs, zero 4xx). Those routes and the matching UI now exist. Admins may override the roster lock and the submission deadline — both already have dedicated admin endpoints for exactly that — but not the capacity, membership, profile or duplicate checks, which are data integrity rather than permission.

The regression test runs against a real database. Asserting on a mocked Prisma client would keep passing if the `where` clause regressed, which is the failure mode that let this reach production.
