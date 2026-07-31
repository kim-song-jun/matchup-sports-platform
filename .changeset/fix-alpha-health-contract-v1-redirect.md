---
"v1_api": patch
"v1_web": patch
---

Fix the alpha deploy health contract's stale assumption that /v1/home returns 404. apps/v1_web/next.config.ts redirects() has intentionally 308-redirected the legacy /v1 basePath to root (kept for bookmarks and the Kakao OAuth redirect_uri) for a while now, but the deploy-time contract check was never updated to match, so today's first real candidate deploy failed health verification even though the app was actually healthy.
