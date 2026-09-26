---
"v1_web": patch
---

Split the admin tournament detail screen into per-section routes (`/admin/tournaments/:id/:section`) with a shared shell and a grouped section nav, so each section deep-links, restores on back, and loads on its own.
