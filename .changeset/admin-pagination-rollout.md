---
'v1_api': minor
'v1_web': patch
---

Extend page numbers to the rest of the admin lists. The endpoints for members, matches, teams, team matches, notices, popups, inquiries, admins, and tournaments now accept a page alongside the cursor they already took, and report the total so a list can say where you are in it. The member list uses it: pages replace the "더 보기" pile-up, and changing a filter returns you to the first page instead of leaving you stranded past the end of a narrower result set. Totals come from the existing status aggregation rather than a second query.
