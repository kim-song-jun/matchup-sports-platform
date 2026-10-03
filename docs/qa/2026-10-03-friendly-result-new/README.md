# Completed friendly F1: score and goal disclosure

This bounded read-only observation covers one existing completed friendly fixture at **404×606, 787×505 and1180×757 CSS px**. It records **10 DOM observations, 6 collector click-call records, 3 expand/collapse cycles and 3 safe button crops**, from **2026-10-03T14:06:33.279–14:07:57.816Z**.

Each width records **aria-expanded false→true→false**. The controlled goal-region lookup changes **absent→present→absent**; the collector queried the ID from the button’s `aria-controls`. The displayed score-line ends remain **0:1** throughout all10 observations. Expanded region observations contain **2′**, with44px region height; collapsed observations have no controlled node and0 height. The disclosure button’s measured DOM height is45px in every observation.

[Sanitized DOM proof](proof.json) · [Click call bounds](actions.json) · [Scope](summary.json) · [Independent checks](verification.json) · [Provenance](provenance.json) · [Manifest](manifest.json)

## Safe expanded-control crops

The crops contain only **득점 기록 접기 (1)** and its control. They do not show the score, goal minute, teams or players; those numeric observations are DOM evidence.

Mobile404×606, DPR1.25: linked DOM row2 at **14:07:27.152Z**; capture **14:07:27.154–14:07:27.170Z**. This is a later observation of the same expansion that was first recorded at **14:06:33.597Z**, not another click or cycle.

![Mobile expanded goal-record control](friendly-result-mobile-expanded.png)

Tablet787×505, DPR1.5: DOM row5 at **14:07:56.600Z**; capture **14:07:56.603–14:07:56.624Z**.

![Tablet expanded goal-record control](friendly-result-tablet-expanded.png)

Desktop1180×757, DPR1: DOM row8 at **14:07:57.471Z**; capture **14:07:57.474–14:07:57.494Z**.

![Desktop expanded goal-record control](friendly-result-desktop-expanded.png)

Tablet and desktop capture completion timestamps equal the following collapse-call start timestamps. Capture calls, action calls and DOM observations are distinct records; their bounds are not independent browser-event timestamps.

## Scope limits

The collector reports the current admin-access session, without switching accounts or roles. Recorded result-entry link count0 and disabled application controls are UI observations, not server-authorization or participant-permission tests. The final record is collapsed with score0:1.

No result entry/edit/reopen, application, roster mutation, review posting, notification, save or other server-write action was performed according to the collector. No server persistence, screen-reader speech or full keyboard flow was tested. Score extraction retains only numeric ends of each displayed side; no player or team identity is included. Runtime serving SHA is unknown. This is one fixture’s bounded read-only behavior, not a whole-flow or whole-app PASS.

The publisher reviewed actual safe pixels, local file hashes, PNG sizes and crop/DOM mapping. Original-to-crop equality remains collector-attested; originals were not read. The fixture’s opaque URL is represented by an alias and SHA256.
