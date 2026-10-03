# Bounded admin regression observations after the 2357307 deployment workflow

Actual alpha observations on **2026-10-03**, at **405×606, 789×505, and1183×758 CSS pixels**. This package contains **25 safe PNG crops**, sanitized DOM timelines, exclusions and independent checks. It does not establish full-app or all19-PR acceptance.

The [Deploy Alpha workflow37105569761](https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/37105569761) was independently read back as successful for commit **235730755db0e7393bec9e01014a6906effde6af**, updated **07:30:13 UTC**. Fresh top-level admin entry was reported; first DOM observation was **07:35:37.555 UTC**. All supplied DOM observations and screenshot captures follow that workflow completion. **The browser exposed no serving build SHA**, so these are temporally post-deployment observations, not a browser-build attestation.

Test observations end **07:56:55.015 UTC**. A separate final-state check at **08:00:01.396 UTC** shows zero dialogs and focus on the review trigger. Exact screenshot start/end times remain separate from DOM observation times.

## PR1566 — roster modal focus

Supported on **one tournament and one league × three widths (6 combinations)**:
- Close-X is focused after opening; first Tab stays inside, and Escape closes the dialog and returns focus to a review trigger
- Explicit settled aggregate SELECT-count observations cover **4/6 combinations**: mobile tournament and all three league widths. They record **7 total SELECTs**, not six independently classified qualification controls
- True boundary Shift+Tab/Tab wrapping was sampled only for the **mobile tournament (1/6)**. Tablet/desktop tournament show an interior Tab and reverse return; league shows first Tab and Escape. Full trap-cycle coverage for all six is not claimed

Only the league tablet/desktop X crops visibly show blue focus outlines. Other focus claims depend on DOM, not the X image alone. The early mobile tournament crop is a loading-state trace; prefer the settled crop. No roster bodies or member identities are published.

[Focus/filter DOM proof](proof.json) · [Before evidence](https://github.com/kim-song-jun/matchup-sports-platform/blob/d8b6e25c275201af3ff8bab3d336b3be9af585b1/docs/qa/2026-10-03-admin-roster-focus/README.md)

- Tournament X: [mobile settled](images/mobile-modal-close-settled.png), [tablet](images/tablet-modal-close.png), [desktop](images/desktop-modal-close.png)
- League X: [mobile](images/mobile-league-modal-close.png), [tablet](images/tablet-league-modal-close.png), [desktop](images/desktop-league-modal-close.png)
- [Historical mobile loading-state X](images/mobile-modal-close.png), excluded from settled-state claims

## PR1567 — filtered empty state

At **3/3 widths**, selected 대기 gives zero review buttons and **선택한 상태의 신청이 없어요**, plus guidance to choose another state or all applications. Returning 전체 restores **two review buttons** at3/3 widths. The screenshots retain the **확정2** badge. These are observed UI counts, not a backend application-total test. Cursor overlap partly obscures the selected pill; DOM identifies 대기.

[DOM proof](proof.json) · [Before evidence](https://github.com/kim-song-jun/matchup-sports-platform/blob/d8b6e25c275201af3ff8bab3d336b3be9af585b1/docs/qa/2026-10-03-admin-registration-empty/README.md)

[Mobile](images/mobile-filtered-zero.png) · [Tablet](images/tablet-filtered-zero.png) · [Desktop](images/desktop-filtered-zero.png)

## PR1573 — local award delete-button overflow

At **3/3 widths**, the focused delete button is **44×44 CSS pixels**, fully inside the viewport:
- Mobile x316–360 within405
- Tablet x692–736 within789
- Desktop x1078–1122 within1183

Document scrollWidth matches CSS width; four text inputs are blank. Each width has **zero rows → one local blank row → zero after settled section navigation**. This is not a tested Cancel-button action or server deletion. The rapid mobile roundtrip is explicitly excluded from discard claims. No award Save, recipient selection or persistence action was used. The mobile team placeholder remains visually truncated, separately from the now-fitting delete button.

[Award DOM proof](awards-proof.json) · [Before evidence](https://github.com/kim-song-jun/matchup-sports-platform/blob/124d731effba624e32b95a12bccd36a5c92a007e/docs/qa/2026-10-03-award-overflow/README.md)

[Mobile](images/mobile-award-row.png) · [Tablet](images/tablet-award-row.png) · [Desktop](images/desktop-award-row.png)

## PR1575 — league detail/video date consistency

**Two fixtures × three widths (six comparisons)** show the same rendered dates/times on detail and settled video views: **September17 18:00** and **September24 18:30**. Three actual detail → video → detail link sequences retain the matching times. The initial header-only mobile video observation is excluded; the later settled two-row state is used.

Video rows expose the same week/team labels, but not fixture UUIDs. No database timestamp, canonical source or timezone-conversion claim is made. No video Save, upload or playback was performed.

[Video/date DOM proof](video-time-proof.json) · [Before evidence](https://github.com/kim-song-jun/matchup-sports-platform/blob/316c1f25ad97eceff18cb8d1f523055650f56555/docs/qa/2026-10-03-league-video-time/README.md)

- Mobile: [detail1](images/mobile-detail-date-1.png), [detail2](images/mobile-detail-date-2.png), [video1](images/mobile-video-date-1.png), [video2](images/mobile-video-date-2.png)
- Tablet: [detail1](images/tablet-detail-date-1.png), [detail2](images/tablet-detail-date-2.png), [video1](images/tablet-video-date-1.png), [video2](images/tablet-video-date-2.png)
- Desktop: [detail1](images/desktop-detail-date-1.png), [detail2](images/desktop-detail-date-2.png), [video1](images/desktop-video-date-1.png), [video2](images/desktop-video-date-2.png)

## PR1562 — unverified prerequisite

There are **zero valid step3 observations**. Native date inputs briefly showed values but were empty after Next; all three wizard records remain step2. Two early step3 labels are explicitly excluded. The input-tool/application-state cause is unresolved; this does not establish failure of the footer fix or a new product bug.

Leaving and reopening the wizard at **07:55:00.777 UTC** shows blank title/sport, no stage2 fields and no creation confirmation. No submission/create was reported. Wizard screenshots are excluded from this publication.

[Excluded/blocked proof](wizard-proof.json) · [Entry blocker](wizard-entry-blocker.json) · [Blank re-entry state](wizard-discard-reentry.json)

## Integrity and limits

- [Summary](summary.json), [exact capture provenance](screenshot-provenance.json), [independent verification](verification.json), [final state](final-state.json), [file manifest](manifest.json)
- Observation counts: **31 focus/filter,11 awards including one excluded rapid roundtrip,11 video including one excluded loading record,3 wizard**. These are observations, not that many independent tests
- All25 crops were decoded and visually reviewed. Output hashes, dimensions, stated crop bounds, source DOM indices and UTCs were checked. Two narrowed step labels preserve their original labels. Historical source hash snapshots remain distinguishable from the latest corrected snapshot
- Source collectors report pixel equality with the original regions. Original screenshots were intentionally not read again by the publisher; no original-member-content verification is claimed here
- Tablet CSS viewport is789, while its source raster is788pixels wide. DPR metadata is1.25/1.5/1. Crop pixels must not be substituted for CSS viewport dimensions
- Static crops alone cannot prove focus transitions, navigation, discard, or no writes. DOM sequences and reported procedure provide those bounded observations
- Only evidence files are added. No app code, issue/comment, PR, merge or deployment action is part of this publication
