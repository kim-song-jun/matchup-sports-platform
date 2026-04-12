# Dev Mock Data Seed And Public Assets Implementation Plan

Status: Implemented on 2026-04-11. Scope expanded to deploy checksum gate, empty-DB bootstrap fallback, and broader mock catalog.

**Goal:** Add an idempotent dev mock data seed command plus public mock assets that the dataset can reference directly.

**Architecture:** Keep destructive full seed untouched and add a separate sync-style mock seeding path. The new script will upsert a small canonical dataset using stable natural keys, then reuse the existing image sync layer so teams, matches, lessons, venues, and listings land on local public mock assets. Public profile mock assets will live under `apps/web/public/mock/` so backend-seeded URLs and frontend rendering share the same contract.

**Tech Stack:** Prisma, ts-node seed scripts, Next.js public assets, Makefile, pnpm workspace commands

**Implementation Notes (Completed):**
- Added `SeedSyncState` checksum table plus deploy-gated `seed-mocks.ts --checksum-gate`
- Added `bootstrap-deploy-db.ts` so empty production DBs bootstrap with `db push + migrate resolve` while existing DBs stay on `migrate deploy`
- Wired GitHub Actions deploy and `deploy/setup-ec2.sh` to run the shared DB bootstrap entrypoint plus mock checksum validation by default
- Expanded canonical dataset to 12 users / 10 venues / 10 teams / 11 matches / 8 lessons / 10 listings / 8 mercenary posts / 6 team matches / 6 badges
- Expanded profile asset pack to `profile-01.svg` ~ `profile-12.svg`

---

### Task 1: Canonical task and script surface

**Files:**
- Create: `.github/tasks/47-dev-mock-data-seed-and-public-assets.md`
- Create: `docs/plans/2026-04-11-dev-mock-data-seed-and-public-assets.md`
- Modify: `apps/api/package.json`
- Modify: `Makefile`

**Step 1: Write the failing test**

Document the command contract first:
- `pnpm --filter api db:seed:mocks`
- `make db-seed-mocks`

Expected current state:
- command does not exist

**Step 2: Run test to verify it fails**

Run: `pnpm --filter api db:seed:mocks`
Expected: script-not-found failure

**Step 3: Write minimal implementation**

Add:
- `apps/api/package.json` -> `db:seed:mocks`
- `Makefile` -> `db-seed-mocks`

**Step 4: Run test to verify it passes**

Run: `docker compose exec -T api sh -lc 'cd /app/apps/api && pnpm db:seed:mocks'`
Expected: script boots and prints mock sync summary

**Step 5: Commit**

```bash
git add .github/tasks/47-dev-mock-data-seed-and-public-assets.md docs/plans/2026-04-11-dev-mock-data-seed-and-public-assets.md apps/api/package.json Makefile
git commit -m "feat: add dev mock seed command"
```

### Task 2: Canonical mock data catalog and sync script

**Files:**
- Create: `apps/api/prisma/mock-data-catalog.ts`
- Create: `apps/api/prisma/seed-mocks.ts`
- Modify: `apps/api/prisma/seed-images.ts` only if shared helper extraction is useful
- Reuse: `apps/api/prisma/mock-image-catalog.ts`
- Reuse: `apps/api/prisma/sync-image-data.ts`

**Step 1: Write the failing test**

Define success conditions:
- rerun does not duplicate managed mock users
- rerun does not duplicate managed teams/venues/lessons/listings/matches
- managed dataset gets images after sync

**Step 2: Run test to verify it fails**

Run:
- `docker compose exec -T api sh -lc 'cd /app/apps/api && pnpm db:seed:mocks'`
- query counts for managed natural keys

Expected before implementation:
- command missing or no managed records

**Step 3: Write minimal implementation**

Implement:
- canonical users with stable emails/nicknames and `profileImageUrl`
- canonical venues, teams, matches, lessons, listings, mercenary posts, team matches
- natural-key based `findFirst + update/create` helpers
- final `syncImageData(prisma)` call
- concise summary logging for created/updated counts

**Step 4: Run test to verify it passes**

Run:
- `docker compose exec -T api sh -lc 'cd /app/apps/api && pnpm db:seed:mocks'`
- rerun same command
- DB query for managed records

Expected:
- no duplicate growth on rerun
- image fields filled on managed records

**Step 5: Commit**

```bash
git add apps/api/prisma/mock-data-catalog.ts apps/api/prisma/seed-mocks.ts
git commit -m "feat: add idempotent dev mock dataset sync"
```

### Task 3: Public mock assets for profile-driven surfaces

**Files:**
- Create: `apps/web/public/mock/profile/profile-01.svg`
- Create: `apps/web/public/mock/profile/profile-02.svg`
- Create: `apps/web/public/mock/profile/profile-03.svg`
- Create: `apps/web/public/mock/profile/profile-04.svg`
- Create: `apps/web/public/mock/profile/profile-05.svg`
- Create: `apps/web/public/mock/profile/profile-06.svg`

**Step 1: Write the failing test**

Define contract:
- every canonical mock user references an existing `public/mock/profile/*.svg` asset

**Step 2: Run test to verify it fails**

Run:
- `rg -n "/mock/profile/" apps/api/prisma`
- `rg --files apps/web/public/mock/profile`

Expected before implementation:
- referenced profile assets absent

**Step 3: Write minimal implementation**

Add six lightweight SVG mock avatars with distinct visual identities.

**Step 4: Run test to verify it passes**

Run:
- `rg --files apps/web/public/mock/profile`
- optional browser smoke on a page that renders `profileImageUrl`

Expected:
- assets exist and load as static files

**Step 5: Commit**

```bash
git add apps/web/public/mock/profile
git commit -m "feat: add public mock profile assets"
```

### Task 4: Docs and verification

**Files:**
- Modify: `README.md`
- Modify: `docs/WORK_SUMMARY.md`

**Step 1: Write the failing test**

Document the missing operator/developer path:
- how to run mock sync
- how it differs from destructive full seed

**Step 2: Run test to verify it fails**

Run: `rg -n "db:seed:mocks|db-seed-mocks" README.md docs/WORK_SUMMARY.md`
Expected: no results

**Step 3: Write minimal implementation**

Add command docs and a short summary of the new mock data/public asset contract.

**Step 4: Run test to verify it passes**

Run:
- `pnpm --filter api build`
- `pnpm --filter web exec tsc --noEmit`
- `docker compose exec -T api sh -lc 'cd /app/apps/api && pnpm db:seed:mocks'`
- `docker compose exec -T api sh -lc 'cd /app/apps/api && pnpm db:seed:mocks'`
- `docker compose exec -T api sh -lc 'cd /app/apps/api && pnpm db:seed:images'`

Expected:
- build/typecheck pass
- rerun remains idempotent

**Step 5: Commit**

```bash
git add README.md docs/WORK_SUMMARY.md
git commit -m "docs: add dev mock seed workflow"
```
