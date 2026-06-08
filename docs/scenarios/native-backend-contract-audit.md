# Native Backend Contract Audit

Status: Task 100 Wave 1 execution contract.

This document maps every `Backend Owner` token from [native-route-parity-contract.md](./native-route-parity-contract.md) to the v1 backend runtime, v1 API contract docs, and the native implementation decision. It is intentionally narrower than a backend redesign: `apps/v1_api` remains canonical, and `apps/v1_mobile` must consume the existing `/api/v1` contract unless this audit names a real gap.

## Backend Owner Coverage

| Owner Token | Owner Type | Route Count | Runtime Evidence | API Doc Evidence | Native Decision | Next Wave Action |
| --- | --- | --- | --- | --- | --- | --- |
| `admin` | live | 2 | `apps/v1_api/src/admin/admin.controller.ts` | `docs/api/v1/domains/admin-audit.md` | Native admin is decision-gated; do not include in consumer tab shell by default. | Keep desktop/admin mode separate until Wave 4 admin inclusion decision. |
| `auth` | live | 10 | `apps/v1_api/src/auth/auth.controller.ts` | `docs/api/v1/domains/auth-onboarding.md` | Use current auth/session contract for dev; release-grade native storage and OAuth deep links remain gated. | Wave 2 defines secure storage and Wave 3 binds login/signup screens. |
| `auth/master` | composite | 1 | `apps/v1_api/src/auth/auth.controller.ts`, `apps/v1_api/src/master/master.controller.ts` | `docs/api/v1/domains/auth-onboarding.md`, `docs/api/v1/domains/home-search-notices-master.md` | Location-denied/auth support screens depend on auth state plus master region data. | Wave 3 handles auth state screens; Wave 4 handles permission prompts. |
| `auth/onboarding` | composite | 1 | `apps/v1_api/src/auth/auth.controller.ts`, `apps/v1_api/src/onboarding/onboarding.controller.ts` | `docs/api/v1/domains/auth-onboarding.md` | Signup completion must route into onboarding without inventing app-only status. | Wave 3 auth completion hands off to Wave 4 onboarding. |
| `auth/public` | composite | 1 | `apps/v1_api/src/auth/auth.controller.ts`, `apps/v1_api/src/home/home.controller.ts`, `apps/v1_api/src/master/master.controller.ts` | `docs/api/v1/global-contract.md`, `docs/api/v1/domains/auth-onboarding.md` | Public launch routes are native-local UI with optional auth/bootstrap reads. | Wave 3 builds public launch/login without WebView wrapping. |
| `chat` | live | 2 | `apps/v1_api/src/chat/chat.controller.ts` | `docs/api/v1/domains/chat-notifications.md` | Text chat room list/detail can bind to v1; permanent team chat, DM, and file attachment stay deferred. | Wave 9 binds chat list/detail and records reconnect policy. |
| `home` | live | 1 | `apps/v1_api/src/home/home.controller.ts` | `docs/api/v1/domains/home-search-notices-master.md` | Native home can use the existing aggregate and recommendations endpoints. | Wave 5 app boot/home uses this as first authenticated tab data. |
| `matches` | live | 13 | `apps/v1_api/src/matches/matches.controller.ts`, `apps/v1_api/src/matches/match-applications.controller.ts`, `apps/v1_api/src/matches/my-matches.controller.ts` | `docs/api/v1/domains/matches.md` | Discovery/detail/create/edit can bind directly; no payment or checkout dependency is allowed. | Wave 6 handles discovery; Wave 7 detail; Wave 8 create/edit/applications. |
| `matches/profile` | composite | 2 | `apps/v1_api/src/matches/my-matches.controller.ts`, `apps/v1_api/src/profile/profile.controller.ts` | `docs/api/v1/domains/matches.md`, `docs/api/v1/domains/profile-settings.md` | My match lists combine match ownership/participation with profile shell hydration. | Wave 10 uses my match lists without duplicating profile endpoints. |
| `notices` | live | 2 | `apps/v1_api/src/notices/notices.controller.ts` | `docs/api/v1/domains/home-search-notices-master.md` | Notices are public/read-only and are not notification read-state rows. | Wave 9 binds notices list/detail as utility screens. |
| `notifications` | live | 2 | `apps/v1_api/src/notifications/notifications.controller.ts` | `docs/api/v1/domains/chat-notifications.md` | In-app notification list/read is available; push/APNs is a later release gate. | Wave 9 binds list/read and keeps push disabled or explicit. |
| `notifications/profile` | composite | 1 | `apps/v1_api/src/notifications/notifications.controller.ts`, `apps/v1_api/src/profile/profile.controller.ts` | `docs/api/v1/domains/chat-notifications.md`, `docs/api/v1/domains/profile-settings.md` | Notification settings span notification preferences and settings profile copy. | Wave 10 binds preferences and labels device-local push controls honestly. |
| `onboarding` | live | 2 | `apps/v1_api/src/onboarding/onboarding.controller.ts` | `docs/api/v1/domains/auth-onboarding.md` | Native multi-step onboarding must submit DTO-compatible payloads only. | Wave 4 builds sport/level/region/confirm with DTO cleanup. |
| `onboarding/master` | composite | 3 | `apps/v1_api/src/onboarding/onboarding.controller.ts`, `apps/v1_api/src/master/master.controller.ts` | `docs/api/v1/domains/auth-onboarding.md`, `docs/api/v1/domains/home-search-notices-master.md` | Onboarding choices use master sports/regions and onboarding preferences. | Wave 4 hydrates master data before form submit. |
| `profile` | live | 4 | `apps/v1_api/src/profile/profile.controller.ts` | `docs/api/v1/domains/profile-settings.md` | Profile/settings shell can bind directly; unsupported email/password controls remain deferred. | Wave 10 implements my/settings/profile flows. |
| `profile/auth` | composite | 1 | `apps/v1_api/src/profile/profile.controller.ts`, `apps/v1_api/src/auth/auth.controller.ts` | `docs/api/v1/domains/profile-settings.md`, `docs/api/v1/domains/auth-onboarding.md` | Withdrawal/logout flows must use v1 auth/profile contracts and clear native local session. | Wave 10 implements withdrawal and logout states. |
| `profile/master` | composite | 2 | `apps/v1_api/src/profile/profile.controller.ts`, `apps/v1_api/src/master/master.controller.ts` | `docs/api/v1/domains/profile-settings.md`, `docs/api/v1/domains/home-search-notices-master.md` | Location/sports settings reuse master data plus profile preference mutation. | Wave 10 binds settings sports/location with shared form normalization. |
| `public` | native-local | 1 | No Nest module; native-local route chrome | `docs/api/v1/global-contract.md` | Marketing/legal-public UI is native-local unless it needs auth/bootstrap reads. | Wave 3 creates public entry surfaces with local copy and no fake API dependency. |
| `public/profile` | composite | 1 | `apps/v1_api/src/profile/profile.controller.ts` | `docs/api/v1/domains/profile-settings.md` | Terms/legal under settings is mostly native-local copy; profile only owns account/legal shell context. | Wave 10 keeps legal copy local unless terms API is implemented. |
| `reviews` | live | 3 | `apps/v1_api/src/reviews/reviews.controller.ts` | `docs/api/v1/domains/reviews.md` | Pending/written/received review flows can bind after docs sync; duplicate submit must surface server conflict honestly. | Wave 10 implements reviews after match/team-match completed-state fixtures exist. |
| `search` | live | 5 | `apps/v1_api/src/search/search.controller.ts` | `docs/api/v1/domains/home-search-notices-master.md` | Recent-search persistence exists; unified search results are still not a v1 success API. | Wave 6 uses domain list queries for results and recent-search endpoints for history. |
| `team-matches` | live | 13 | `apps/v1_api/src/team-matches/team-matches.controller.ts` | `docs/api/v1/domains/team-matches.md` | Discovery/detail/create/edit/application flows can bind directly; cost/payment remains text-only. | Wave 6 handles discovery; Wave 7 detail; Wave 8 create/edit/applications. |
| `team-matches/teams` | composite | 1 | `apps/v1_api/src/team-matches/team-matches.controller.ts`, `apps/v1_api/src/teams/teams.controller.ts` | `docs/api/v1/domains/team-matches.md`, `docs/api/v1/domains/teams.md` | Team match host-team selection must use current user's owner/manager teams. | Wave 8 validates host team choices before create. |
| `teams` | live | 9 | `apps/v1_api/src/teams/teams.controller.ts` | `docs/api/v1/domains/teams.md` | Team discovery/detail/create/edit/member flows can bind directly. | Wave 6 handles discovery/search; Wave 7 detail; Wave 8 create/edit/member actions. |
| `teams/profile` | composite | 1 | `apps/v1_api/src/teams/teams.controller.ts`, `apps/v1_api/src/profile/profile.controller.ts` | `docs/api/v1/domains/teams.md`, `docs/api/v1/domains/profile-settings.md` | My teams screen uses team memberships and profile shell hydration. | Wave 10 binds my teams list with role badges. |
| `teams/search` | composite | 3 | `apps/v1_api/src/teams/teams.controller.ts`, `apps/v1_api/src/search/search.controller.ts` | `docs/api/v1/domains/teams.md`, `docs/api/v1/domains/home-search-notices-master.md` | Team search results use team list query; search history may record the query. | Wave 6 composes team list filters with recent-search persistence. |

