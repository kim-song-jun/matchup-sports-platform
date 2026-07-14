# 87 Gender Enum Contract

Status: Completed
Date: 2026-05-26

## Scope

- Backend Prisma schema, DTO validation, services for user profile, matches, team matches, and team composition inputs.
- Frontend generated enum types, API types, match/team-match create/edit/list/detail forms.
- Seed, mock catalog, MSW/test fixtures that carry user or match gender.

## Contract

- `Gender`: user profile gender only.
  - Values: `male`, `female`
- `MatchGender`: recruitment condition for individual matches and team matches.
  - Values: `any`, `male`, `female`
- Team composition remains JSON for team balancing shape, but any gender field inside team composition payloads must use `MatchGender` values.
- `v1_user_profiles.gender` remains nullable for legacy accounts. New email/social signup and profile updates require `male` or `female` at the application boundary.
- Gender is private on public profiles, but is shown on self, authorized team-member, admin-user, and tournament-roster surfaces.

## Acceptance Criteria

- [x] Prisma schema uses `Gender` without `other`.
- [x] Prisma schema uses `MatchGender` for `Match.gender`.
- [x] Prisma schema adds `TeamMatch.gender` as `MatchGender @default(any)`.
- [x] API DTOs validate gender inputs with enum contracts.
- [x] Frontend types expose `MatchGender` and use it for match/team-match payloads and records.
- [x] Match and team-match create/edit/detail/list surfaces preserve `any/male/female`.
- [x] Mock users no longer use `other`.
- [x] Mock matches and team matches use `MatchGender` values.
- [x] Email and social signup require a binary gender selection.
- [x] My profile reads, edits, and displays gender while preserving a legacy null state.
- [x] Authorized team member and admin user surfaces display gender.
- [x] Tournament roster keeps the nullable snapshot contract and displays registered/unregistered gender.

## Progress Snapshot

- 2026-05-26: Found current drift: profile `Gender` includes `other`, individual `Match.gender` is raw string, and `TeamMatch` has no gender field.
- 2026-05-26: Added `MatchGender`, migrated match/team-match contracts, regenerated Prisma/frontend enums, and validated API/web types plus focused tests.
- 2026-07-14: Kept the DB column nullable for legacy users, made new signup/profile inputs required, and propagated gender to authorized member-management surfaces.
- 2026-07-14 validation: API focused 121/121, API build, Web 95/95, Web TypeScript, Web production build, and desktop/mobile Playwright checks passed. Pattern check remains blocked only by unrelated admin popup copy WIP.
- 2026-07-14: Reconfirmed admin member management display: list cards and member detail show `남` / `여` / `성별 미등록`, with explicit API detail coverage for both saved and legacy-null gender values.

## Ambiguity Log

- User clarified product policy: profile gender should be only `male` / `female`.
