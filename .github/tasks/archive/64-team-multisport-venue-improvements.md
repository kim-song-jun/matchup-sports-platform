# Task 64: Team Multi-Sport Support, Venue Naming, Venue Access, Team List Improvements

## Context

Four related improvements to the team/venue surface:

1. **Team multi-sport**: `SportTeam.sportType` is a single `SportType` enum. Teams often play multiple sports (e.g., a club that plays both futsal and basketball). The schema needs to support `sportTypes SportType[]`.
2. **Sport-specific venue naming**: Hardcoded "구장" throughout the frontend should become sport-aware ("링크장", "체육관", "수영장", etc.).
3. **Venue access from mobile UI**: Venues have no dedicated navigation entry. Quick links exist in Zone 1 "더 찾아보기" on home, but Zone 3 needs a card section, and profile page needs a service link.
4. **Team list improvements**: Team list page lacks search, sport filter chips, and sort options.

## Goal

- Enable teams to declare multiple sports
- Make venue labels sport-contextual
- Surface venue access in profile page and home Zone 3
- Add search/filter/sort to team listing

---

## Original Conditions (Checklist)

- [ ] `SportTeam.sportType` (singular) replaced with `sportTypes SportType[]` in Prisma schema
- [ ] Prisma migration converts existing `sport_type` data into `sport_types` array
- [ ] GIN index on `sport_types` column for efficient `has/hasSome` queries
- [ ] Backend DTOs accept `sportTypes: SportType[]` with `@ArrayMinSize(1)` validation
- [ ] API response includes computed `sportType: sportTypes[0]` for backward compatibility
- [ ] All 13+ backend Prisma `select` statements referencing `team.sportType` updated to `sportTypes`
- [ ] Frontend team creation form changes to multi-select chip toggle (at least 1 required)
- [ ] Frontend team edit form changes to multi-select
- [ ] TeamCard displays primary sport badge + additional sport indicators
- [ ] `venueLabel(sportType)` function added to `lib/constants.ts`
- [ ] User-facing "구장" occurrences replaced with sport-aware labels (legal text excluded)
- [ ] Profile page "서비스" section includes venue link
- [ ] Home page Zone 3 includes venue card section
- [ ] Team list page has sport filter chips
- [ ] Team list page has search input (name search)
- [ ] Team list page has sort options (by member count, by recent)
- [ ] All affected inline mocks and fixtures updated in same commit
- [ ] `tsc --noEmit` passes for both apps/web and apps/api

---

## Schema Migration Decision

### ADR: Single `sportTypes[]` column (Option B modified)

**Context**: Need to support multiple sports per team. Two options considered:
- A) Keep `sportType` + add `sportTypes[]` (dual columns, sync required)
- B) Replace `sportType` with `sportTypes[]` (clean, but breaks all references)

**Decision**: Option B with API-layer backward compatibility.

The DB will have only `sportTypes SportType[]`. The API response transformation layer adds a computed `sportType: sportTypes[0]` field so existing frontend code continues to work during migration. No dual columns in the DB -- that would be tech debt on day one (per CLAUDE.md principle 1).

**Migration procedure** (builders must follow this exact order):

1. Edit `schema.prisma`:
   - Change `sportType SportType @map("sport_type")` to `sportTypes SportType[] @map("sport_types")`
   - Remove `@@index([sportType])`
   - Add `@@index([sportTypes], type: Gin)` (note: Prisma 6 supports `type: Gin` for array indexes)
2. Run `cd apps/api && npx prisma migrate dev --create-only --name team-multisport`
3. **CRITICAL**: Edit the generated migration SQL file BEFORE applying. Insert `UPDATE sport_teams SET sport_types = ARRAY[sport_type];` BEFORE the `ALTER TABLE ... DROP COLUMN sport_type` line. Without this, the column is dropped before data is copied and all existing team sport data is lost.
4. Run `cd apps/api && npx prisma migrate dev` to apply

**Expected migration SQL** (after manual edit):
```sql
ALTER TABLE sport_teams ADD COLUMN sport_types "SportType"[] DEFAULT '{}';
UPDATE sport_teams SET sport_types = ARRAY[sport_type];
ALTER TABLE sport_teams ALTER COLUMN sport_types SET NOT NULL;
ALTER TABLE sport_teams ALTER COLUMN sport_types DROP DEFAULT;
ALTER TABLE sport_teams DROP COLUMN sport_type;
DROP INDEX IF EXISTS sport_teams_sport_type_idx;
CREATE INDEX sport_teams_sport_types_idx ON sport_teams USING GIN (sport_types);
```

**Backward compatibility strategy -- input vs response types**:

