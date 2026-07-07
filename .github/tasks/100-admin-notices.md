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
- Pinned notices use the existing v1 contract: `category === '고정'`.
- Public `/notices` must still expose only `published + public` notices.

## API Contract

- `GET /api/v1/admin/notices`
  - filters: `status`, `category`, `audience`, `q`, `cursor`, `limit`
  - returns cursor page of notice rows
- `POST /api/v1/admin/notices`
  - creates draft or published notice
  - maps `pinned: true` to `category: '고정'`
  - maps `pinned: false` to submitted non-fixed category

## Acceptance Criteria

- Given an active admin, when opening `/admin/notices`, then the admin can see notices including drafts and archived notices.
- Given an active admin, when creating a notice with pinned enabled, then the created notice is stored as category `고정` and appears as pinned.
- Given a public user, when opening `/notices`, then draft and archived notices are not exposed.
- Given a non-admin user, admin notice APIs are denied.

## Progress Snapshot

- 2026-07-07: Task created. Implementation pending.
- 2026-07-07: Added `GET/POST /api/v1/admin/notices`, admin sidebar entry, `/admin/notices` list/create page, pinned mapping via `category === '고정'`, frontend hooks/MSW/types, API docs, and focused backend/frontend tests.
