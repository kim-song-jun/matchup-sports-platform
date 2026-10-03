# League-only search, ordering, and detail-return evidence

Read-only alpha QA during **2026-10-03, 03:46:31–03:51:12.372 UTC** at CSS405×606, CSS789×505, and CSS1183×758.

## Observed behavior

- League-only filter plus the search **리그** loads 20 → 35 unique cards in default and latest ordering.
- Latest 35-match ID sequence matches across mobile, a repeated tablet search, and responsive desktop continuation.
- Default/latest results contain the same 35 match IDs, with a regular-league label on every returned card.
- Clearing search preserves league-only/latest settings; the unsearched list loads 20 → 40 unique cards.
- A nonmatching search returns 0, and clearing it restores the initial 20 while keeping kind/sort.
- Opening the completed league card routes to its dedicated league fixture URL and preserves the correctly encoded Korean search in the `from` query.

## Additional coverage of loaded-pagination loss

| Return path | Before observation UTC | Before | After observation UTC | After |
|---|---|---|---|---|
| Mobile in-app Back | 03:47:27.372 | 35 | 03:48:16.642 | 20 |
| Desktop browser Back | 03:50:47.358 | 35 | 03:51:12.372 | 20 |

All timestamps above are 2026-10-03 UTC. Search/filter/sort context is retained as applicable, but loaded rows reset from 35 to 20. This extends the [existing pagination evidence](https://github.com/kim-song-jun/matchup-sports-platform/blob/f83dc91ea01123f0fc1472f234eb859189e0211e/docs/qa/2026-10-03-match-sort-pagination/README.md) to filtered league results; it does not establish a separate defect. Scroll-position restoration was not measured in this evidence set.

## Verification and limits

The three ID comparisons were independently recomputed from match-path IDs, excluding the differing `from` query encoding:

1. Latest mobile = repeated latest tablet sequence: true
2. Repeated latest tablet = responsive desktop sequence: true
3. Default/latest 35-ID sets: equal

Both roundtrip records were matched to their exact before/after UTC source snapshots and counts. Desktop 35-card coverage continues the loaded tablet state after resizing; it is not an independent desktop full reload. Search-clear transients settled before assertions. Deadline-sort semantics were not evaluated, and no server writes or fixture mutations were performed.

## Evidence

- [Summary](summary.json)
- [Sanitized DOM/search/card-ID observations](proof.json)
- [Exact roundtrip counts, URLs, and UTC](roundtrip-proof.json)
- [File SHA-256 manifest](manifest.json)

This package publishes DOM/count evidence only; it does not claim screenshot coverage for the league-search combinations. Titles, host/member names, personal photos, phone numbers, birth dates, and secrets are excluded.
