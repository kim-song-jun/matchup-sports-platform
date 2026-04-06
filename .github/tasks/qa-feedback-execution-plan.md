# QA Feedback Execution Plan

Date: 2026-04-05
Source: QA tester comprehensive bug/feature report (19 items)

---

## Priority Matrix

### P0 — Security / Data Integrity (MUST fix before any deployment)

| # | Issue | Backend | Frontend | Complexity | Dep |
|---|-------|---------|----------|-----------|-----|
| 16 | Admin API completely unprotected — ALL users can access `/admin/*`. AdminGuard exists but role check is commented out. `UserRole` enum already in Prisma schema. | `admin.guard.ts`, `admin.controller.ts` (add `@UseGuards(JwtAuthGuard, AdminGuard)`) | `apps/web/src/app/admin/*` (add client-side role check) | **S** | None |
| — | No ownership checks on team-match approve/reject — any authenticated user can approve/reject any application | `team-matches.controller.ts` (inject `@CurrentUser`), `team-matches.service.ts` (add host team ownership validation) | — | **S** | None |

**Estimated effort: 1-2 hours**

---

### P1 — Core UX Broken (blocking normal user flows)

| # | Issue | Backend | Frontend | Complexity | Dep |
|---|-------|---------|----------|-----------|-----|
| 3 | "모집글 수정" visible to non-authenticated users on `/team-matches/:id` | — | `team-matches/[id]/page.tsx` (conditionally render edit button based on auth + ownership) | **S** | None |
| 4, 14 | "경기 신청" doesn't let user pick which team to apply with | `team-matches.controller.ts` (pass `@CurrentUser` to apply, validate team membership) | `team-matches/[id]/page.tsx` (add team selection modal on apply) | **M** | Need API: GET user's teams |
| 10 | No mutual confirmation view — host can't see applicants, applicant can't see status | `team-matches.controller.ts` (add GET `/:id/applications` endpoint) | New section in `team-matches/[id]/page.tsx` or `my/team-matches/page.tsx` | **L** | P0 ownership fix |
| 12, 13 | Creating team-match post doesn't require team selection or role permission | `team-matches.controller.ts` (validate `@CurrentUser` is owner/manager of selected team) | `team-matches/new/page.tsx` (add team selector, enforce role) | **M** | Need API: GET user's teams with roles |
| 1 | "연락하기" button on `/teams/:id` doesn't work when not logged in | — | `teams/[id]/page.tsx` (redirect to login or show login prompt) | **S** | None |
| 2 | Mercenary apply shows message only, no login redirect | — | Mercenary detail page (replace alert with redirect to `/login?redirect=...`) | **S** | None |
| 15 | Team-match detail doesn't show host team info | Backend already has `hostTeamId` in schema — need to include team data in response | `team-matches/[id]/page.tsx` (render host team card) | **S** | None |

**Estimated effort: 8-12 hours**

---

### P2 — UX Improvements (not blocking but significantly degraded experience)

| # | Issue | Backend | Frontend | Complexity | Dep |
|---|-------|---------|----------|-----------|-----|
| 5 | Sidebar shows fake unread count badges from mock data | — | `chat-store.ts`, `notification-store.ts` (set initial counts to 0 or remove mock data) | **S** | None |
| 6 | `/teams` — no "My Teams" section at top, my teams mixed into general list | Need API: GET `/teams/my` or filter param | `teams/page.tsx`, `team-list.tsx` (add "My Teams" section, exclude from general list) | **M** | Auth |
| 7 | `/teams/:id` (own team) — shows Join/Contact buttons for own team | — | `teams/[id]/page.tsx` (check if current user is member, conditionally hide/show buttons) | **S** | Auth store + team membership check |
| 8 | "최근경기 전체보기" links to global matches instead of team-specific | Need API: GET `/teams/:id/matches` or query param | `teams/[id]/page.tsx` (fix link to filter by team) | **S** | None |
| 9 | "용병모집중" shows ALL mercenary posts, not team-specific | Need API: GET `/mercenary?teamId=:id` (already filterable if backend supports it) | `teams/[id]/page.tsx` (pass teamId filter) | **S** | Mercenary service needs teamId filter |
| 11 | `/team-matches` — my team's active postings not shown at top | — | `team-matches/page.tsx` (fetch + display my postings section at top) | **M** | Auth + "my teams" API |

**Estimated effort: 6-8 hours**

---

### P3 — Nice-to-Have / Deferred

| # | Issue | Reason to defer | Complexity |
|---|-------|----------------|-----------|
| 17 | `/profile` — "다가오는 일정 전체보기" label change to "매칭 찾기" | Copy change only, trivial | **S** |
| 18 | `/profile` — "내가 만든 매치" shows history instead of separation | Needs UX design for proper tabs/separation | **M** |
| 19 | `/profile` — Can't create mercenary posts; no past/active status separation | Mercenary is entirely in-memory mock — needs DB schema first (model `MercenaryPost` does not exist in Prisma). Blocked until mercenary DB migration. | **L** |

