# 100 Admin Notices

## Scope

- Backend: `apps/v1_api`
- Frontend: `apps/v1_web`
- DB: existing `V1Notice`; no migration planned

## Requirements

- Add an admin sidebar menu item for service notices.
- Add an admin notices page that can list current notices and create a new notice.
- Admin list must show status, category, audience, published date, body summary, and pinned state.
- Admin create must support title, body, audience, status, and pinned state.
- Admin notices must be editable from the admin notices page.
- Add a dedicated `팝업` item to the admin sidebar and a `/admin/popups` surface.
- Popup management must support complete list, detail, create, update, and delete operations against real admin notice APIs.
- Home popup must be centered in the viewport at mobile, tablet, and desktop widths.
- Pinned notices use the existing v1 contract: `category === '고정'`.
- Public `/notices` must still expose only `published + public` notices.
- Home entry shows the latest published public pinned notice as an accessible popup.
- A user can suppress the same notice for seven days without suppressing a newly pinned notice.

## API Contract

- `GET /api/v1/admin/notices`
  - filters: `status`, `category`, `audience`, `q`, `cursor`, `limit`
  - returns cursor page of notice rows
- `POST /api/v1/admin/notices`
  - creates draft or published notice
  - maps `pinned: true` to `category: '고정'`
  - maps `pinned: false` to submitted non-fixed category
- `PATCH /api/v1/admin/notices/:noticeId`
  - updates title, body, audience, pinned/category, and draft/published status
  - maps `pinned` with the same category contract as create
  - returns the updated notice row
- `GET /api/v1/admin/notices/:noticeId`
  - returns the complete notice row to an active admin
- `DELETE /api/v1/admin/notices/:noticeId`
  - owner/ops only; writes a `notice.delete` admin action log and deletes the notice

## Acceptance Criteria

- Given an active admin, when opening `/admin/notices`, then the admin can see notices including drafts and archived notices.
- Given an active admin, when creating a notice with pinned enabled, then the created notice is stored as category `고정` and appears as pinned.
- Given an active admin, when selecting a notice for edit and saving changes, then the notice row is updated and subsequent public visibility follows its saved status/audience.
- Given a public user, when opening `/notices`, then draft and archived notices are not exposed.
- Given a non-admin user, admin notice APIs are denied.
- Given a home response with a pinned notice, when entering `/home`, then its real title/body are shown in a popup with a detail link.
- Given a user selects `일주일 안 보기`, when revisiting `/home` before seven days pass, then that notice stays hidden.
- Given an active admin, when opening `/admin/popups`, then only pinned popup notices are listed and their complete detail can be queried.
- Given an owner/ops admin, when creating, editing, or deleting a popup, then the real notice row changes and the home popup follows the latest published state.
- Given any supported viewport, when the home popup opens, then the dialog is centered horizontally and vertically.

## Progress Snapshot

- 2026-07-07: Task created. Implementation pending.
- 2026-07-07: Added `GET/POST /api/v1/admin/notices`, admin sidebar entry, `/admin/notices` list/create page, pinned mapping via `category === '고정'`, frontend hooks/MSW/types, API docs, and focused backend/frontend tests.
- 2026-07-09: Added admin notice edit flow with `PATCH /api/v1/admin/notices/:noticeId`, admin action log, frontend edit mode, hook/types/MSW sync, and focused tests.
- 2026-07-13: Added a `/home` pinned-notice popup with notice-specific seven-day suppression, accessible dialog behavior, and a direct notice-detail action. Focused tests (5/5), TypeScript, and v1 pattern checks pass. Browser screenshots and Next build are runtime-blocked because the available Node.js is 18.19.1 while Next requires >=20.9.0 (the package contract requires Node >=22).
- 2026-07-13: Added a reusable isolated Node 22 QA stack (`deploy/docker-compose.v1-qa.yml`) and `qa:v1:*` commands. `qa:v1:home-notice` captures mobile/tablet/desktop popup-open and popup-hidden screenshots and gates console, page, network, overflow, touch target, and seven-day reload behavior.
- 2026-07-13: Final browser QA PASS at `390x844`, `768x1024`, and `1440x900` with real demo API data. Console errors 0, page errors 0, actionable network errors 0, overflow 0, and seven-day suppression/reload PASS. Evidence: `output/playwright/visual-audit/home-notice-popup-20260713-final/`.
- 2026-07-13: Centered the home popup at every viewport and added the admin `팝업` sidebar entry plus `/admin/popups` list/detail/create/update/delete UI. Added active-admin detail and owner/ops delete APIs with `notice.delete` audit logging; no Prisma migration was required because `V1Notice(category='고정')` remains the single source.
- 2026-07-13: Node 22 production build and real DB browser CRUD PASS. Admin and home routes passed at `390x844`, `768x1024`, and `1440x900`; console/page/network errors were all 0, center delta/overflow checks passed, and QA-created data was deleted. Evidence: `output/playwright/visual-audit/popup-crud-2026-07-13T15-09-31-711Z/`.
- 2026-07-13: Seven-day suppression regression plus strict horizontal/vertical center checks PASS at all three viewports. Evidence: `output/playwright/visual-audit/home-notice-popup-2026-07-13T15-09-57-578Z/`.
- 2026-07-14: Reordered the popup hierarchy to title/close, date, body, and two-column actions. Tightened the title/date spacing and visually aligned the close icon with the title while preserving its touch target.
