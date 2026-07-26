---
'v1_api': patch
---

Report the total row count on the admin notice and inquiry lists. Both already skipped ahead when given a page, but still returned the old cursor-only page info, and the table only draws page buttons once it knows how many pages there are — so the screen showed page 1 with no way to reach page 2. The count reuses the status aggregation the list already runs, as the other admin lists do.
