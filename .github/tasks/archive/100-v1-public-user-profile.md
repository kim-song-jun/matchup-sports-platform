# 100 V1 Public User Profile

## Scope

- Backend: `apps/v1_api`
- Frontend: `apps/v1_web`
- Route: `/users/:userId`

## Request

Users should be able to click another user's profile from team membership and team join application surfaces and view a minimal public profile without team-based permission requirements.

## Requirements

- Public profile is visible by user id without requiring team membership.
- Do not expose private data such as email, phone, birth date, or region details.
- Visible profile fields:
  - profile image
  - display name
  - nickname
  - activity summary
  - this month's activity
- Team member rows and team join application rows link to the public profile route.

## Acceptance Criteria

- Given a user opens `/users/:userId`, when the user exists, then a public profile page renders minimal profile and activity data.
- Given a team member row is visible, when the row identity area is clicked, then it navigates to `/users/:userId`.
- Given a team join application row is visible, when the applicant identity area is clicked, then it navigates to `/users/:userId`.
- Given a target profile is private or deleted, then sensitive fields and activity data are not leaked.

## Progress Snapshot

- 2026-07-05: Task opened. Plan is to extend the existing `GET /api/v1/users/:userId/public-profile` contract and add the v1 web public profile route plus team row links.
- 2026-07-05: Implemented public profile activity summary, `/users/:userId` web route, team member/applicant row links, and API contract docs.
- 2026-07-05: Backend unit tests passed. Frontend build was blocked by local Node 18.19.1; Next requires Node >=20.9.0 and repo engine wants Node >=22.
