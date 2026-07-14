# Home, Search, Notices, Popup, and Master Data

| Method | Path | Auth | Query / Body | Response |
|---|---|---|---|---|
| GET | /api/v1/health | public | none | runtime health |
| GET | /api/v1/master/sports | public | none | sports and levels |
| GET | /api/v1/master/regions | public | none | region tree/list |
| GET | /api/v1/home | optional user | sportId?, regionId? | aggregate with independent popup and notices |
| GET | /api/v1/home/recommendations | optional user | sportId?, regionId?, limit? max 20 | recommendation list |
| GET | /api/v1/notices | public | service-defined list filters | published notice list |
| GET | /api/v1/notices/:noticeId | visibility-dependent | path id | notice detail |
| GET | /api/v1/admin/notices | active admin | status?, category?, audience?, q?, cursor?, limit? | notice cursor page |
| POST | /api/v1/admin/notices | owner/ops | { audience, category, title, body, status } | created notice |
| PATCH | /api/v1/admin/notices/:noticeId | owner/ops | same notice payload | updated notice |
| DELETE | /api/v1/admin/notices/:noticeId | owner/ops | path id | { noticeId, deleted: true } |
| GET | /api/v1/admin/popups | active admin | status?, q?, cursor?, limit? | popup cursor page |
| GET | /api/v1/admin/popups/:popupId | active admin | path id | popup detail |
| POST | /api/v1/admin/popups | owner/ops | { audience, title, body, status, displayStartAt?, displayEndAt? } | created popup |
| PATCH | /api/v1/admin/popups/:popupId | owner/ops | same popup payload | updated popup |
| DELETE | /api/v1/admin/popups/:popupId | owner/ops | path id | { popupId, deleted: true } |

## Contract Notes

- v1_notices and v1_popups are independent content sources.
- Notice categories accepted by admin mutation DTOs are 안내 | 업데이트; pinned is not a notice field.
- Popup status labels are UI-only mappings: published=공개, archived=비공개, draft=초안.
- Popup display end must be later than display start. Invalid ranges return 400 INVALID_DISPLAY_WINDOW.
- Home popup selects the newest published + public popup whose optional start is at/before now and whose optional end is after now.
- Home notices contains recent published + public notices and does not supply popup content.
- Popup deletion writes popup.delete; notice deletion writes notice.delete.
- The split migration copies existing category=고정 notice rows to v1_popups with IDs and display windows, then removes them from v1_notices.
- Master data is read-only in v1 user APIs.

## Pending From Frozen Contract

- GET /api/v1/search is frozen as unified search, but no controller exists yet. Current search scaffolds must call domain lists directly or stay mocked until implemented.

## Primary Tables

- v1_sports
- v1_sport_levels
- v1_regions
- v1_notices
- v1_popups
- v1_matches
- v1_teams
- v1_team_matches
- v1_notifications