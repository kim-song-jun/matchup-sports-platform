---
'v1_api': patch
'v1_web': patch
---

Let admins pick a team member instead of typing a user id.

The admin roster form shipped asking for a "사용자 ID" — a UUID the operator had no way to obtain from any screen. Verified against alpha on 2026-08-04: the form renders and works, but nothing in the console shows a user's id, so in practice it could not be used. The feature was reachable only by someone who could query the database.

`GET /admin/registrations/:registrationId/eligible-players` returns the team's active members with eligibility already decided by the same checks `addPlayer` applies — already on the roster, incomplete profile, unverified phone. Ineligible members stay in the list with the reason attached rather than being filtered out: removing them turns "why is this person missing?" into a question the operator has to answer somewhere other than the screen they are looking at.

Computing eligibility server-side keeps one source of truth. Deciding it in the browser would drift from the service checks and produce a form that offers a member the API then rejects.
