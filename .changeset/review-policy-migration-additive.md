---
"v1_api": patch
---

Drop the seed INSERT from the review-policy settings migration so the alpha deploy's
expand-contract gate accepts it.

The gate rejects `INSERT` as a category because it cannot prove additivity, and the seeded
row was never needed: the service falls back to the 168-hour default when the row is absent
and upserts it the first time an admin saves.
