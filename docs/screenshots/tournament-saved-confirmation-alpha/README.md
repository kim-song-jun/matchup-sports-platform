# Actual Alpha tournament saved-confirmation verification

Observed 2026-10-16 on Alpha commit `ebfac9aeecbcca0a33b435d514d828aa76052dc9`, runtime `1.9.5-alpha.20261016.gebfac9aeecbc`. Matching merge CI `38888921934` and deployment `38888922020` completed successfully.

These are actual deployed UI screenshots, supplementing the earlier component-render images in PR #1956. Role: authenticated tournament administrator. Dedicated QA drafts only; registration was never opened and both drafts remain private. No operating tournament was changed by this QA.

| Evidence | State |
| --- | --- |
| before-confirm-390.png | Earlier Alpha a8bd190a: local league preview could be entered although the server still stored knockout. Before/after represent different save states; this is behavior evidence, not a same-content pixel comparison. |
| after-confirm-390.png | Saved knockout preview on ebfac, 390×1000. |
| after-confirm-768.png | Saved knockout preview on ebfac, 768×1000. |
| after-confirm-1440-content.png | Saved knockout preview at actual 1440×1000 viewport; captured main-content rectangle x240/y0/1200×1000 to exclude internal operator sidebar identifiers. |

Actual UI checks: unsaved title and format block confirmation; saving persists then enters confirmation; league/minimum2/lineup6/limited4 match GET; clearing venue snapshot/minimum/prize summary/rules persists null; group-knockout and knockout guides match saved formats; real stale-version PATCH409 keeps step4, shows friendly refresh guidance and preserves the concurrent server title. Fresh UI POST201 returns lineup6/limited4/minimum null and reaches confirmation.

Measured after-preview and true-bottom screenshots at 390/768/1440: no horizontal overflow, scroll gap 0 or −0.5px, fixed confirmation CTA bottom988 within viewport1000. Root inspected 390 and1440 original images; independent gpt-6-sol review and separate public-guide measurements are recorded in local release evidence.

Limits: no real registration publish, payment, notifications, or participant mutations. Browser date inputs used native HTMLInputElement value/input/change events after Ego's segmented datetime fill limitation. Initial cleanup incorrectly sent isPublic to the general update endpoint (400); corrected dedicated visibility PATCH200, then both anonymous detail APIs404. Deliberate conflict409 and navigation cancellations are not unexplained failures. Public/detail guide QA is a separate receipt; this gallery does not claim all roles or all pages.
