---
"v1_api": minor
"v1_web": minor
---

Make the review-writing window configurable from admin and change the default from 48 hours to 7 days.

The deadline used to be a hardcoded 48-hour constant. It now reads a singleton
`V1ReviewPolicySettings` row (default 168 hours) that ops can edit at
`/admin/settings/reviews`, with presets, range validation (1 hour – 365 days), and an
audit-logged update. Because the deadline is computed per request rather than stored,
raising the window reopens fixtures that the previous policy had already closed, and
lowering it closes open ones immediately — the admin screen states this explicitly.
