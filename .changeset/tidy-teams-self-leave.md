---
"v1_api": minor
"v1_web": minor
---

Add self-service team leave: members can now leave a team themselves (`POST /teams/:teamId/leave`). The last active owner is blocked from leaving until ownership is transferred, and concurrent leave attempts are serialized to prevent a team from ending up with zero owners.
