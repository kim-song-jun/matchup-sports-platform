# Existing information forms: bounded local validation

Real alpha browser QA on2026-10-03, covering the existing tournament information modal and existing league-series edit page at CSS405×606,789×505,1183×758. This is a bounded local-draft report, not an application-wide PASS or a persisted-save test.

## Actual evidence denominator

- Tournament: **24 recorded observations**, not24 independent test cases
- League-series: **24 recorded observations**, not24 independent test cases
- Dismiss/reopen comparisons: **6**, one per form×width
  - Tournament: the5 fields present in each post-dismiss snapshot match its baseline
  - League-series: all8 recorded fields match its baseline
- Screenshots:6 inspected, pixel-preserving crops

The six comparisons were independently recomputed from the original UTC-keyed field values. Snapshot fields were compared as recorded; unrecorded fields were not inferred.

## What was observed

Tournament: empty required title sets native valueMissing and disables Save; restoring it re-enables Save.100 characters remain after an attempted101st keystroke. Team count1 and player counts0 are native-underflow; lower boundaries2/1/1 are native-valid. Mobile venue-length/optional-empty and min13 versus max12 observations are also retained. Relevant labels and responsive layouts were inspected.

Series: empty name disables Save despite no native required attribute.100 characters remain after the101st keystroke. Ratio0/minimum0 are native-underflow; ratio51 is native-overflow; ratios1 and50 with minimum1 are native-valid. The local explanatory preview responds to ratio changes; actual promotion calculation or confirmation was not activated.

**Native validity is not a displayed error.** Recorded nativeValidationMessage strings are DOM properties. All48 snapshots have empty alert arrays. No validation bubble or inline submit error is claimed. Save stays enabled for some numeric-invalid drafts; submission rejection was deliberately untested, so this does not establish a validation defect.

## Limits and safety

Save/Enter submissions:0. No bank, fee, legal-text, role, permission, result, notification or fixture changes. Local-state/write-boundary evidence came from code reading at the documented commit plus observed operations, not network interception. Server rejection and saved persistence remain untested.

Ordinary league-instance information editing was not reached: observed list/detail UI offered no such edit entry. League-series editing is a distinct surface. No physical-device, touch, virtual-keyboard, screen-reader or cross-browser PASS is implied. Console evidence covers only the latest50 warning/error entries.

## Files

- [Detailed summary](summary.json)
- [Tournament observations](proof.json)
- [League-series observations](series-proof.json)
- [Six dismissal comparisons](cancel-comparison.json)
- [Independent recomputation](verification.json)
- [Ordinary league-entry limit](league-entry-limit.json)
- [Console sample](console-summary.json) and [final clean UI state](final-state.json)
- [Capture UTC/crop provenance](screenshot-provenance.json) and [SHA-256 manifest](manifest.json)

Images: [tournament mobile](tournament-info-mobile-title-empty.png), [tablet](tournament-info-tablet-title-empty.png), [desktop](tournament-info-desktop-title-empty.png); [series mobile](series-mobile-ratio51.png), [tablet](series-tablet-ratio51.png), [desktop](series-desktop-ratio51.png).

Capture calls have their own exact UTC bounds. CSS789 and raster788 are distinct tablet measurements. Crops exclude financial fields, personal identities and sidebar account information.
