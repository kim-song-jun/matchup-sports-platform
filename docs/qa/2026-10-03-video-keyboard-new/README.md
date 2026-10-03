# Video item keyboard activation: new desktop observation

Issue [#1404](https://github.com/kim-song-jun/matchup-sports-platform/issues/1404), limited to actual keyboard activation and destination comparison for the two observed video items. This new **1180×757 CSS px, DPR1** sequence contains **5 DOM snapshots and2 Enter activation records**, including their QA-tab cleanup, with **0 screenshots**. Observation window: **2026-10-03T14:37:23.277–14:39:57.445Z**.

The collector selects the video panel, uses native Tab to **결승 하이라이트 보기 (새 창)**, activates Return/Enter, closes the newly created QA tab, then uses Tab to **우승 세리머니 보기 (새 창)** and repeats Enter/cleanup. Four anchor endpoints record `focusVisible=true`: before activation and after tab cleanup for each item. The initial panel-button endpoint has `focusVisible=false` and is a different control.

- Item1 Enter call: **14:37:41.982–14:37:42.052Z**. New QA tab3 URL observed at **14:38:36.555Z** exactly matches the item href; after closing tab3, inventory is again original tab2 only
- Item2 Enter call: **14:39:33.808–14:39:33.882Z**. New QA tab4 URL observed at **14:39:57.376Z** exactly matches the item href; after closing tab4, inventory is again original tab2 only

Both items expose the same generic mock media URL, `https://alpha.teameet.co.kr/mock/generated/tournament-highlight.webm`, with `target=_blank` and `rel=noreferrer`. They are two distinct named controls with one destination, not two independently verified videos. No duplicate-content defect is inferred.

[DOM proof](proof.json) · [Enter and QA-tab records](activations.json) · [Scope](summary.json) · [Independent checks](verification.json) · [Source hashes](provenance.json) · [Manifest](manifest.json)

## Evidence boundaries

The initial tab inventories record empty URLs while the new tabs are opening. Destination assertions use the later recorded settled URLs. The54.503/23.494 second gaps after Enter-call completion are gaps before observations, not page-load or media-performance measurements. Enter/close timestamps are collector CUA call bounds, not browser-event logs. Native Tab execution is collector-reported; the stored DOM establishes the resulting active anchors.

The video items have recorded DOM tag **A** and item-button count0, so **Space for the button variant is not applicable to these items**. The panel-selection button and any native media-player buttons are outside this item-activation condition.

The original source page URL remains identical across all5 DOM snapshots. Its opaque fixture ID is omitted and a hash retained. Remaining-tab inventories show original tab2 throughout cleanup. Post-close activeElement records do not independently prove native window focus; no usable `document.hasFocus` observation was retained.

This new desktop execution is separate from earlier three-width static role/name checks. Explicit role attributes, list-item wrapper structure and AX roles are not re-recorded in these files. No actual media playback success, duration, content quality, MIME/header correctness, network timing, screen-reader speech, mobile/tablet keyboard activation or whole-issue PASS is claimed. Runtime serving SHA is unknown.
