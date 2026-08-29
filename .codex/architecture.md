# V1 Architecture Rules

## Backend

- Canonical backend app: `apps/v1_api`
- Framework: NestJS
- API prefix: `/api/v1`
- Prisma schema: `apps/v1_api/prisma/schema.prisma`
- Seeds and migrations must come from `apps/v1_api/prisma`

Backend work must start by checking:

1. Existing v1 API/module/controller/service
2. Related v1 Prisma schema
3. Related v1 DB structure
4. Existing DTO and error patterns
5. Tests and fixtures under `apps/v1_api`

## Frontend

- Canonical frontend app: `apps/v1_web`
- Framework: Next.js App Router
- Design source: `docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html`

Frontend work must start by checking:

1. Existing v1 route/page structure
2. Existing v1 components/hooks/types
3. The Teameet Design HTML
4. Existing design tokens and shared UI patterns

## Android

- Canonical Android app: `apps/v1_android`
- Architecture: dedicated native WebView shell over the deployed v1 Web origin, with native FCM, permission, and deep-link handling
- Alpha and production must use distinct application IDs, Firebase projects, and API origins.
- Firebase Admin credentials never belong in the Android artifact; only public Firebase app identifiers are build inputs.

## Shared Rule

If a rule or implementation outside `apps/v1_api`, `apps/v1_web`, `apps/v1_android`, or `.codex` conflicts with v1, ignore the old source and follow v1.
