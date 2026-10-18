import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';

// The integration runner enforces an isolated cloned database. Temp tables keep
// the pre-migration row shape on one connection and disappear on transaction commit.
describe('league explicit-start migration existing-data compatibility', () => {
  const prisma = new PrismaClient();
  afterAll(async () => prisma.$disconnect());

  it('preserves every existing column/status and defaults old-version inserts to legacy mode', async () => {
    const migration = readFileSync(join(__dirname, '../../prisma/migrations/20261018123000_v1_league_explicit_start/migration.sql'), 'utf8');
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('CREATE TEMP TABLE v1_tournaments (LIKE public.v1_tournaments INCLUDING ALL) ON COMMIT DROP');
      await tx.$executeRawUnsafe('ALTER TABLE pg_temp.v1_tournaments DROP COLUMN requires_explicit_start');
      await tx.$executeRawUnsafe(`INSERT INTO pg_temp.v1_tournaments
        (id, sport_id, title, kind, status, registration_deadline_at, is_public, deleted_at, updated_at)
        SELECT 'compat-' || s, 'compat-sport', '기존 리그 ' || s, 'regular_league', s::"V1TournamentStatus",
          '2030-01-01'::timestamp, s <> 'on_hold',
          CASE WHEN s = 'cancelled' THEN '2026-01-01'::timestamp ELSE NULL END, '2026-01-01'::timestamp
        FROM unnest(ARRAY['draft','open','closed','in_progress','completed','on_hold','cancelled']) s`);
      const before = await tx.$queryRawUnsafe<Array<{ id: string; row: unknown }>>(
        'SELECT id, to_jsonb(t) AS row FROM pg_temp.v1_tournaments t ORDER BY id');
      await tx.$executeRawUnsafe(migration);
      const after = await tx.$queryRawUnsafe<Array<{ id: string; row: unknown }>>(
        "SELECT id, to_jsonb(t) - 'requires_explicit_start' AS row FROM pg_temp.v1_tournaments t ORDER BY id");
      expect(after).toEqual(before);
      const modes = await tx.$queryRawUnsafe<Array<{ requires_explicit_start: boolean }>>(
        'SELECT requires_explicit_start FROM pg_temp.v1_tournaments');
      expect(modes).toHaveLength(7);
      expect(modes.every(row => row.requires_explicit_start === false)).toBe(true);
      await tx.$executeRawUnsafe(`INSERT INTO pg_temp.v1_tournaments
        (id, sport_id, title, kind, status, updated_at)
        VALUES ('old-version-created', 'compat-sport', '구버전 생성', 'regular_league', 'closed', NOW())`);
      const inserted = await tx.$queryRawUnsafe<Array<{ requires_explicit_start: boolean }>>(
        "SELECT requires_explicit_start FROM pg_temp.v1_tournaments WHERE id = 'old-version-created'");
      expect(inserted).toEqual([{ requires_explicit_start: false }]);
    }, { timeout: 15_000 });
  });
});
