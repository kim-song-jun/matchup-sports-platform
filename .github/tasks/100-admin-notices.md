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
- Notice and popup bodies support managed rich content authored with a Flowbite-inspired Tiptap editor.
- Tiptap JSON is the canonical rich-content representation. The existing body column remains a server-derived plain-text projection for search, summaries, and legacy clients.
- Existing rows with no rich-content document continue to render as authored plain text and are upgraded when edited; the migration must not rewrite or drop legacy body values.
- Supported v1 rich-content nodes are paragraphs, level 2-3 headings, bullet/ordered lists, blockquotes, horizontal rules, hard breaks, text alignment, safe links, and managed images. Raw HTML, scripts, iframes, base64 images, arbitrary style attributes, and unknown nodes/marks are rejected.
- Editor images use admin-only managed assets backed by the existing v1 upload volume. Temporary assets are claimed by a notice or popup when saved, detached assets are deleted only when unreferenced, and abandoned temporary assets have an explicit cleanup path.
- Rich-content links accept only root-relative internal paths or HTTPS URLs. Managed image sources accept only v1 upload URLs and require alt text.
- Admin notice and popup editors provide web and mobile previews rendered by the same user-facing content and popup surface components used at runtime.
- Preview transport is same-origin, admin-protected, non-persistent, and must not publish or mutate content.
- Popup rich content keeps the title and actions reachable while the body scrolls within the viewport on desktop and mobile.

## API Contract

### Notices

- GET /api/v1/admin/notices
  - filters: status, category(안내|업데이트), audience, q, cursor, limit
- GET /api/v1/admin/notices/:noticeId
- POST /api/v1/admin/notices
- PATCH /api/v1/admin/notices/:noticeId
  - body: { audience, category, title, content, status }
  - response includes content plus the server-derived plain body projection
- DELETE /api/v1/admin/notices/:noticeId
  - owner/ops only; writes notice.delete

### Popups

- GET /api/v1/admin/popups
  - filters: status, q, cursor, limit
- GET /api/v1/admin/popups/:popupId
- POST /api/v1/admin/popups
- PATCH /api/v1/admin/popups/:popupId
  - body: { audience, title, content, status, targetScreens[], linkUrl?, linkLabel?, displayStartAt?, displayEndAt? }
  - response includes content plus the server-derived plain body projection
- DELETE /api/v1/admin/popups/:popupId
  - owner/ops only; writes popup.delete

### Active Popup

- GET /api/v1/popups/active?screen={supported-screen}
  - popup: newest active popup targeting the requested screen, or null
  - invalid screen values return 400

### Managed content assets

- POST /api/v1/admin/content-assets
  - owner/ops only; multipart image upload; returns { assetId, url, status: temporary }
