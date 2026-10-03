# Tournament list navigation: new mobile observation

Issue [#1543](https://github.com/kim-song-jun/matchup-sports-platform/issues/1543). This new **404×606 CSS px, DPR1.25** observation covers all-status filtered empty and unfiltered result lists, plus one CTA/browser-Back and one result/browser-Back round trip. It contains **8 DOM records, 6 collector action-call records, and 2 safe screenshots**, observed **2026-10-03T13:26:05.486–13:29:20.775Z**.

The six list observations resolve `tournament-list-heading` to **대회 목록**. The filtered list contains no result hrefs; the collector activates **팀밋 대회 보기**, observes `/events`, and returns to the exact filter URL. After reset, the recorded list contains **20 unique hrefs**. The first result destination matches the first href, and browser Back preserves all20 hrefs in the same order. The `/events` and detail observations are not list-result counts.

[DOM proof](proof.json) · [Action call bounds](actions.json) · [Scope](summary.json) · [Independent checks](verification.json) · [Provenance](provenance.json) · [Manifest](manifest.json)

## Actual safe crops

Empty state and CTA, capture **13:26:05.557–13:26:05.576Z**; linked DOM **13:26:05.552Z**. CTA activation is a later action.

![Empty-state copy and CTA](1543-empty-cta.png)

Synthetic first result card, capture **13:28:14.567–13:28:14.589Z**; linked DOM **13:28:14.564Z**. The reported card-click call begins later at **13:28:25.079Z**.

![Synthetic result card before activation](1543-result-card.png)

The empty-state copy is visible in pixels. The DOM `emptyText` field remains empty because its selector was limited, and does not establish absent copy. The hidden list name is established by DOM linkage, not screenshot pixels. This is not a screen-reader or full accessibility test.

The screenshots are plain crops. Their original-to-crop equality is collector-attested; the publisher independently reviewed safe pixels, crop metadata and hashes without reading originals. Original local inputs are retained. Opaque URL values are projected to hashes in the public proof.

These are new observations, distinct from lost earlier unpublished files and old viewport sizes. Runtime serving SHA is unknown. No server-write action was performed according to the collector; no network/persistence audit is asserted. Other widths/statuses, scroll/focus restoration and whole-issue closure are outside this narrow record.
