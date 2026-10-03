# Direct friendly-detail default Back: new observation

Issue [#1568](https://github.com/kim-song-jun/matchup-sports-platform/issues/1568), scoped to direct detail entry without a `from` query. One new desktop execution at **1180×757 CSS px, DPR1** records a queryless synthetic friendly detail at **2026-10-03T13:23:41.601Z**, followed by the queryless `/team-matches` list at **13:24:08.560Z**. The source DOM contains one rendered Back link to that exact destination and one hidden responsive counterpart.

The collector clicked the rendered in-app Back link. Its CUA call bounds are **13:23:41.605–13:23:41.694Z**; these are tool-call bounds, not an independent browser click-event log. The two DOM endpoints and action report are separate evidence. No server-write action was performed according to the collector.

- [DOM proof](proof.json)
- [Scope and limitations](summary.json)
- [Input hashes and privacy projection](provenance.json)
- [Independent checks](verification.json)
- [Public file hashes](manifest.json)

This is DOM-only evidence: **2 endpoint records, 1 Back action, 0 screenshots**. It does not prove card-count retention, pagination, scroll/focus restoration, browser Back, or another viewport. The prior unpublished observation files were lost; this new execution does not reconstruct them or replace their timestamps. It is distinct from earlier 789px and1183px observations. Runtime serving SHA is unknown. This narrow check is not a whole-issue or whole-app PASS.

The exact source fixture title and opaque URL are omitted; their hashes retain source traceability. No application code is included.
