---
"v1_api": minor
"v1_web": minor
---

Introduce a review-writing window (default 7 days) with an admin setting on the production line.

Production had no review deadline at all — reviews could be written indefinitely. This adds the
same window the alpha line already had, but configurable from `/admin/settings/reviews` and
defaulting to 168 hours instead of the alpha line's original hardcoded 48.

The deadline is computed per request rather than stored, so changing the setting takes effect
immediately in both directions: raising it reopens fixtures the previous value had closed, and
lowering it closes open ones. The admin screen states this explicitly.
