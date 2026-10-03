# Staff, award pickers and statistics: bounded observations

Real alpha QA on2026-10-03 at CSS405×606,789×505,1183×758. This package records local UI behavior and limits, not a full-system PASS.

## Actual evidence denominator

- Staff:7 mobile records plus18 further records,25 total observations
- Award picker/local row:29 observations, including explicit label correction and cleanup states
- Statistics:6 observations covering2 existing fixture states×3 widths
- New screenshots:5; previously published award screenshots are linked instead of copied

These are observation counts, not numbers of independent tests or unique defects.

## Staff

At all3 widths, the synthetic no-match query yields0 candidates and E2E yields10 actual candidate buttons. Tab reaches a candidate without selecting. Escape restores the trigger; reopen clears the query. Desktop also traverses to the10th candidate then the unchanged role control. Recorded role index and expiry remain unchanged.

Mobile/tablet expiry may begin partly obscured under the footer, but keyboard focus reveals it above the footer; this is not evidence that expiry is permanently inaccessible. The one-character query observation does not establish backend request behavior.

## Awards

Staged local rows, settled no-match search, Escape clearing, option highlighting, and discard-on-navigation were observed. Mobile additionally narrows an existing team query to1 option and stages a local team choice;1 recipient option appears, and a nonexistent query reports no matching roster member. No recipient was selected and Save/Delete were never invoked.

The source summary distinguishes initial default options, settled observations and loading/transient limits. A predicted Escape label was corrected to match the actual cleared input; originalStepLabel and labelCorrection remain in the proof. A wrong expected empty-message wait was a test-selector mismatch, not an application failure.

Known mobile row overflow is already documented in the [immutable award evidence](https://github.com/kim-song-jun/matchup-sports-platform/blob/124d731effba624e32b95a12bccd36a5c92a007e/docs/qa/2026-10-03-award-overflow/README.md). Its4 images and focused geometry proof are linked in [related-published-evidence.json](related-published-evidence.json), not duplicated here.

## Statistics

Ongoing fixture at all3 widths:0 finalized matches,3 empty sections,0 tables/search fields. Completed fixture at all3 widths:1 finalized match and table row counts1/2/2; all table link/button counts are0. No statistics search/filter or row-detail roundtrip was available. The6 source records and counts were independently checked.

## Safety and limits

Permission assignments/revocations, role changes, award Save/Delete and official result mutations:0 invoked. No export, upload, notification, campaign or fixture-creation step was used. Recorded UI operations do not constitute network interception or proof of all server activity. Server validation/persistence, physical devices and screen readers were not tested. Console evidence is only a latest50 warning/error sample, not comprehensive health certification.

## Files

- [Summary](summary.json)
- [Mobile staff observations](staff-mobile-proof.json) and [further staff observations](staff-proof.json)
- [Award local observations](awards-proof.json)
- [Statistics observations](statistics-proof.json)
- [Independent count checks](verification.json)
- [Console sample](console-summary.json) and [final state](final-state.json)
- [Capture UTC/crop provenance](screenshot-provenance.json) and [SHA-256 manifest](manifest.json)

Images: [staff mobile empty](staff-mobile-empty.png), [tablet empty](staff-tablet-empty.png), [tablet focused expiry](staff-tablet-expiry-focus.png), [desktop empty](staff-desktop-empty.png), [desktop statistics empty](statistics-desktop-empty.png).

Candidate identities, personal photos/names, phone numbers, birth dates, financial fields, credentials and sidebar account details are excluded. Exact screenshot-call UTC bounds remain separate from DOM observation times.
