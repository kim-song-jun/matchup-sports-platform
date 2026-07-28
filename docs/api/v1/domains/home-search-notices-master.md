# Home, Search, Notices, Popup, and Master Data

| Method | Path | Auth | Query / Body | Response |
|---|---|---|---|---|
| GET | /api/v1/health | public | none | runtime health |
| GET | /api/v1/master/sports | public | none | sports and levels |
| GET | /api/v1/master/regions | public | none | region tree/list |
| GET | /api/v1/home | optional user | sportId?, regionId? | aggregate with independent popup and notices |
| GET | /api/v1/home/recommendations | optional user | sportId?, regionId?, limit? max 20 | recommendation list |
| GET | /api/v1/popups/active | public | screen (supported target screen) | { popup: active popup or null } |
| GET | /api/v1/notices | public | service-defined list filters | published notice list |
| GET | /api/v1/notices/:noticeId | visibility-dependent | path id | notice detail |
| GET | /api/v1/admin/notices | active admin | status?, category?, audience?, q?, cursor?, limit? | notice cursor page |
| POST | /api/v1/admin/content-assets | owner/ops | multipart file (JPEG/PNG/WebP, max 5MB) | temporary managed asset |
| DELETE | /api/v1/admin/content-assets/:assetId | owner/ops | temporary asset id | { assetId, deleted: true } |
| POST | /api/v1/admin/notices | owner/ops | { audience, category, title, content, status } | created notice with content + derived body |
| PATCH | /api/v1/admin/notices/:noticeId | owner/ops | same notice payload | updated notice |
| DELETE | /api/v1/admin/notices/:noticeId | owner/ops | path id | { noticeId, deleted: true } |
| GET | /api/v1/admin/popups | active admin | status?, q?, cursor?, limit? | popup cursor page |
| GET | /api/v1/admin/popups/:popupId | active admin | path id | popup detail |
| POST | /api/v1/admin/popups | owner/ops | { audience, title, content, status, targetScreens[], linkUrl?, linkLabel?, displayStartAt?, displayEndAt? } | created popup with content + derived body |
| PATCH | /api/v1/admin/popups/:popupId | owner/ops | same popup payload | updated popup |
| DELETE | /api/v1/admin/popups/:popupId | owner/ops | path id | { popupId, deleted: true } |

## Contract Notes

- v1_notices and v1_popups are independent content sources.
- Notice and popup content is canonical Tiptap JSON. body is a server-derived plain-text projection retained for search, summaries, and legacy rows.
- Allowed content is paragraphs, level 2-3 headings, bullet/ordered lists, blockquotes, horizontal rules, hard breaks, left/center/right alignment, bold/italic/underline/strike, safe links, and managed images.
- Tiptap may serialize an unaligned paragraph or heading with textAlign=null; the API treats that as the default alignment and removes the attribute before persistence. Other alignment values remain invalid.
- Tiptap Image 3.28 may serialize title, width, and height as null. These default transport attributes are removed before persistence; non-null dimensions and unknown image attributes remain invalid.
- Empty paragraph/heading nodes may omit content and are normalized to an empty array. Tiptap Link's default target/rel/class/title transport attrs are removed, while custom link presentation attrs remain invalid.
- Raw HTML, unknown nodes or attributes, unsafe links, base64/external images, missing image alt text, and content over the server limits return 400 INVALID_RICH_CONTENT.
- Managed images must reference a temporary asset uploaded by the same admin. Saving claims it for one notice or popup; removing the reference deletes the unreferenced asset record and file.
- An explicit editor cancel/switch deletes temporary assets uploaded in that editor session. If the browser or tab terminates before cleanup, the API removes still-unattached temporary assets after 24 hours via a startup and hourly sweep.
- Stale cleanup atomically verifies temporary status, age, and the absence of notice/popup ownership before deleting a record and its stored file; a concurrently claimed asset is not removed.
- Notice categories accepted by admin mutation DTOs are 안내 | 업데이트; pinned is not a notice field.
- Popup status labels are UI-only mappings: published=공개, archived=비공개, draft=초안.
- Popup display end must be later than display start. Invalid ranges return 400 INVALID_DISPLAY_WINDOW.
- Popup target screens are home, matches, team_matches, teams, tournaments, lessons, marketplace, mercenary, venues, community, chat, notifications, profile, and my. At least one is required.
- Popup links must be a root-relative internal path or HTTPS URL. A label without a URL and unsafe schemes return 400 INVALID_POPUP_LINK.
- Active popup lookup selects the newest published + public popup targeting the requested screen whose optional start is at/before now and whose optional end is after now.
- Home popup uses the same lookup with screen=home for backward compatibility.
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
- v1_content_assets
- v1_matches
- v1_teams
- v1_team_matches
- v1_notifications
