# Teameet Project Context

## Scope

This repository is operated in v1-only mode.

Only the following implementation targets are valid:

- Backend: `apps/v1_api`
- Frontend: `apps/v1_web`
- Android / iOS shells: `apps/v1_android`, `apps/v1_ios`

The legacy v0 apps (`apps/api`, `apps/web`) have been removed; their last state is kept only in the git tag `legacy-v0-final`. They, `docs/archive/`, and any deprecated or old-version design/API/DB documents are not implementation references.

Do not inspect or copy legacy behavior unless the user explicitly asks for legacy removal, migration, or archival work.

## Design Source Of Truth

Design decisions follow `DESIGN.md` (the canonical design source of truth; priority order in its §1: `DESIGN.md` > `.impeccable.md` > `apps/v1_web/src/app/tokens.css` / `globals.css` tokens > `components/v1-ui/` primitives).

`docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html` is a visual reference for layout intent, not a rule source. When implementation and `DESIGN.md` differ, prefer `DESIGN.md` unless the current v1 code proves a runtime constraint that must be preserved.

## Startup Routine

For every non-trivial task:

1. Determine whether the scope is `backend`, `frontend`, `both`, `infra`, or `docs`.
2. Read `.codex/AGENTS.md` and the relevant `.codex/*.md` files.
3. Read the relevant files in `apps/v1_api` or `apps/v1_web`.
4. For frontend/design work, check `DESIGN.md` and `docs/guides/v1-coding-patterns.md`, using the Teameet Design HTML for layout intent.
5. Implement only within the v1 scope unless explicitly requested otherwise.

## Response Order

For code analysis, explain:

1. Current structure
2. Problem
3. Improvement direction
4. Applied code or recommended code

For feature implementation, explain:

1. Modified files
2. Reason for change
3. Implementation method
4. Applied code summary

For DB work, explain:

1. Related tables
2. Related Prisma schema
3. Impact
4. Migration status
