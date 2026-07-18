# 100 Admin Notices and Popups

## Scope

- Backend: apps/v1_api
- Frontend: apps/v1_web
- DB: independent V1Notice and V1Popup models
- Docs/QA: admin/global-popup API contracts and real browser CRUD evidence

## Requirements

- Notices and popups must have independent persistence, admin APIs, frontend query keys, mutations, and admin surfaces.
- /admin/notices manages ordinary 안내 | 업데이트 notices only.
- /admin/popups manages popup title/body/status/display window, target screens, and optional CTA link only and must not call /admin/notices.
- Popup states are published(공개), archived(비공개), and draft(초안).
- A display end must be later than its display start.
- Popups can target one or more supported v1 user screens; existing rows default to home.
- Popup CTA links accept only root-relative internal paths or HTTPS URLs.
- GET /popups/active returns the newest popup for a requested supported screen.
- Home returns the home-targeted popup separately from notices for backward compatibility.
- Active popup selection uses only v1_popups rows that are published + public, target the requested screen, and are inside the active display window.
- Seven-day suppression is popup-ID-specific and does not hide another popup.
- Existing category=고정 notice rows are moved to v1_popups by migration and then removed from v1_notices.
- Existing notice display-window columns remain temporarily for expand/migrate compatibility so local prisma db push does not require destructive column drops; runtime notice code does not read or write them.

## API Contract

### Notices

- GET /api/v1/admin/notices
  - filters: status, category(안내|업데이트), audience, q, cursor, limit
- GET /api/v1/admin/notices/:noticeId
- POST /api/v1/admin/notices
- PATCH /api/v1/admin/notices/:noticeId
  - body: { audience, category, title, body, status }
- DELETE /api/v1/admin/notices/:noticeId
  - owner/ops only; writes notice.delete

### Popups

- GET /api/v1/admin/popups
  - filters: status, q, cursor, limit
- GET /api/v1/admin/popups/:popupId
- POST /api/v1/admin/popups
- PATCH /api/v1/admin/popups/:popupId
  - body: { audience, title, body, status, targetScreens[], linkUrl?, linkLabel?, displayStartAt?, displayEndAt? }
- DELETE /api/v1/admin/popups/:popupId
  - owner/ops only; writes popup.delete

### Active Popup

- GET /api/v1/popups/active?screen={supported-screen}
  - popup: newest active popup targeting the requested screen, or null
  - invalid screen values return 400

### Home

- GET /api/v1/home
  - popup: active popup or null
  - notices: recent published public notices
  - a notice row never becomes the popup implicitly

## Acceptance Criteria

- Given an admin creates a notice, when the mutation completes, then only v1_notices changes.
- Given an admin creates a popup, when the mutation completes, then only v1_popups changes.
- Given an active popup and recent notices, when home is queried, then popup and notices are returned independently.
- Given a popup outside its display window or not published, when home is queried, then popup is null or another eligible popup is selected.
- Given a popup targets matches and teams, when either screen is opened, then the same popup is eligible; when marketplace is opened, it is not.
- Given a popup CTA uses an internal path or HTTPS URL, when the CTA is selected, then navigation occurs; unsafe URL schemes are rejected.
- Given an admin edits a popup, when target screens are changed, then at least one supported screen remains selected.
- Given a user hides one popup for seven days, when a different popup becomes active, then the new popup remains visible.
- Given existing fixed notice data, when the split migration runs, then content and IDs are preserved in v1_popups and no fixed row remains in v1_notices.
- Given local prisma db push, when the new schema is applied, then it completes without accepting destructive notice-column loss.
- Mobile, tablet, and desktop admin/home popup scenarios have no console, page, network, center, or horizontal-overflow failures.

## Progress Snapshot

- 2026-07-07 to 2026-07-14: Initial notice administration and a category=고정-backed home popup were implemented.
- 2026-07-14: Reclassified the shared notice/popup model as incorrect coupling.
- 2026-07-14: Added independent V1Popup persistence, migration, /admin/popups CRUD, popup-specific audit actions, frontend hooks/types/MSW, and separate home popup response.
- 2026-07-14: Removed pinned/fixed controls from the notice DTO and admin notice UI. Notice categories are now 안내 | 업데이트.
- 2026-07-14: Migration moves existing fixed notice rows to v1_popups before deleting those rows from v1_notices.
- 2026-07-14: Prisma generate and non-destructive local db push passed. API/Web TypeScript passed. Focused backend tests passed 34/34 and frontend tests passed 5/5.
- 2026-07-14: Real browser CRUD, schedule visibility, cleanup, and mobile/tablet/desktop admin/home QA passed with 0 console/page/network/issues. Evidence: output/playwright/visual-audit/popup-crud-2026-07-14T08-07-55-438Z/.
- 2026-07-18: Extended popup persistence and admin CRUD with supported target-screen multi-select plus optional root-relative/HTTPS CTA links. Existing popup rows remain home-targeted by the DB default.
- 2026-07-18: Added the global active-popup route resolver and `GET /api/v1/popups/active?screen=...`; kept the home response popup for backward compatibility without duplicate rendering.
- 2026-07-18: Prisma generate, API focused tests (38/38), API build, Web focused tests (10/10), Web TypeScript, and production build passed.
- 2026-07-18: Real browser CRUD, target/non-target routing, CTA, schedule visibility, cleanup, and mobile/tablet/desktop layout QA passed with 0 console/page/network/issues. Evidence: `output/playwright/visual-audit/popup-targeting-2026-07-18/`.
- 2026-07-18: Rebased the pending change set onto current `origin/main` via the dedicated `feature/v1-popup-targeting-upload-recovery` branch. Full API unit (516/516), full Web unit (118/118), API build, Web TypeScript, Web production build (74/74 routes), Compose render, shell syntax, and diff checks passed.
- 2026-07-18: The canonical API integration command currently has zero matching integration specs and exits with `No tests found`; no pass-with-no-tests fallback was added.
