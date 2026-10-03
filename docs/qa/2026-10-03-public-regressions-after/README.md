# Public-route regressions after deployment

Bounded observations for PR1536, PR1548 and PR1550 on 2026-10-03.

- **PR1536:** Upcoming-only schedule state survives awards → browser Back and awards → in-app Back at405/789/1183 CSS widths (6 returns). Forward reaches the same awards URL. Upcoming remains selected, All unselected, with the correct empty state. Desktop All reset restores one fixture URL. Query ordering may differ while semantics agree.
- **PR1548:** Eight accepted resolved-name observations link the region to neutral **대회 목록**. Mobile covers in-progress/draft/completed and league draft/completed; tablet/desktop cover completed swimming+male. Two transitional records remain explicitly excluded. Initial all-status row records only the label reference; the separate tool-only AX claim is not counted as independently reproduced.
- **PR1550:** Three widths show **개인 매치**, zero recorded main matches and Busan selected on reopening the filter. Tablet/desktop observations follow reload. Desktop reset clears the region and records8 main matches; this number is a DOM count, not an independently enumerated URL list.

## Safe screenshots

- [league-filter-mobile-after](league-filter-mobile-after.png)
- [league-filter-mobile-controls-after](league-filter-mobile-controls-after.png)
- [league-filter-tablet-after](league-filter-tablet-after.png)
- [league-filter-desktop-after](league-filter-desktop-after.png)
- [tournament-label-mobile-completed](tournament-label-mobile-completed.png)
- [tournament-label-tablet-completed](tournament-label-tablet-completed.png)
- [tournament-label-desktop-completed](tournament-label-desktop-completed.png)
- [individual-region-mobile-result](individual-region-mobile-result.png)
- [individual-region-mobile-filter](individual-region-mobile-filter.png)
- [individual-region-tablet-result](individual-region-tablet-result.png)
- [individual-region-tablet-filter](individual-region-tablet-filter.png)
- [individual-region-desktop-result](individual-region-desktop-result.png)
- [individual-region-desktop-filter](individual-region-desktop-filter.png)

All13 PNGs contain only product controls, neutral headings, public region choices, counts and empty states. DOM proves accessible relationships; an image alone cannot establish them. Mobile schedule controls and empty-state crops are separate scroll states; controls capture starts31.927seconds after the linked DOM.

## Timing and limits

Observation09:11:15.195–09:20:34.827UTC follows [Deploy Alpha2357307](https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/37105569761), success updated07:30:13UTC. Serving SHA is not independently exposed. These observations are not attributed to later06d72/e0ac/8167 deployments. Tablet CSS width789 has source raster788; no resizing or physical-device testing.

The public routes were opened in an admin-authorized session. Captain-role My-leagues entry, schedule search q (no input in this fixture), geographic data, screen-reader speech and whole-app behavior were not retested.

[Summary](summary.json) · [Schedule records](league-filter-proof.json) · [Neutral-name records](tournament-label-proof.json) · [Region records](individual-region-proof.json) · [Capture provenance](public-after-crop-provenance.json) · [Verification](verification.json) · [Manifest](manifest.json)

Publication contains evidence only and no product-state changes.