- **Input types** (`CreateTeamDto`, `CreateTeamInput`): Change to `sportTypes` only. No backward compat needed -- input is always from our own frontend.
- **Response types** (`SportTeam`, `MyTeam` in API responses): Include both `sportTypes: string[]` (new, authoritative) AND computed `sportType: string` (= `sportTypes[0]`). Capacitor mobile app may depend on the singular field.
- **Where `sportType` gets computed**: Add a private helper in `teams.service.ts`:
  ```typescript
  private withPrimarySport<T extends { sportTypes: SportType[] }>(team: T): T & { sportType: SportType } {
    return { ...team, sportType: team.sportTypes[0] };
  }
  ```
  Call in `findById`, `findAll` result mapping, `create`, `update`, and `findHub`. For team sub-objects in other services (mercenary, team-matches, etc.), those services select `sportTypes: true` and the frontend reads `sportTypes[0]` where it needs a single value. Do NOT try to transform team sub-objects in every other service -- that is unsustainable.

**Consequences**:
- Clean: no data duplication, no sync logic
- All Prisma `select: { sportType: true }` on SportTeam relations break -- 13+ locations across 8 service files must be updated to `sportTypes: true`. These changes MUST happen atomically with the schema migration (same commit/PR) or `tsc --noEmit` will fail.
- Frontend receives both `sportTypes: string[]` (new) and `sportType: string` (computed, backward compat) until full migration completes
- Filtering changes from `where: { sportType: value }` to `where: { sportTypes: { has: value } }`

---

## Blast Radius: sportType References on SportTeam Relations

All backend files that `select` or reference `sportType` from a `SportTeam` relation (not from `Match`, `Lesson`, etc. which stay singular):

| File | Line(s) | Context |
|------|---------|---------|
| `teams/teams.service.ts` | 41, 92, 131, 432 | findAll filter, create, update, getMyInvitations team select |
| `teams/team-membership.service.ts` | 36+ | listUserTeams include |
| `team-matches/team-matches.service.ts` | 46, 68, 85, 272 | hostTeam select in findAll, findById, findMyApplications |
| `mercenary/mercenary.service.ts` | 38, 68, 152, 186, 393, 414 | team select in findAll, findById, create, apply, myApplications |
| `venues/venues.service.ts` | 125 | team relation select in venue hub |
| `admin/admin.service.ts` | 107, 612 | team listing, team detail selects |
| `tournaments/tournaments.service.ts` | 39, 67, 106 | team select in findAll, findById |
| `lessons/lessons.service.ts` | 226 | team select in lesson detail |
| `admin/dto/create-team-admin.dto.ts` | 30 | `@IsEnum(SportType) sportType` |
| `teams/dto/create-team.dto.ts` | 26 | `@IsEnum(SportType) sportType` |

**NOT affected** (these have their own `sportType` column):
- `matches/matches.service.ts` -- Match model's own sportType
- `scoring/scoring.service.ts` -- reads Match.sportType and SportProfile.sportType
- `payments/payments.service.ts` -- reads Match.sportType via participant
- `team-matches/dto/*.ts` -- TeamMatch model's own sportType
- `mercenary/dto/*.ts` -- MercenaryPost model's own sportType
- `lessons/dto/*.ts` -- Lesson model's own sportType

---

## "구장" Occurrences Classification

| File | Classification | Action |
|------|---------------|--------|
| `team-matches/new/page.tsx` (STEPS, labels) | User-facing form label | Replace with `venueLabel(sportType)` |
| `team-matches/[id]/page.tsx` (line 201) | User-facing detail | Replace |
| `team-matches/[id]/edit/page.tsx` (lines 308-324) | User-facing form | Replace |
| `team-matches/[id]/evaluate/page.tsx` (line 24) | Evaluation criteria text | Replace |
| `matches/new/page.tsx` (placeholder) | Placeholder text | Replace with generic "장소명" |
| `matches/[id]/page.tsx` (lines 256, 765) | Arrival check UI | Replace |
| `chat/[id]/chat-room-embed.tsx` (line 50) | Quick message template | Replace |
| `components/map/matches-map-view.tsx` (line 89) | Help text | Replace with generic "장소" |
| `venues/page.tsx` (line 31) | Mock venue name | Leave (proper noun) |
| `settings/terms/page.tsx` (lines 35, 38) | Legal text | Leave unchanged |
| `lib/skill-grades.ts` (lines 22, 24) | Match type descriptions | Replace |
| `lib/__tests__/team-match-operations.test.ts` (line 42) | Test fixture venue name | Leave (proper noun) |
| `admin/venues/page.tsx` | Admin venue type labels | Leave (generic venue type catalog) |
| `admin/venues/[id]/page.tsx` | Admin venue type options | Leave |

---

## Parallel Work Breakdown

### Key constraint: Schema + all select changes are atomic

