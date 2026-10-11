---
"v1_web": patch
---

Resync the chat room list and the open room's messages on every socket connect, first connect included, because events sent before the join are never replayed. Queries that ended in a permanent 4xx error are not refetched on connect, reconnect or tab return; transient failures (network, 408, 429, 5xx) are retried on recovery.
