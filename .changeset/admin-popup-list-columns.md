---
'v1_web': patch
---

Fix the popup list hiding its own action buttons. The list shares the screen with a 400px detail panel, so moving it to a table with six columns pushed the view/edit/delete buttons past the edge — the row was visible but nothing could be done with it. Keep status, title, display window, and the actions; the target screens and last-edited time were already available in the detail panel.
