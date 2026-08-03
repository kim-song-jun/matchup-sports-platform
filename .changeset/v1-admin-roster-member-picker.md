---
'v1_api': patch
'v1_web': patch
---

Let admins pick a team member instead of typing a user id.

The admin roster form shipped asking for a "사용자 ID" — a UUID the operator had no way to obtain from any screen. Verified against alpha on 2026-08-04: the form renders and works, but nothing in the console shows a user's id, so in practice it could not be used. The feature was reachable only by someone who could query the database.

`GET /admin/registrations/:registrationId/eligible-players` returns the team's active members with eligibility already decided by the same checks `addPlayer` applies — already on the roster, incomplete profile, unverified phone. Ineligible members stay in the list with the reason attached rather than being filtered out: removing them turns "why is this person missing?" into a question the operator has to answer somewhere other than the screen they are looking at.

Computing eligibility server-side keeps one source of truth. Deciding it in the browser would drift from the service checks and produce a form that offers a member the API then rejects.

Reviewing that claim against `insertPlayerIntoRoster` turned up conditions the list did not carry, so the same defect existed inside the fix: a full roster, a cancelled registration, a finished tournament, and a deleted one all left every member selectable. The roster-full case is the shape of the 2026-08-03 incident itself — a ghost roster entry held the last slot and the screen showed nothing wrong until the operator clicked. Each now reads as a reason on the option.

The audit that followed closed integrity gaps in the paths this list feeds, all of which predate it:

- Rosters of `completed` and `cancelled` tournaments were still mutable by both teams and admins. Awards, reviews and records point at those rosters, which is why withdrawal cleanup already skips finished tournaments — the add and remove paths simply never carried the same guard.
- A team could undo an admin's eligibility ruling and silently erase the review note, with no audit entry. Teams still declare 선출 여부 as before; once an admin has ruled, the ruling holds. Removing and re-adding a player went around the same protection and now preserves it too.
- Male- and female-only tournaments never checked gender at all — only mixed did, and only for presence.
- Two concurrent admin removals could both succeed and write two audit entries, because the active check ran before the lock.
- Adding a player did not lock the membership row, so a team departure committing in between could leave a withdrawn member active on the roster — the exact state the cleanup helper exists to prevent.
- Changing eligibility did not refresh the roster cache, so the badge kept the old value. The awards tab called the consumer roster endpoint, which 403s for an admin who is not a member of the team and rendered as "no players".
