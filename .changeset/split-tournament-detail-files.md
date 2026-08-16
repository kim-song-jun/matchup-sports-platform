---
"v1_web": patch
---

Split the 4,167-line admin tournament detail module into per-section files (registrations / bracket / announcements / info / awards / reviews) over a shared helper module, so each section route bundles only what it renders.
