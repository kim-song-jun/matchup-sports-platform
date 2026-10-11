---
"v1_web": patch
---

Skip the redundant chat message and room list refetch when the socket connects right after fresh reads, and never refetch queries that ended in error.