Removing the `sport_type` column from `sport_teams` immediately breaks every `select: { sportType: true }` on SportTeam relations across 8 service files. `tsc --noEmit` will fail between these changes. Therefore, the schema migration and ALL cross-service select updates MUST be a single atomic unit assigned to one agent.

### Wave 1: Independent work (all parallel)

| Unit | Agent | Files Owned | Blocked By |
|------|-------|-------------|------------|
| W1-A: Schema + ALL backend sportType->sportTypes | backend-data-dev | `schema.prisma`, `prisma/seed.ts`, `create-team.dto.ts`, `update-team.dto.ts`, `create-team-admin.dto.ts`, `teams.service.ts`, `teams.controller.ts`, `team-membership.service.ts`, `team-matches.service.ts`, `mercenary.service.ts`, `venues.service.ts`, `admin.service.ts`, `tournaments.service.ts`, `lessons.service.ts`, `test/fixtures/teams.ts`, ALL `*.spec.ts` affected | Nothing |
| W1-B: Venue label function | frontend-data-dev | `lib/constants.ts` (add `venueLabel` only) | Nothing |
| W1-C: Profile + Home venue access | frontend-ui-dev | `profile/page.tsx`, `home/home-client.tsx` (Zone 3 venue section only -- do NOT touch Zone 3 team section's sportType reads) | Nothing |

W1-A is large (13+ files) but the changes are mechanical (rename `sportType` to `sportTypes` in selects, add `withPrimarySport` helper). Splitting it across agents would cause `tsc` failures between steps.

### Wave 2: Depends on Wave 1 completion

| Unit | Agent | Files Owned | Blocked By |
|------|-------|-------------|------------|
| W2-A: Team search/sort backend | backend-api-dev | `teams.controller.ts` (add `@Query('search')`, `@Query('sort')`), `teams.service.ts` (findAll search/sort logic) | W1-A (schema finalized, teams.service.ts modified) |
| W2-B: "구장" replacements | frontend-ui-dev | 8 files listed above as "Replace" | W1-B (needs `venueLabel` function) |

**Note on W2-B STEPS constant**: In `team-matches/new/page.tsx`, the `STEPS` array `['종목', '구장/일시', ...]` is defined at module scope. To make the label sport-aware, compute the step label inside the component's render function where `sportType` state is available. Do NOT call `venueLabel()` at module scope.

### Wave 3: Depends on Wave 2

| Unit | Agent | Files Owned | Blocked By |
|------|-------|-------------|------------|
| W3-A: Frontend types + team components | frontend-data-dev | `types/api.ts`, `team-card.tsx`, `teams/new/page.tsx`, `teams/[id]/edit/page.tsx`, `hooks/api/use-teams.ts`, `lib/sport-image.ts` | W1-A (API contract finalized) |
| W3-B: Team list filter/search/sort UI | frontend-ui-dev | `teams-client.tsx`, `team-list.tsx` | W2-A (search/sort API ready) |

### Wave 4: Frontend test updates (after all code changes)

| Unit | Agent | Files Owned | Blocked By |
|------|-------|-------------|------------|
| W4-A: Frontend test updates | frontend-data-dev | `use-api-teams.test.tsx`, `team-match-operations.test.ts`, `test/msw/handlers.ts` | W3-A |

Backend test updates are included in W1-A (same agent, same commit) since the spec files must compile against the new schema.

### Shared File Conflict Map

| File | Touched By | Resolution |
|------|-----------|------------|
| `teams.service.ts` | W1-A, W2-A | Sequential: W1-A completes first |
| `teams.controller.ts` | W1-A (DTO changes), W2-A (query params) | Sequential: same |
| `types/api.ts` | W3-A only | Single owner |
| `hooks/api/use-teams.ts` | W3-A (useMyTeams normalization), W3-B (useTeams params) | Assign to W3-A; W3-B reads the hook but does not modify internals |
| `home-client.tsx` | W1-C (Zone 3 venue section, lines 370+), W3-A (Zone 3 team section sportType reads, lines 286-309) | Non-overlapping line ranges. W1-C appends after marketplace section. W3-A changes `team.sportType` to `team.sportTypes[0]` in existing team section. |

---

## Test Scenarios

### Change 1: Team Multi-Sport

**Happy path**:
- Create team with `sportTypes: ['futsal', 'basketball']` -- succeeds, both stored
- Update team `sportTypes` from `['futsal']` to `['futsal', 'ice_hockey']` -- succeeds
- Filter teams by `sportType=futsal` returns teams that have futsal in their array
- Team detail API returns both `sportType: 'futsal'` (computed) and `sportTypes: ['futsal', 'basketball']`
- TeamCard renders primary sport badge + "+1" indicator for additional sports
- Team creation form: tap futsal chip (selected), tap basketball chip (also selected), both highlighted

**Edge cases**:
- Create team with empty `sportTypes: []` -- rejected by `@ArrayMinSize(1)`
- Create team with duplicate sports `['futsal', 'futsal']` -- handle (deduplicate or reject)
- Team with 11 sports (all of them) -- allowed, display truncates gracefully
- `useMyTeams()` normalization correctly maps `sportTypes` array and provides computed `sportType`

**Error paths**:
- Create team with invalid sport type in array -- 400 validation error
- Filter with invalid sportType query param -- returns empty results (existing behavior)

**Mock updates needed**:
- `apps/api/test/fixtures/teams.ts`: `sportType` -> `sportTypes: [SportType.futsal]`
- `apps/api/src/teams/teams.service.spec.ts`: all mock team objects
- `apps/api/src/team-matches/team-matches.service.spec.ts`: hostTeam mock objects
- `apps/web/src/test/msw/handlers.ts`: membership-wrapped team fixtures
- `apps/web/src/hooks/__tests__/use-api-teams.test.tsx`: mock API responses

### Change 2: Venue Label

**Happy path**:
- `venueLabel('soccer')` returns '구장'
- `venueLabel('ice_hockey')` returns '링크장'
- `venueLabel('basketball')` returns '체육관'
- Team match creation form step label changes based on selected sport

**Edge cases**:
- `venueLabel('unknown_sport')` returns '장소' (generic fallback)
- `venueLabel(undefined)` returns '장소'

### Change 3: Venue Access

**Happy path**:
- Profile page "서비스" section shows venue link, tapping navigates to `/venues`
- Home page Zone 3 shows venue card section with venue cards
- Both venues and existing quick link in Zone 1 coexist (not duplicated -- Zone 1 is navigation, Zone 3 is content preview)

### Change 4: Team List Improvements

**Happy path**:
- Sport filter chips appear above team list; tapping "풋살" shows only futsal teams
- Search input filters teams by name (debounced, ILIKE backend)
- Sort dropdown: "최신순" (default), "멤버 많은순"
- Filters combine: search "서울" + sport "futsal" + sort "memberCount"

**Edge cases**:
- Empty search query returns all teams
- No teams match filter combination -- shows EmptyState with clear filters action
- Search with special characters (SQL injection prevention via Prisma parameterization)

---

## Tech Debt Resolved

| Item | Resolution |
|------|-----------|
| `SportTeam.sportType` single-sport limitation | Replaced with `sportTypes[]` array |
| Hardcoded "구장" across 8+ files | Centralized `venueLabel(sportType)` function |
| Team list has no filtering/search | Backend search/sort + frontend filter UI |
| Venues not accessible from mobile nav | Added to profile service links + home Zone 3 |
| `CreateTeamInput.sportType: string` (weak typing) | Changed to `sportTypes: string[]` with validation |

**Deferred**: None. All items resolved in scope.

---

## Security Notes

### Threat Model

| Threat | Vector | Mitigation |
|--------|--------|------------|
| SQL injection via team search | `search` query parameter | Prisma parameterized queries (already handled by Prisma's `contains` with `mode: 'insensitive'`) |
| Array injection via sportTypes | Oversized array in create/update | `@ArrayMaxSize(11)` validator (max = total sport count) |
| Auth bypass on new endpoints | Search/sort are public (GET /teams already public) | No change needed -- existing auth model applies |
| Admin team creation bypass | `create-team-admin.dto.ts` change | AdminGuard already protects admin endpoints |

### No new attack surface introduced:
- All new query parameters go through existing Prisma parameterization
- No new auth-required endpoints (search/sort extend existing public GET)
- Array field validated with `@IsEnum(SportType, {each: true})` + `@ArrayMinSize(1)` + `@ArrayMaxSize(11)`

---

## Risks & Dependencies

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Migration fails on production data | Low | High | Test migration on staging DB dump first; include rollback SQL |
| Missed `sportType` select breakage | Medium | High | Full list above (13+ locations); run `tsc --noEmit` on apps/api after schema change |
| Frontend `sportType` references break | Medium | Medium | API backward compat field `sportType: sportTypes[0]`; systematic grep before declaring done |
| Home page `home-client.tsx` merge conflicts | Medium | Low | Assign venue section (W1-C) and team sportType updates (W3-A) to non-overlapping line ranges |

---

## Ambiguity Log

| Question | Resolution |
|----------|-----------|
| Keep backward compat `sportType` field? | Yes -- API response includes computed `sportType: sportTypes[0]`. Capacitor mobile app may depend on it. |
| Which "구장" to replace? | Classified above: 8 files replace, 6 files leave (legal text, proper nouns, admin catalogs). |
| Where to add venue access? | Profile page service links + Home Zone 3 card section. Bottom nav stays at 5 items. |
| Deduplicate sportTypes array? | Backend service deduplicates on create/update before DB write. |
