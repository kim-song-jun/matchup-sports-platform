# Filtered league pagination and query changes after deployment

Issue1568 / PR1570 follow-up: **two tested Back branches preserve35→35 and every stored href in its original order**. These are mobile default in-app Back and desktop latest browser Back. This package does not claim six filtered Back combinations.

Latest-sort full lists have the same35 pathname identities in the same order across405/789/1183 CSS widths. Default and latest have the same identity set but different order. Cross-sort/width identity comparison intentionally ignores from-query formatting; each individual Back check compares complete stored href strings.

## Query changes

- Clearing the search keeps competition kind and latest sort; loading More reaches40 unique rows
- A nonmatching query reaches0 rows and an empty state
- Clearing it, once settled, restores the initial20 with More enabled. Transitional record8 retains the old query URL and remains explicitly excluded

The clicked list row uses a team-match route while the observed destination uses a league-fixture route. The fixture UUID matches exactly one list row; full route strings are not called equal.

## Actual safe header crops

- [filtered-league-mobile-default-return](filtered-league-mobile-default-return.png)
- [filtered-league-mobile-latest](filtered-league-mobile-latest.png)
- [filtered-league-tablet-latest](filtered-league-tablet-latest.png)
- [filtered-league-desktop-latest](filtered-league-desktop-latest.png)
- [filtered-league-desktop-browser-return](filtered-league-desktop-browser-return.png)

Headers show search/type/count UI only. Full sequences, competition filter identity and league-card labels come from stored DOM, not these images. scrollY and focus restoration were not measured.

## Timing and provenance

DOM09:27:35.124–09:32:11.831UTC follows [Deploy Alpha2357307](https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/37105569761), success updated07:30:13UTC. ServingSHA is unknown; this is not later deployment coverage. Tablet CSS789 uses source raster788.

The two historical capture-metadata hashes describe different snapshots of an appendable collection; their exact snapshot times were not recorded. Per-image SHA256 and capture bounds remain unchanged. Publisher checks safe-only PNGs; original pixel equality is attributed to the collector.

[Summary](summary.json) · [16 DOM records, one excluded](filtered-league-proof.json) · [Two returns](filtered-league-returns.json) · [Original comparisons](filtered-league-comparisons.json) · [Capture provenance](filtered-league-provenance.json) · [Recomputed sequences](verification.json) · [Manifest](manifest.json)

[Earlier filtered35→20 evidence](https://github.com/kim-song-jun/matchup-sports-platform/blob/8a460f9c03fbd5b5d9ecb13a96c4bc9163bcc296/docs/qa/2026-10-03-league-search-combination/README.md) is a separate observation. No app code, product-state change or new browser replay is part of this publication.
