---
'v1_api': minor
'v1_web': patch
---

Extend page numbers to the rest of the admin lists. The endpoints for members, matches, teams, team matches, notices, popups, inquiries, admins, tournaments, and error logs now accept a page alongside the cursor they already took, and report the total so a list can say where you are in it. Every admin table uses it: pages replace the "더 보기" pile-up, and changing a filter returns you to the first page instead of leaving you stranded past the end of a narrower result set. Totals come from the existing status aggregation rather than a second query, except error logs, which have no status facet and so are counted with the same filter as the list.

Paging keeps the previous page on screen while the next one loads, so the table no longer blanks out between pages, and the page buttons lock while the request is in flight. The admin list stopped ignoring the page you clicked. Error log rows open their detail from anywhere in the row, not just the 보기 button.
