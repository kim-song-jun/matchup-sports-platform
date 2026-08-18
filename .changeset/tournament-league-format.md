---
"v1_api": minor
"v1_web": minor
---

Add league (round-robin) support to tournaments. The `league` format existed only as an enum value and some frontend rendering — the server never read it, and round-robin pairing lived in a client-side helper, so no server validation applied.

Round-robin pairing now lives in a single shared kernel on the server that both tournaments and team-match series use, with home/away double round-robin support. Group standings gained an aggregated tournament-wide table that is written in the same transaction as the per-group rows, so the two can never disagree, plus a reconcile CLI to verify that invariant. League tournaments now reject knockout groups and advance-count settings, fair-play points finally feed the fifth tie-break step instead of always being zero, and admins can set a guaranteed minimum number of matches per team.
