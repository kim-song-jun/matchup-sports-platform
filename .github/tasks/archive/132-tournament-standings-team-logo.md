# Task 132 — Team identity logos across v1

## Scope

- Backend: expose the registered team's current `profile.logoUrl` on public standings rows.
- Frontend: render that URL through the shared `TeamAvatar` in both inline and dedicated bracket standings.
- Audit every v1 team-avatar/profile slot and cover tournament brackets, public team records, and team-match series standings.
- Docs/tests: keep the public tournament detail contract and regression coverage in sync.

## Acceptance Criteria

- [x] A published group/league standing returns `teamLogoUrl` as a nullable field.
- [x] The tournament detail standings render the saved team logo when present.
- [x] The dedicated bracket standings render the same saved team logo when present.
- [x] A missing or failed logo continues to use the existing generated team fallback.
- [x] Tournament bracket team slots render the current team logo.
- [x] Public team record scorecards render both teams' current logos.
- [x] Team-match series standings render each team's current logo.

## Progress Snapshot

- 2026-08-09: Root cause confirmed: standings selected only team id/name, and both standings UIs omitted `logoUrl`.
- 2026-08-09: API unit 23/23, public tournament UI 7/7, and v1 Web TypeScript check passed.
- 2026-08-09: Comprehensive audit found 23 `TeamAvatar` call sites and 4 manual tournament-bracket initial slots; missing logo contracts are grouped into three remaining domains.
- 2026-08-09: Final production audit found 22 rendered `TeamAvatar` call sites, all wired to a logo field; manual tournament team-initial slots are 0. API 23/23, Web 39/39, and both v1 TypeScript checks pass.
