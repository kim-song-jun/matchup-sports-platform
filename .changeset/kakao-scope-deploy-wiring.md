---
"v1_web": patch
---

Deliver `NEXT_PUBLIC_KAKAO_SCOPE` to the built web image so the Kakao consent items can actually be requested. The signup prefill work added the code that appends `scope` to the Kakao authorize URL, but `NEXT_PUBLIC_*` values are inlined at build time and the variable was declared nowhere in the pipeline — no Dockerfile `ARG`, no compose entry, and absent from the allowlist of environment variables the alpha workflow forwards to its deploy script — so setting it had no effect. It is now wired through the Dockerfile, both compose files, the alpha deploy chain and the production build args, sourced from a `KAKAO_SCOPE` repository variable. Leaving it unset keeps today's behaviour exactly: no `scope` parameter is sent, which matters because Kakao fails the authorize step outright when asked for consent items the app has not been approved for.
