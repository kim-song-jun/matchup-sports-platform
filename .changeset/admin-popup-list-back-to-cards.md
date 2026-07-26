---
'v1_web': patch
---

Restore the popup list to cards and cap the body preview at two lines. Moving it to a table was wrong for this screen: the list shares the row with a 400px detail panel, and the table wrapper clips whatever overflows, so the view/edit/delete buttons ended up outside the visible area — the row was there but nothing could be done with it. The original complaint was that one popup stretched down the page because its whole body flowed into the card; clamping the preview fixes that without taking the layout away.
