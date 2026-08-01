---
'v1_web': patch
---

Explain why a tournament cannot take a new application instead of failing at submit time. Awaiting-payment teams reserve capacity on the server, so a tournament shown as "5 / 8 confirmed" could already be full; the list card now names the awaiting-payment teams, the per-team application hub shows the capacity breakdown and the concrete blocking reason, and the apply wizard checks capacity and the registration deadline up front rather than letting a re-applying team fill in every agreement before hitting a 409.