## Native Backend Gap Register

| Gap | Risk | Source Evidence | Native Decision | Owner | Target Wave |
| --- | --- | --- | --- | --- | --- |
| Native auth storage and OAuth/deep-link policy | Expo app cannot rely on web-only local/session assumptions for release login. | `docs/api/v1/global-contract.md`, `apps/v1_api/src/auth/auth.controller.ts` | Use dev session response for local testing; design secure token storage and Kakao native deep link before release. | auth | Wave 2/Wave 3 |
| Search doc drift | Native search might assume unified search exists, but runtime only supports recent search persistence. | `apps/v1_api/src/search/search.controller.ts`, `docs/api/v1/domains/home-search-notices-master.md` | Use domain list APIs for result pages and `/search/recent` only for history. | search | Wave 6 |
| Reviews doc drift | Native review screens need an explicit v1 contract for pending/written/received/source/submit flows. | `apps/v1_api/src/reviews/reviews.controller.ts`, `docs/api/v1/domains/reviews.md` | Keep review API contract documented before binding native review screens. | reviews | Wave 10 |
| Push/APNs backend gate | Native notifications can accidentally promise push delivery before backend support exists. | `docs/api/v1/domains/chat-notifications.md`, `docs/api/v1/domains/deferred-boundaries.md` | Implement in-app list/read first; push controls stay disabled or explicitly decision-gated. | notifications | Wave 9/Wave 10 |
| Upload/payment/test-mode boundaries | Native create/edit and transaction-like surfaces may imply unsupported success flows. | `docs/api/v1/domains/deferred-boundaries.md` | Keep image URL/mock upload and payment-like states honest until API exists. | matches/team-matches/profile | Wave 8/Wave 10 |

