---
'v1_web': patch
---

Turn the admin lists back into tables. Every list screen rendered a card grid at all widths, which is fine for a single item but wrong for data you scan and compare — there were no aligned columns, and values were cut to fit the card: the audit log showed times truncated mid-minute, reasons reduced to one character, and IDs stripped to their last eight characters, so a row no longer identified what it was about. On a wide screen a one-item list used a corner of the page and left the rest empty. Ten screens now render a table on desktop and keep the card stack on mobile, with IDs and reasons preserved in full via title text.
