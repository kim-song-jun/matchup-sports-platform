# Native Route Parity Contract

Status: Draft execution contract for Task 100 Wave 0.

This document maps every current `apps/v1_web/src/app/**/page.tsx` route to the native platform surface planned for `apps/v1_mobile`. It is a contract: if the web route tree changes, this table and `scripts/qa/native-route-parity-contract.test.mjs` must be updated in the same change.

## Architecture Boundary

- Backend source: `apps/v1_api`
- Web source: `apps/v1_web`
- Native app target: `apps/v1_mobile`
- macOS target: decision-gated under Task 100

## Route Matrix

| Route | Native Surface | Backend Owner | Web Reference | Implementation Wave |
| --- | --- | --- | --- | --- |
| `/` | Public launch stack entry | auth/public | `apps/v1_web/src/app/page.tsx` | Wave 3 auth/public |
| `/admin` | Admin mode or desktop-only decision gate | admin | `apps/v1_web/src/app/admin/page.tsx` | Wave 11 admin |
| `/admin/audit` | Admin audit mode or desktop-only decision gate | admin | `apps/v1_web/src/app/admin/audit/page.tsx` | Wave 11 admin |
| `/auth/account-conflict` | Auth result state screen | auth | `apps/v1_web/src/app/auth/account-conflict/page.tsx` | Wave 3 auth/public |
| `/auth/blocked` | Auth blocked state screen | auth | `apps/v1_web/src/app/auth/blocked/page.tsx` | Wave 3 auth/public |
| `/auth/location-denied` | Auth location permission state screen | auth/master | `apps/v1_web/src/app/auth/location-denied/page.tsx` | Wave 3 auth/public |
| `/auth/missing-email` | Auth missing email state screen | auth | `apps/v1_web/src/app/auth/missing-email/page.tsx` | Wave 3 auth/public |
| `/auth/password-reset` | Password reset stack screen | auth | `apps/v1_web/src/app/auth/password-reset/page.tsx` | Wave 3 auth/public |
| `/auth/provider-denied` | Social provider denied state screen | auth | `apps/v1_web/src/app/auth/provider-denied/page.tsx` | Wave 3 auth/public |
| `/callback/kakao` | Kakao deep-link callback handler | auth | `apps/v1_web/src/app/callback/kakao/page.tsx` | Wave 3 auth/public |
| `/chat` | Chat room list tab stack | chat | `apps/v1_web/src/app/chat/page.tsx` | Wave 9 chat/notifications |
| `/chat/[id]` | Chat room detail stack screen | chat | `apps/v1_web/src/app/chat/[id]/page.tsx` | Wave 9 chat/notifications |
| `/home` | Home tab root | home | `apps/v1_web/src/app/home/page.tsx` | Wave 5 shell/home |
| `/landing` | Public marketing/intro screen | public | `apps/v1_web/src/app/landing/page.tsx` | Wave 3 auth/public |
| `/login` | Login method selection screen | auth | `apps/v1_web/src/app/login/page.tsx` | Wave 3 auth/public |
| `/login/email` | Email login screen | auth | `apps/v1_web/src/app/login/email/page.tsx` | Wave 3 auth/public |
| `/matches` | Match discovery tab/list | matches | `apps/v1_web/src/app/matches/page.tsx` | Wave 6 discovery/search |
| `/matches/[id]` | Match detail stack screen | matches | `apps/v1_web/src/app/matches/[id]/page.tsx` | Wave 7 details |
| `/matches/[id]/edit` | Match edit flow stack | matches | `apps/v1_web/src/app/matches/[id]/edit/page.tsx` | Wave 8 create/edit |
| `/matches/empty` | Match empty state screen | matches | `apps/v1_web/src/app/matches/empty/page.tsx` | Wave 6 discovery/search |
| `/matches/error` | Match error state screen | matches | `apps/v1_web/src/app/matches/error/page.tsx` | Wave 6 discovery/search |
| `/matches/filter` | Match filter bottom sheet | matches | `apps/v1_web/src/app/matches/filter/page.tsx` | Wave 6 discovery/search |
| `/matches/joined` | Joined match list screen | matches | `apps/v1_web/src/app/matches/joined/page.tsx` | Wave 8 create/edit |
| `/matches/new` | Match create flow entry | matches | `apps/v1_web/src/app/matches/new/page.tsx` | Wave 8 create/edit |
| `/matches/new/complete` | Match create completion screen | matches | `apps/v1_web/src/app/matches/new/complete/page.tsx` | Wave 8 create/edit |
| `/matches/new/confirm` | Match create confirm step | matches | `apps/v1_web/src/app/matches/new/confirm/page.tsx` | Wave 8 create/edit |
| `/matches/new/place-time` | Match create place/time step | matches | `apps/v1_web/src/app/matches/new/place-time/page.tsx` | Wave 8 create/edit |
| `/matches/new/sport` | Match create sport step | matches | `apps/v1_web/src/app/matches/new/sport/page.tsx` | Wave 8 create/edit |
| `/matches/participants` | Match participants screen | matches | `apps/v1_web/src/app/matches/participants/page.tsx` | Wave 8 create/edit |
| `/my` | My tab root | profile | `apps/v1_web/src/app/my/page.tsx` | Wave 10 my/settings/reviews |
| `/my/matches/created` | My created matches list | matches/profile | `apps/v1_web/src/app/my/matches/created/page.tsx` | Wave 10 my/settings/reviews |
| `/my/matches/joined` | My joined matches list | matches/profile | `apps/v1_web/src/app/my/matches/joined/page.tsx` | Wave 10 my/settings/reviews |
| `/my/profile/edit` | Profile edit stack screen | profile | `apps/v1_web/src/app/my/profile/edit/page.tsx` | Wave 10 my/settings/reviews |
| `/my/reviews` | My reviews root screen | reviews | `apps/v1_web/src/app/my/reviews/page.tsx` | Wave 10 my/settings/reviews |
| `/my/reviews/[sourceType]/[sourceId]` | Review write/detail target screen | reviews | `apps/v1_web/src/app/my/reviews/[sourceType]/[sourceId]/page.tsx` | Wave 10 my/settings/reviews |
| `/my/reviews/received` | Received reviews screen | reviews | `apps/v1_web/src/app/my/reviews/received/page.tsx` | Wave 10 my/settings/reviews |
| `/my/settings` | Settings root stack screen | profile | `apps/v1_web/src/app/my/settings/page.tsx` | Wave 10 my/settings/reviews |
| `/my/settings/legal` | Settings legal screen | profile | `apps/v1_web/src/app/my/settings/legal/page.tsx` | Wave 10 my/settings/reviews |
| `/my/settings/location` | Settings location screen | profile/master | `apps/v1_web/src/app/my/settings/location/page.tsx` | Wave 10 my/settings/reviews |
| `/my/settings/notifications` | Notification preferences screen | notifications/profile | `apps/v1_web/src/app/my/settings/notifications/page.tsx` | Wave 10 my/settings/reviews |
| `/my/settings/sports` | Sports preferences screen | profile/master | `apps/v1_web/src/app/my/settings/sports/page.tsx` | Wave 10 my/settings/reviews |
| `/my/settings/withdrawal` | Withdrawal flow screen | profile/auth | `apps/v1_web/src/app/my/settings/withdrawal/page.tsx` | Wave 10 my/settings/reviews |
| `/my/teams` | My teams list screen | teams/profile | `apps/v1_web/src/app/my/teams/page.tsx` | Wave 10 my/settings/reviews |
| `/my/teams/[id]` | My team detail/management screen | teams | `apps/v1_web/src/app/my/teams/[id]/page.tsx` | Wave 7 details |
| `/my/teams/[id]/members` | My team members management screen | teams | `apps/v1_web/src/app/my/teams/[id]/members/page.tsx` | Wave 8 create/edit |
| `/my/teams/members` | My teams aggregate members screen | teams | `apps/v1_web/src/app/my/teams/members/page.tsx` | Wave 10 my/settings/reviews |
| `/notices` | Notices list screen | notices | `apps/v1_web/src/app/notices/page.tsx` | Wave 9 chat/notifications |
| `/notices/[id]` | Notice detail screen | notices | `apps/v1_web/src/app/notices/[id]/page.tsx` | Wave 7 details |
| `/notifications` | Notifications list screen | notifications | `apps/v1_web/src/app/notifications/page.tsx` | Wave 9 chat/notifications |
| `/notifications/read` | Notification read redirect/ack state | notifications | `apps/v1_web/src/app/notifications/read/page.tsx` | Wave 9 chat/notifications |
| `/onboarding/confirm` | Onboarding confirm step | onboarding | `apps/v1_web/src/app/onboarding/confirm/page.tsx` | Wave 4 onboarding |
| `/onboarding/level` | Onboarding level step | onboarding/master | `apps/v1_web/src/app/onboarding/level/page.tsx` | Wave 4 onboarding |
| `/onboarding/region` | Onboarding region step | onboarding/master | `apps/v1_web/src/app/onboarding/region/page.tsx` | Wave 4 onboarding |
| `/onboarding/resume` | Onboarding resume state | onboarding | `apps/v1_web/src/app/onboarding/resume/page.tsx` | Wave 4 onboarding |
| `/onboarding/sport` | Onboarding sport step | onboarding/master | `apps/v1_web/src/app/onboarding/sport/page.tsx` | Wave 4 onboarding |
| `/search` | Search root screen | search | `apps/v1_web/src/app/search/page.tsx` | Wave 6 discovery/search |
| `/search/empty` | Search empty state screen | search | `apps/v1_web/src/app/search/empty/page.tsx` | Wave 6 discovery/search |
| `/search/error` | Search error state screen | search | `apps/v1_web/src/app/search/error/page.tsx` | Wave 6 discovery/search |
| `/search/new` | Search new query state | search | `apps/v1_web/src/app/search/new/page.tsx` | Wave 6 discovery/search |
| `/search/stale` | Search stale query state | search | `apps/v1_web/src/app/search/stale/page.tsx` | Wave 6 discovery/search |
| `/signup` | Signup entry screen | auth | `apps/v1_web/src/app/signup/page.tsx` | Wave 3 auth/public |
| `/signup/complete` | Signup completion screen | auth/onboarding | `apps/v1_web/src/app/signup/complete/page.tsx` | Wave 3 auth/public |
| `/signup/social` | Social signup screen | auth | `apps/v1_web/src/app/signup/social/page.tsx` | Wave 3 auth/public |
| `/team-matches` | Team match discovery tab/list | team-matches | `apps/v1_web/src/app/team-matches/page.tsx` | Wave 6 discovery/search |
| `/team-matches/[id]` | Team match detail screen | team-matches | `apps/v1_web/src/app/team-matches/[id]/page.tsx` | Wave 7 details |
| `/team-matches/[id]/edit` | Team match edit flow | team-matches | `apps/v1_web/src/app/team-matches/[id]/edit/page.tsx` | Wave 8 create/edit |
| `/team-matches/empty` | Team match empty state screen | team-matches | `apps/v1_web/src/app/team-matches/empty/page.tsx` | Wave 6 discovery/search |
| `/team-matches/error` | Team match error state screen | team-matches | `apps/v1_web/src/app/team-matches/error/page.tsx` | Wave 6 discovery/search |
| `/team-matches/filter` | Team match filter bottom sheet | team-matches | `apps/v1_web/src/app/team-matches/filter/page.tsx` | Wave 6 discovery/search |
| `/team-matches/new` | Team match create flow entry | team-matches | `apps/v1_web/src/app/team-matches/new/page.tsx` | Wave 8 create/edit |
| `/team-matches/new/complete` | Team match create completion screen | team-matches | `apps/v1_web/src/app/team-matches/new/complete/page.tsx` | Wave 8 create/edit |
| `/team-matches/new/condition` | Team match create condition step | team-matches | `apps/v1_web/src/app/team-matches/new/condition/page.tsx` | Wave 8 create/edit |
| `/team-matches/new/confirm` | Team match create confirm step | team-matches | `apps/v1_web/src/app/team-matches/new/confirm/page.tsx` | Wave 8 create/edit |
| `/team-matches/new/info` | Team match create info step | team-matches | `apps/v1_web/src/app/team-matches/new/info/page.tsx` | Wave 8 create/edit |
| `/team-matches/new/place-time` | Team match create place/time step | team-matches | `apps/v1_web/src/app/team-matches/new/place-time/page.tsx` | Wave 8 create/edit |
| `/team-matches/new/sport` | Team match create sport step | team-matches | `apps/v1_web/src/app/team-matches/new/sport/page.tsx` | Wave 8 create/edit |
| `/team-matches/new/team` | Team match create team step | team-matches/teams | `apps/v1_web/src/app/team-matches/new/team/page.tsx` | Wave 8 create/edit |
| `/teams` | Teams discovery tab/list | teams | `apps/v1_web/src/app/teams/page.tsx` | Wave 6 discovery/search |
| `/teams/[id]` | Team detail screen | teams | `apps/v1_web/src/app/teams/[id]/page.tsx` | Wave 7 details |
| `/teams/[id]/edit` | Team edit flow | teams | `apps/v1_web/src/app/teams/[id]/edit/page.tsx` | Wave 8 create/edit |
| `/teams/[id]/members` | Team members screen | teams | `apps/v1_web/src/app/teams/[id]/members/page.tsx` | Wave 8 create/edit |
| `/teams/filter` | Teams filter bottom sheet | teams | `apps/v1_web/src/app/teams/filter/page.tsx` | Wave 6 discovery/search |
| `/teams/new` | Team create flow | teams | `apps/v1_web/src/app/teams/new/page.tsx` | Wave 8 create/edit |
| `/teams/search` | Team search screen | teams/search | `apps/v1_web/src/app/teams/search/page.tsx` | Wave 6 discovery/search |
| `/teams/search/empty` | Team search empty state | teams/search | `apps/v1_web/src/app/teams/search/empty/page.tsx` | Wave 6 discovery/search |
| `/teams/search/error` | Team search error state | teams/search | `apps/v1_web/src/app/teams/search/error/page.tsx` | Wave 6 discovery/search |
| `/terms` | Terms/legal screen | public/profile | `apps/v1_web/src/app/terms/page.tsx` | Wave 10 my/settings/reviews |

## Verification

Run:

```bash
node scripts/qa/native-route-parity-contract.test.mjs
```

Expected:

- `totalRoutes: 87`
- `missingRoutes: []`
- `extraRoutes: []`
- `incompleteRows: []`
