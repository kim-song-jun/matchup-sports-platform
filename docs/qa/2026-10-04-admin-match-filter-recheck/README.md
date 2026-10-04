# #1520 — Admin match search and status filters

The recorded scenarios pass at mobile 402×606, tablet 788×505 and desktop 1182×757 CSS viewports. No new defect was found in this scope. The packet contains 19 DOM observations, 35 action records and six privacy-safe exact PNG crops.

## Observed results

- Search `1.0.3` with the `completed` status filter returned one synthetic lifecycle row at each width. Opening that row reached the same synthetic detail URL. Browser Back retained the query, selected filter and one lifecycle row.
- Rapid actions `1.0` → cancelled status **filter** → `1.0.3` completed in 132 ms (mobile), 144 ms (tablet) and 124 ms (desktop), each below the source's 300 ms debounce. The settled endpoint retained `q=1.0.3&status=cancelled` with one synthetic edited row and zero lifecycle rows. This measures the recorded actions and final UI, not network request counts or exact debounce execution.
- `QA1520-no-result-1004` with the cancelled filter returned zero visible rows and the exact message “조건에 맞는 매치가 없어요” at all three widths. The screenshot also shows the helper text “검색어나 상태 필터를 변경해 보세요.”
- `1.0.3` / completed was restored after each empty check. The final baseline was blank query / all statuses, count 29, 20 visible rows and zero dialogs. Final DOM: 2026-10-04T08:55:52.473Z; separate exit check: 2026-10-04T08:55:52.491Z.

## Evidence map

| Width | Filtered | Detail | Browser Back | Rapid final | Empty | Restored | PNG crops |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Mobile | 0 | 1 | 2 | 3 | 4 | 5 | [filter](mobile-filter-top.png), [empty](mobile-empty-panel.png) |
| Tablet | 6 | 7 | 8 | 9 | 10 | 11 | [filter](tablet-filter-top.png), [empty](tablet-empty-panel.png) |
| Desktop | 12 | 13 | 14 | 15 | 16 | 17 | [filter](desktop-filter-top.png), [empty](desktop-empty-panel.png) |

Indices refer to [proof.json](proof.json); final baseline is index 18. [summary.json](summary.json) gives structured assertions. [actions.json](actions.json) and [exit.json](exit.json) preserve their source bytes.

## Timing and deployment context

The first recorded navigation began at **2026-10-04T08:50:40.070Z** and ended at 08:50:45.423Z. Reported deployment context is commit `4c81d071ede5bba14575f2aeb1097326797cbd08`, version `1.1.5-alpha.20261004.g4c81d071ede5`, successful run 37188018237 at 08:22:48Z, with health reported at 08:22:31.618Z. The served browser runtime commit was not identified. The navigation occurred later, but wall-clock ordering alone is not runtime identity evidence.

DOM timestamps and screenshot-call start/end timestamps are distinct in [crop-provenance.json](crop-provenance.json). No screenshot is represented as simultaneous with its preceding DOM read.

## Read boundary and limits

Recorded actions use search, status **filters**, synthetic-detail navigation and browser Back. No record status-change control, moderation modal, save or business mutation action was exercised. [source-boundary-1520.json](source-boundary-1520.json) contains the relevant existing static source inspection: list/detail use GET read paths; moderation status changes are a separate POST path. Existing test source was inspected, not executed for this packet.

This is not a network audit and does not establish zero POSTs or global absence of writes. Shared API-error reporting can POST `/api/v1/logs/client-error`. No deliberate API failure was induced.

`visibleRowCount` counts rows with positive bounding-rectangle width and height, excluding hidden duplicate responsive layouts; it does not mean viewport intersection. `allVisibleRowsMatchQuery=true` for empty states is a vacuous `every()` result, not proof of a nonempty match. `pagination=[]` for one-row/empty states simply records no page bar, not a defect. Pagination navigation was not tested.

Browser Back verifies query, status-filter and result restoration. Mobile return scrollY was 26.399999618530273 and tablet 94 after clicking their cards; **exact scroll restoration is not established**. Screenshots intentionally show only filter controls and empty panels; row/detail assertions come from the DOM evidence. These checks do not claim full-issue coverage.

## Privacy, integrity and reproduction

Only exact rectangular filter/empty-panel crops are included. All six were visually inspected. The originals have JPEG bytes despite their `.png` names; the delivered images are true PNGs, pixel-identical to their decoded source rectangles, with no resizing or retouching. No host names, account/sidebar content or original full screenshots are included. The opaque detail URL is replaced with a route template and stable SHA-256, preserving cross-width equality without exposing its identifier.

[provenance.json](provenance.json) describes transformations. [source-hashes.json](source-hashes.json) records source JSON/image hashes; all source bytes were verified unchanged. [crop-provenance.json](crop-provenance.json) records exact rectangles, source/output formats and sizes, separate capture/DOM times, and exact decoded-pixel equality. The relevant static source excerpt excludes unrelated scenarios.

[manifest.json](manifest.json) lists payload files and hashes. [SHA256SUMS](SHA256SUMS) covers every packet file except itself. From this directory, verify with `sha256sum -c SHA256SUMS`.
