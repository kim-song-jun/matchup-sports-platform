---
"v1_web": patch
---

Fix a real bug found via live E2E push-notification testing: `useV1PushRegistration().subscribe()` called `pushManager.subscribe()` on the registration `navigator.serviceWorker.register()` resolved directly, which on a brand-new registration is still installing — every user's first-ever subscribe attempt threw "no active Service Worker" and failed silently (caught by `reportClientError`, no visible error state). Now awaits `navigator.serviceWorker.ready` first, matching the existing pattern in `unsubscribe()`. Also adds a dismissible home-screen banner that re-nudges existing users who declined or never responded to the onboarding push prompt, shown once per login/session.
