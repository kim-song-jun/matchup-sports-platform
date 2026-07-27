---
'v1_web': patch
---

Let unverified accounts finish phone verification inside profile editing: the card now uses the authenticated flow (which updates the account) instead of only issuing a proof token, so saving no longer bounces off the server-side verification gate.
