# Tournament wizard stage3 focus — later successful observation

PR1562: after native calendar entry, stage3 activates the **참가 조건 H2**, and the next Tab activates the **44 CSSpx-high team-count input** at all three widths. Its value remains8. The first input is fully inside the viewport and above the fixed footer in all three DOM pairs.

| CSS width | Input bottom | Footer top | Clearance |
|---|---:|---:|---:|
|405|228.975|537.600|308.625|
|789|228.667|436.667|208.000|
|1183|553|689|136|

Mobile is the initial step3 entry; tablet and desktop are reentries. The heading has focusVisible=false: active-element DOM proves focus, while the Tab images visibly show the first input outline. Six crops intentionally exclude the footer; its position is supported by recorded DOM, with original screenshot inspection attributed to the collector.

## Actual safe crops

- [tournament-wizard-mobile-heading](tournament-wizard-mobile-heading.png)
- [tournament-wizard-mobile-team-count](tournament-wizard-mobile-team-count.png)
- [tournament-wizard-tablet-heading](tournament-wizard-tablet-heading.png)
- [tournament-wizard-tablet-team-count](tournament-wizard-tablet-team-count.png)
- [tournament-wizard-desktop-heading](tournament-wizard-desktop-heading.png)
- [tournament-wizard-desktop-team-count](tournament-wizard-desktop-team-count.png)

## Prerequisite, timing and cleanup

The single mobile native-calendar prerequisite records local form strings2026-10-10T12:00 and registration2026-10-07T23:59 at12:00:13.899UTC. The collector used the calendar UI, then continued into stage3; no timezone conversion or per-click timestamp is inferred. Focus records span12:00:56.133–12:01:39.325UTC.

[Deploy Alpha8167aaa](https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/37118485935) succeeded at11:22:16UTC. Browser servingSHA remains unknown. The enclosing collection name containing2357307 does not establish its runtime version. [Earlier date-entry blocked evidence](https://github.com/kim-song-jun/matchup-sports-platform/blob/714606dcd4e172e1295dfbde3ac6d00175455a66/docs/qa/2026-10-03-admin-after-2357307/wizard-entry-blocker.json) remains unverified at its original time.

Blank reentry at12:01:58.706 shows empty title/sport; later-stage controls were unmounted, not reread as empty. Final12:02:51.948 is the tournament list. One blank-reentry footerCancel attempt did not navigate; the actual header list link exited. That attempt is not marked PASS and does not establish a new defect.

[Summary](summary.json) · [6 focus DOM records](tournament-wizard-after-proof.json) · [Native date prerequisite](tournament-wizard-native-date-proof.json) · [Blank reentry](tournament-wizard-discard-proof.json) · [Final list state](tournament-wizard-final-state.json) · [Provenance](provenance.json) · [Verification](verification.json) · [Manifest](manifest.json)

This is bounded stage3 coverage. No final creation, complete wizard flow, server persistence, financial fields or physical-device behavior is validated. Tablet CSS789 has raster788.