- Rich-content notice/popup save validates every referenced asset and claims it for the saved entity.
- Removing an image reference during update removes the now-unreferenced managed file and asset record after the content mutation succeeds.
- The current editor session deletes unreferenced uploads after a successful save and deletes all of its temporary uploads on an explicit cancel or editor switch.
- The API scans hourly for temporary assets older than 24 hours, including an immediate scan on startup, and deletes each file only after an atomic still-temporary/unattached record claim succeeds.

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
- Given an existing plain-text notice or popup, when it is viewed before rich-content editing, then its authored line breaks remain visible without migration loss.
- Given an editor document with unsupported nodes, unsafe links, base64 images, external image URLs, missing image alt text, or excessive content limits, when it is submitted, then the API rejects it with an explicit 400 and persists nothing.
- Given a managed image is uploaded and then saved in a notice or popup, when the entity is queried, then the image renders from the v1 upload origin in both the real screen and both previews.
- Given an image is removed from an edited document, when no content references it, then its managed asset and file are removed without affecting shared or unrelated images.
- Given an image was uploaded in the current editor session but the editor is cancelled or switched, when cleanup runs, then that session's temporary assets are deleted; browser/tab termination is recovered by the server's 24-hour stale cleanup.
- Given unsaved editor content, when web or mobile preview is selected, then the protected preview shows the same notice detail or popup surface component without creating or updating a DB row.
- Given rich popup content exceeds the available viewport, when it is shown on mobile or desktop, then only the content body scrolls and title, close control, and actions remain reachable.
- Given a support admin opens the editors, when rich content and previews are shown, then content remains read-only and asset upload/save controls are unavailable.
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
- 2026-07-18: Approved the rich-content extension: Flowbite-inspired Tiptap authoring, canonical JSON with derived plain text, admin-managed image assets, shared runtime renderers, and same-origin web/mobile real-surface previews. Implementation proceeds sequentially from schema/API to shared frontend contracts, notices, popups, and full QA.
- 2026-07-18: Added additive Prisma content JSON/version fields and managed content assets, strict server normalization/allowlists, admin asset upload/delete, entity asset claiming/cleanup, and legacy plain-text compatibility. Prisma generate and focused API tests passed (21/21).
- 2026-07-18: Added the shared Tiptap editor, safe React JSON renderer, managed-image upload hook, notice/popup admin integration, runtime notice/popup rendering, and admin-protected same-origin iframe previews at desktop/mobile viewport widths. Web TypeScript and focused Web tests passed (11/11).
- 2026-07-18: Concurrent terms-management DTO drift was resolved in the shared tree. Full API build, full Web production build (76/76 routes), API unit (530/530), Web unit (122/122), and focused managed-asset tests (17/17) passed.
- 2026-07-18: Browser visual QA on an isolated production Web build with intercepted admin API responses passed for notice/popup rich authoring, managed image insertion, same-component web/mobile iframe previews, popup mobile bounds, horizontal overflow, and console/page/network/HTTP errors. Evidence: output/playwright/visual-audit/rich-content-2026-07-18T08-18-00-303Z/. Live DB CRUD remains an environment gate because this shell has no DATABASE_URL and no schema mutation was attempted.
- 2026-07-19: Fixed the preview iframe hard navigation to use browserAppRoute so production NEXT_PUBLIC_BASE_PATH=/v1 resolves /v1/admin-content-preview instead of the root 404. BasePath regression tests passed (8/8), the /v1 production build passed, and browser QA passed with zero console/page/network/HTTP errors. Evidence: output/playwright/visual-audit/rich-content-basepath-fix-2026-07-19/.
- 2026-07-19: Fixed the admin content upload contract: the Web FormData now uses the API's files field and consumes the direct { assetId, url, status } response instead of a mocked nested asset. Contract/admin tests passed (6/6), the /v1 production build passed, and a live upload through localhost:3013/v1/api/v1/admin/content-assets succeeded before its temporary asset was deleted successfully.
- 2026-07-19: Added basePath-aware managed-image rendering, editor-session cleanup on save/cancel/switch, and API startup/hourly cleanup for unattached temporary assets older than 24 hours. Atomic delete guards prevent cleanup from removing an asset claimed concurrently by saved content.
- 2026-07-19: Final regression passed: Web unit 131/131, API unit 533/533, API build, Web TypeScript, and /v1 production build (76/76 routes). Browser QA verified /v1/uploads rendering, shared web/mobile previews, popup cancel DELETE, and zero console/page/network/HTTP errors. Evidence: output/playwright/visual-audit/rich-content-temp-cleanup-2026-07-19/.
- 2026-07-19: Fixed popup/notice saves for Tiptap's default textAlign=null output. The API accepts null only as the editor's default alignment, removes it from canonical stored JSON, and continues to reject unsupported values such as justify. Focused rich-content tests passed (8/8) and the API build passed.
- 2026-07-19: Fixed Tiptap Image 3.28 default attrs (title/width/height=null) being rejected as unsupported. These null transport defaults are stripped before validation/persistence, while non-null dimensions and arbitrary image attrs remain rejected. Focused rich-content tests passed (11/11) and the API build passed.
- 2026-07-19: Completed the Tiptap 3.28 transport-default audit. Missing content on empty paragraph/heading nodes is canonicalized to [], and Link defaults (target=_blank, canonical rel, class/title=null) are removed before strict validation. Null/invalid content and custom link presentation attrs remain rejected. Focused tests passed (15/15) and the API build passed.
- 2026-07-19: Completed the uploaded-image matrix across validation, storage, attachment/removal, editor insertion, session cleanup, HTTP validation, real-surface web/mobile previews, and a live API/DB lifecycle. Focused automation passed 71/71, full API 578/578, full Web 139/139, browser checks 14/14, and live lifecycle 6/6. QA caught and fixed multi-file selection inserting only one image. Evidence: docs/scenarios/16-admin-rich-content-images.md and output/playwright/visual-audit/rich-content-image-matrix-2026-07-19/report.json.
- 2026-07-19: Notice list summaries now omit managed-image alt/file names while detail rendering keeps the image alt contract. Mixed content shows authored text only, and image-only notices show the Korean image-content 안내 문구. Public/admin focused tests passed 7/7, full Web tests 143/143, typecheck, and the 76-route production build passed. The live /v1/notices mobile/desktop content check hid the real saved filename in 2/2 viewports; the unauthenticated shell still reports its pre-existing notifications 401 because local dev-login is unavailable (404).
