# Report reason facets: new mobile comparisons

Issue [#1483](https://github.com/kim-song-jun/matchup-sports-platform/issues/1483), limited to report-reason counts while keeping other filters fixed. This new **404×606 CSS px, DPR1.25** cohort contains **7 DOM observations, 10 collector action-call records and 0 screenshots**.

- Received status, no search: **4→2 rendered cards** after selecting spam; **전체 사유4→4** remains the same denominator
- Search `QA`: **0→0 cards**, **전체 사유0→0**. This is a zero-result comparison
- Generic synthetic-title phrase `팀 컨택 신고`: **3→2 cards**, **전체 사유3→3**. A separately recorded source observation found the phrase in3 visible titles without retaining the titles themselves

For each pair, only `reportReason=spam` changes in the URL. The reason-option labels remain identical, the spam option count matches the selected results, and the report-category/status counts match the rendered-card counts. This supports preserving the denominator when applying the reason facet in these three cases.

[DOM proof](proof.json) · [Action call bounds](actions.json) · [Safe search-source observation](search-source.json) · [Scope](summary.json) · [Independent checks](verification.json) · [Input hashes](provenance.json) · [Manifest](manifest.json)

DOM observations span **2026-10-03T13:37:57.992–13:40:46.346Z**. Action-call bounds span **13:37:29.136–13:39:46.021Z**. The positive search-source observation is **13:39:23.159Z**. The final report-only DOM records empty search, all reasons, and4 rendered cards; the separate [exit](exit.json) records `/tournaments` at **13:40:47.118Z**. These are distinct records and time windows.

The four-record case has named reason options totaling3 and an all-reasons count of4. The source records one generic 신고 category row, but underlying null reason values or database content were not inspected. That distinction is preserved.

This is DOM-only evidence. Rendered-card counts do not prove every card is within the viewport. Tool-call bounds are not independent browser-event timestamps. No reply or processing-status submission was performed according to the collector; network methods and persistence were not audited. Raw inquiry titles, bodies, people and contact details are excluded. Runtime serving SHA is unknown.

The earlier unpublished tablet combinations and three-width general-total files were lost. This new mobile set does not reconstruct those records or change their timestamps. Team-ranking period copy, other widths, server tests and complete issue closure are outside this evidence.
