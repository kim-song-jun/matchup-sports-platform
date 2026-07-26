---
"v1_api": minor
"v1_web": minor
---

Absorb the commits that had been merged directly into `main` (bypassing `dev`) — an admin rich-content editor for notice/popup bodies with upload-asset quota tracking, an `AdminListSummary` aggregation contract shared across admin list endpoints, a confirmation-phrase safeguard for member removal, and a session-preservation fix so `RequireAuth`/`SessionEntryGate` only clear the session on a genuine 401 instead of any error — and reconcile them with `dev`'s own realtime-socket-disconnect and account-deletion hardening. Going forward, `main` is retired: all work lands on `dev`, which auto-deploys to alpha.
