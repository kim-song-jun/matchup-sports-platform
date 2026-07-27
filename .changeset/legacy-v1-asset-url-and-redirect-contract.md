---
'v1_web': patch
---

Point the OTP email logo at its current root path instead of the legacy `/v1/brand/...` URL (email clients may not follow redirects), and assert the legacy `/v1` browser redirect with a non-following request so the E2E contract matches the deploy health gate (308).
