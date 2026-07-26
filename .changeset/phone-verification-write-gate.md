---
'v1_api': minor
'v1_web': minor
---

Require phone verification for every write. Unverified accounts can still browse, but any create/join/submit request is rejected with 403 `PHONE_VERIFICATION_REQUIRED` (verification, signup, logout, withdrawal and the admin console stay open), a global modal explains the block and links to verification, the home banner can no longer be dismissed, and the profile page and account settings both expose the verification entry point and status.