## Deferred Boundary Register

| Boundary | Native UX Rule | Source Evidence | Forbidden Implementation |
| --- | --- | --- | --- |
| Payment, refund, settlement, dispute | Show disabled/test-only or unavailable state; no real charge/refund copy. | `docs/api/v1/domains/deferred-boundaries.md` | Do not call non-existent checkout/refund endpoints or show fake transaction IDs. |
| Marketplace, lessons, venue operator, tournament operations | Keep out of the 87-route native parity scope until v1 route/API contract exists. | `docs/api/v1/domains/deferred-boundaries.md`, `docs/scenarios/native-route-parity-contract.md` | Do not silently reuse legacy APIs or build native-only success flows. |
| DM, permanent team chat, chat file attachment | Use linked text chat only. | `docs/api/v1/domains/chat-notifications.md` | Do not expose file attachment or permanent team chat as working features. |
| Upload/file management | Treat as deferred core API; image URL fields may exist on domain DTOs. | `docs/api/v1/domains/deferred-boundaries.md`, `docs/api/v1/domains/matches.md`, `docs/api/v1/domains/teams.md` | Do not claim native file upload success without an implemented v1 upload API. |

## Verification

Run:

```bash
node scripts/qa/native-backend-contract-audit.test.mjs
```

Expected:

- `totalRoutes: 87`
- `missingOwners: []`
- `unknownOwners: []`
- `missingLiveFiles: []`
- `missingDocFiles: []`