---

## Execution Order

Following commit convention: cleanup -> db -> backend -> frontend -> tests

### Phase 1: Security Hotfix (P0) — Branch: `fix/admin-auth-guard`
```
Commit order:
1. fix: enable role-based admin guard with UserRole enum check
   - apps/api/src/common/guards/admin.guard.ts (uncomment + fix role check)
   - apps/api/src/admin/admin.controller.ts (add @UseGuards(JwtAuthGuard, AdminGuard))
   - apps/api/src/admin/admin.module.ts (ensure guard is provided)

2. fix: add ownership validation to team-match approve/reject
   - apps/api/src/team-matches/team-matches.controller.ts (inject @CurrentUser to approve/reject)
   - apps/api/src/team-matches/team-matches.service.ts (validate hostTeamId ownership)
```

### Phase 2: Auth Consistency (P1 quick wins) — Branch: `fix/auth-guards-frontend`
```
3. fix: redirect unauthenticated users to login on protected actions
   - teams/[id]/page.tsx (contact button)
   - mercenary detail page (apply button)
   - team-matches/[id]/page.tsx (hide edit button for non-owners)
```

### Phase 3: Team-Match Core Flow (P1 main) — Branch: `feat/team-match-flow`
```
4. feat: add user's teams endpoint for team selection
   - apps/api/src/teams/teams.controller.ts (GET /teams/my)
   - apps/api/src/teams/teams.service.ts

5. feat: require team selection and role check for team-match creation
   - apps/api/src/team-matches/team-matches.controller.ts (inject @CurrentUser to create)
   - apps/api/src/team-matches/team-matches.service.ts (validate team role)
   - apps/web — team-matches/new/page.tsx (team selector UI)

6. feat: require team selection for team-match application
   - Backend: validate applicant team membership
   - Frontend: team selection modal on apply

7. feat: add team-match applications view (mutual confirmation)
   - apps/api/src/team-matches/team-matches.controller.ts (GET /:id/applications)
   - Frontend: applications list for host, status view for applicant

8. feat: show host team info on team-match detail
   - Backend: include team relation in findOne response
   - Frontend: render host team card
```

### Phase 4: UX Polish (P2) — Branch: `fix/ux-improvements`
```
9.  fix: remove mock badge counts from sidebar stores
10. feat: add "My Teams" section to teams list page
11. fix: hide join/contact buttons on own team page
12. fix: link recent matches and mercenary to team-specific views
13. feat: show my active postings at top of team-matches list
```

### Phase 5: Deferred Items (P3)
```
DEFER: #17 — trivial label change, bundle with next profile update
DEFER: #18 — needs UX design decision on profile match tabs
DEFER: #19 — BLOCKED on MercenaryPost Prisma model creation (no schema exists)
         This is a significant effort: schema design, migration, service rewrite
         from in-memory to Prisma. Recommend as separate epic.
```

---

## Risks & Blockers

| Risk | Impact | Mitigation |
|------|--------|-----------|
| AdminGuard fix could lock out dev/test users | Medium | Ensure dev-login seeded user has `role: admin` in DB |
| Mercenary service is 100% in-memory mock — any mercenary-related fix is fragile | High | Only fix filtering (P2 #9) for now; full DB migration is a separate epic |
| `@CurrentUser` decorator may not be wired correctly in team-matches module | Medium | Verify auth module is imported in TeamMatchesModule |
| Team role check requires TeamMember model query — need to confirm TeamMember schema has role field | Low | Schema has `TeamMember` with role — verify via Prisma |
| "My teams" API doesn't exist yet — multiple P1/P2 items depend on it | High | Build this first in Phase 3 step 4 |

---

## Dependency Graph

```
P0: AdminGuard fix ─────────────────────────────────> DEPLOY
P0: Ownership check ────────────────────────────────> DEPLOY
                                                        |
P1: Auth redirects (quick wins) ────────────────────> DEPLOY
                                                        |
P1: GET /teams/my ──┬── team-match create (team selector)
                    ├── team-match apply (team selector)
                    ├── applications view
                    └── P2: my teams section, my postings
                                                        |
P2: Mock badge cleanup (independent) ──────────────> DEPLOY
P2: Team-specific links (independent) ─────────────> DEPLOY
                                                        |
P3: Profile fixes ─── DEFER
P3: Mercenary DB ──── DEFER (separate epic)
```

---

## Summary

- **Total items**: 19 QA findings + 2 backend-only issues discovered in scan
- **P0 (security)**: 2 items — immediate fix required
- **P1 (core UX)**: 7 items — next sprint
- **P2 (improvements)**: 6 items — same sprint if capacity allows
- **P3 (deferred)**: 3 items — backlog / separate epic
- **Estimated total effort**: 16-24 hours (P0-P2), excluding P3
