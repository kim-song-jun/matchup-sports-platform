# Roster-review modal boundary and forward-cycle observations

Issue1564 follow-up at405/789/1183 CSSpx for league and tournament registrations. **All six settled combinations record15 focusable controls, a full forward Tab cycle1→…→14→0, and X close returning focus to trigger0.** There are90 forward endpoints,116 focus DOM records and8 closed-state records. The final-state file duplicates closed record7. Fifteen means controls, not roster members.

**Original-epoch reverse-boundary scope is narrower:** five combinations start settled with15 controls, reverse0→14 to a visible footer target, and Tab back14→0. League-tablet's earlier reverse attempt starts while only2 controls are recorded; its target14 lies below the viewport. Its later settled forward cycle is a separate opening. Do not combine these into a fully settled six-combination reverse-boundary pass.


## Later league-tablet reverse supplement

A separate12:50:41.401–12:51:31.035UTC observation now records a settled15-control baseline and **0→14→0**, with the footer fully visible at y425.531/bottom469.531 within viewport505. [New footer crop](modal-boundary-league-tablet-last-supplement.png) and [four DOM records](modal-boundary-reverse-supplement.json) support this later result. The original offscreen attempt remains preserved. Across the original five settled reverse cases plus this separate sixth case, the boundary has now been observed settled at every route/width combination; the six full forward cycles remain the earlier observations.

After the new X close, focus is on a generic review button and modal count is0. Exact triggerIndex, focusVisible and viewport were not recorded for that new closed row, so they are not inferred. [Supplement provenance](modal-boundary-reverse-supplement-provenance.json) · [Independent checks and limits](reverse-supplement-verification.json)

## Eleven original-epoch safe crops

- [modal-boundary-league-mobile-first](modal-boundary-league-mobile-first.png)
- [modal-boundary-league-mobile-last](modal-boundary-league-mobile-last.png)
- [modal-boundary-league-tablet-first-settled](modal-boundary-league-tablet-first-settled.png)
- [modal-boundary-league-desktop-first](modal-boundary-league-desktop-first.png)
- [modal-boundary-league-desktop-last](modal-boundary-league-desktop-last.png)
- [modal-boundary-tournament-mobile-first-settled](modal-boundary-tournament-mobile-first-settled.png)
- [modal-boundary-tournament-mobile-last-settled](modal-boundary-tournament-mobile-last-settled.png)
- [modal-boundary-tournament-tablet-first](modal-boundary-tournament-tablet-first.png)
- [modal-boundary-tournament-tablet-last](modal-boundary-tournament-tablet-last.png)
- [modal-boundary-tournament-desktop-first](modal-boundary-tournament-desktop-first.png)
- [modal-boundary-tournament-desktop-last](modal-boundary-tournament-desktop-last.png)

Crops contain only X or footer-close buttons and focus outlines. First-control images show return to index0 after a complete forward cycle, not the initial-opening appearance. Intermediate targets are supported by DOM, not published roster screenshots.

## Preserved exclusions and geometry limits

- League-tablet initial count2 and incomplete2-Tab attempt remain excluded from settled-cycle assertions; rows19/20 retain limited earlier boundary evidence
- League-tablet reverse footer y606.865/bottom650.865 is outside viewport505. Its image has no public crop; no replacement image implies visibility
- Tournament-mobile early count2→3→15 records and initial captures remain excluded; only settled replacements are published
- Earlier closed records1/4 restore trigger0 with focusVisible=false; later settled observations do not relabel them
- Desktop forward-footer records55/114 extend0.296875 CSSpx below the modal's outer rectangle while staying inside viewport758 and within the modal DOM. The selected reverse-footer crops are different observations. No new defect is inferred from this fractional discrepancy

[Summary](summary.json) · [116 focus DOM records](modal-boundary-after-proof.json) · [8 closed states](modal-boundary-closed-proof.json) · [Final state](modal-boundary-final-state.json) · [Provenance](provenance.json) · [Recomputed checks](verification.json) · [Manifest](manifest.json)

## Timing and scope

Records12:30:01.555–12:34:56.486UTC follow [Deploy Alpha8167aaa](https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/37118485935), success updated11:22:16UTC. ServingSHA is unknown. Tablet CSS789×505 differs from source raster788×505. Opaque fixture URLs are represented by hashes and generic route classes in this package.

Only keyboard movement and X close were performed per collection report. Membership changes, qualification selection, adding/removing/locking/saving, whole-modal accessibility and backend persistence are not validated. Source-original pixel equality is collector-reported; the publisher inspected the11 original safe outputs and the separate later footer crop.
