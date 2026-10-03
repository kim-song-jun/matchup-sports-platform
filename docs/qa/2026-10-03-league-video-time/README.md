# League fixture time labels differ in video management

Real read-only alpha QA on **2026-10-03, 05:29:09.276–05:30:25.842 UTC**, using an existing synthetic league and two existing fixtures.

## Observed inconsistency

| Fixture identity shown in UI | Administrator detail | Match video management |
|---|---|---|
| Week1, 송파 유나이티드 vs 한강 로버스 | 9.17. (목) **18:00** | 2026.9.17 **02:00** |
| Week2, 한강 로버스 vs 송파 유나이티드 | 9.24. (목) **18:30** | 2026.9.24 **02:30** |

The same discrepancy appears at CSS **405×606,789×505,1183×758**. Returning through the actual **리그 상세로** link restores the original detail labels,18:00/18:30, at each width.

**Neither canonical time nor root cause is established.** This report does not infer the source timestamp, database value, timezone conversion error, or which screen needs correction.

## Reproduction

1. Open the [existing league administrator detail](https://alpha.teameet.co.kr/admin/league-matches/525bd67a-e54b-41ad-a9bb-31415b882ced).
2. Note the two fixture dates/times and follow the actual **경기 영상 관리** link.
3. Compare the same league, week and opposing-team labels on the [video-management page](https://alpha.teameet.co.kr/admin/league-matches/525bd67a-e54b-41ad-a9bb-31415b882ced/videos).
4. Follow **리그 상세로** and verify the original detail labels remain.
5. Repeat at all three CSS viewport widths.

Expected: matching fixture schedule labels should be consistent across the two administrator surfaces, or clearly explain a different timezone/context.

## Screenshots

| CSS viewport | Detail | Videos |
|---|---|---|
| 405×606 | [18:00 /18:30](mobile-detail-dates.png) | [02:00 /02:30](mobile-videos-dates.png) |
| 789×505 | [18:00 /18:30](tablet-detail-dates.png) | [02:00 /02:30](tablet-videos-dates.png) |
| 1183×758 | [18:00 /18:30](desktop-detail-dates.png) | [02:00 /02:30](desktop-videos-dates.png) |

## Evidence and verification

- [Summary](summary.json)
- [Nine DOM observations with exact UTC and rendered links](proof.json)
- [Independent comparison checks](verification.json)
- [Screenshot UTC bounds, crops, raster sizes and hashes](screenshot-provenance.json)
- [Final clean UI state](final-state.json)
- [File SHA-256 manifest](manifest.json)

Actual denominator:9 DOM observations =3 widths×detail→videos→detail. Each roundtrip compares2 fixture labels; all6 cross-screen comparisons differ and all3 returns retain the original detail times. Six inspected PNGs accompany the observations.

Detail links expose fixture UUIDs69017adb-98a1-4740-b9f9-9b8c83f36b1e and e9235b90-c119-4e6b-8227-6aff827099e4. Video cards do not expose fixture UUID links, so their cross-screen identity is matched by league, week and team-pair labels. No hidden app data or API was read to establish identity.

All9 observations have0 main input fields and document scrollWidth equal to measured CSS width. This does not certify all layout or app behavior. The tablet source raster is788px wide while CSS width is789; desktop images exclude the account sidebar. Screenshot start/end UTC bounds are separate from DOM observation timestamps.

There were0 registered videos in the observed UI, and no video Add, upload, save, edit, playback, console or result action was activated. No source/DB/timezone cause or deployment SHA was independently established in the browser. This is resized/zoomed Chromium, not physical-device or screen-reader testing. Only synthetic fixture/team labels appear; personal identities, roster data, financial fields and credentials are excluded.
