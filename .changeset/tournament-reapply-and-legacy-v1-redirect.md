---
'v1_web': patch
---

Let teams re-apply to a tournament after their previous registration was cancelled (the wizard no longer reuses the cancelled registration id, which the server rejects with 409), and redirect legacy `/v1/*` URLs to their current paths.
