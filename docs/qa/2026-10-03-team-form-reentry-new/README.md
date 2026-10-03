# Team form: tablet reentry focus supplement

Issue [#1534](https://github.com/kim-song-jun/matchup-sports-platform/issues/1534) / [PR1539](https://github.com/kim-song-jun/matchup-sports-platform/pull/1539). A fresh **787×505 CSS px, DPR 1.5** observation records reentry through the team-create link, opening **더 꾸미기**, clicking the empty **팀 소개** field and pressing **Tab once to 레벨**. This is a later supplement to the [three-width focus evidence](https://github.com/kim-song-jun/matchup-sports-platform/blob/40bc047d7059b9658884144330559047f396691f/docs/qa/2026-10-03-team-form-focus-new/README.md); those observations remain unchanged.

The Tab call is recorded at **2026-10-03T14:49:33.666–14:49:33.736Z**. At **14:49:33.820Z**, the level SELECT is active in DOM and the captured AX line, with `focusVisible=true`. Its **48px** rectangle ends at **y412**, while the fixed CTA container starts at **y416**: **4 CSS px clearance**. Both recorded field endpoints are fully inside the viewport and have zero recalculated two-dimensional intersection with the CTA container and button.

The fresh blank reentry at **14:49:32.972Z** has BODY focus and is excluded from field geometry assessment. This supplement contains **3 focus DOM records, 2 applicable field endpoints, 1 recorded Tab move, 5 action-call records, 1 exit snapshot and 1 safe crop**. It does not add another three-width run.

[DOM proof](proof.json) · [Action call bounds](actions.json) · [Exit](exit.json) · [Scope](summary.json) · [Geometry and chronology checks](verification.json) · [Provenance](provenance.json) · [Manifest](manifest.json)

## Safe product image

Capture call **14:49:33.839–14:49:33.858Z**, after the separate level-focus DOM observation. Recorded full raster **787×505 pixels**; safe crop **580×335 pixels**. DPR was 1.5, but these are the recorded raster dimensions, not dimensions derived by multiplying CSS size by DPR.

![Tablet level focus after fresh reentry, above fixed CTA](1534-tablet-reentry-level.png)

**This safe PNG is byte-identical to the earlier 14:26 tablet crop, and the recorded full-source hash also matches.** The collector recorded a new screenshot call of the same blank UI. The new time belongs to that call metadata and the new DOM/action sequence; identical pixels alone cannot establish a capture time or another independent visual state. The publisher reviewed the safe pixels and metadata; original-to-crop equality is collector-attested.

## Exit and limits

The visible **이전** link call is recorded at **14:55:50.148–14:55:50.423Z**. The exit snapshot at **14:55:51.143Z** shows `/teams`, no team-name input, and two responsive team-create links with one rendered visible. The interval spent before exit is not measured navigation latency.

Team name and introduction are recorded empty at all three form observations. The initial optional section is collapsed; the introduction remains attached. No values were entered or changed, and no save, create, upload or Enter action was performed according to the collector. Default capacity and selections remain visible. This does not establish populated-form reset, storage cleanup, network/database write absence, screen-reader speech, a traversal starting at the image chooser, or new mobile/desktop reentry behavior. No reverse traversal was repeated here. Runtime serving SHA is unknown.
