# Diversify Image Data Deploy Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Seed/demo/production-safe image data를 DB에 채워 카드 중복을 줄이고 배포 시 자동 보강되게 만든다.

**Architecture:** Prisma schema는 프론트가 이미 기대하는 최소 image field만 보강하고, 운영에서는 destructive full seed 대신 idempotent image sync script를 따로 실행한다. 프론트는 새 DB image field를 우선 사용하되 런타임 fallback은 그대로 유지한다.

**Tech Stack:** Prisma 6, NestJS 11, Next.js 15, Make, GitHub Actions

---

### Task 1: Align schema for DB-backed match/team images

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260408030000_add_match_image_and_team_photos/migration.sql`

**Steps:**
1. Add nullable `Match.imageUrl` mapped to `image_url`.
2. Add `SportTeam.photos` string array mapped to `photos`.
3. Generate a manual SQL migration matching the Prisma schema.
4. Run Prisma client generation.

### Task 2: Add idempotent image sync logic

**Files:**
- Create: `apps/api/prisma/mock-image-catalog.ts`
- Create: `apps/api/prisma/sync-image-data.ts`
- Create: `apps/api/prisma/seed-images.ts`
- Modify: `apps/api/prisma/seed.ts`
- Modify: `apps/api/package.json`

**Steps:**
1. Define the local photoreal catalog and deterministic rotation helpers.
2. Implement a sync function that preserves remote images and only refreshes system-managed local mock fields.
3. Wire `seed.ts` to call the sync function after base data creation.
4. Expose a dedicated `db:seed:images` script for safe re-runs.

### Task 3: Consume DB-backed images in the frontend

**Files:**
- Modify: `apps/web/src/app/(main)/home/page.tsx`
- Modify: `apps/web/src/app/(main)/matches/page.tsx`
- Modify: `apps/web/src/app/(main)/matches/[id]/page.tsx`

**Steps:**
1. Prefer `match.imageUrl` and venue image galleries from DB.
2. Keep `SafeImage` runtime fallback intact.
3. Ensure detail galleries can rotate through DB-provided images.

### Task 4: Make deploy and dev commands run the safe image sync

**Files:**
- Modify: `Makefile`
- Modify: `.github/workflows/deploy.yml`
- Modify: `README.md`
- Modify: `deploy/DEPLOY_GUIDE.md`
- Modify: `AGENTS.md`
- Modify: `.claude/agents/workflow.md`
- Modify: `.claude/agents/prompts.md`

**Steps:**
1. Add `make db-seed-images`.
2. Run image sync automatically after migrate / optional seed in deploy workflow.
3. Document the distinction between destructive full seed and deploy-safe image sync.
4. Re-run type checks and diff validation.
