# Task 133 — Tournament sponsor logo upload validation

## Scope

- Backend DTO validation and focused regression coverage
- Tournament API contract documentation
- No frontend layout or behavior changes

## Problem

The authenticated upload API returns root-relative `/uploads/...` image URLs, and the admin
tournament sponsor form submits that returned value as `logoUrl`. The sponsor DTO accepted only
protocol URLs, so a normal uploaded logo caused `POST /api/v1/admin/tournaments/:id/sponsors` to
fail with `400 Bad Request` before reaching the service.

## Acceptance Criteria

- [x] Create and update sponsor DTOs accept safe root-relative `/uploads/...` logo paths.
- [x] Existing protocol URL support and blank update clearing remain supported.
- [x] Traversal-like local upload paths remain rejected.
- [x] The canonical tournament API contract documents the local upload path.
- [x] Focused DTO regression test passes.

## Progress Snapshot

- 2026-08-10: Contract mismatch identified between upload response and sponsor DTO; fix and
  regression coverage implemented. Focused Jest result: 1 suite, 4 tests passed.
