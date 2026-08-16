---
"v1_web": patch
---

Fix the live game operations console losing its event history on socket reconnect, which silently broke the header score, cumulative fouls, remaining substitutions and on-pitch state until a page reload. Every `game.subscribe` now resyncs the full history, snapshots are applied monotonically, a subscribe whose ack never arrives can no longer latch the re-entrancy guard, a server-reported gap can no longer trigger an unbounded resubscribe loop, and neither a REST-derived sequence nor a send ack can unfreeze an incomplete timeline.
