import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';

describe('default public records migration', () => {
  const prisma = new PrismaClient();
  afterAll(async () => prisma.$disconnect());

  it('only initializes usable unconfigured members and preserves private history on replay', async () => {
    const sql = readFileSync(join(__dirname, '../../prisma/migrations/20261023120000_default_public_user_records/migration.sql'), 'utf8');
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('CREATE TEMP TABLE v1_users (LIKE public.v1_users INCLUDING ALL) ON COMMIT DROP');
      await tx.$executeRawUnsafe('CREATE TEMP TABLE v1_user_record_consents (LIKE public.v1_user_record_consents INCLUDING ALL) ON COMMIT DROP');
      await tx.$executeRawUnsafe(`INSERT INTO v1_users (id, account_status, onboarding_status, deleted_at, updated_at)
        VALUES ('unset', 'active', 'completed', NULL, NOW()),
          ('private', 'active', 'completed', NULL, NOW()),
          ('public', 'active', 'completed', NULL, NOW()),
          ('deferred', 'active', 'social_profile_deferred', NULL, NOW()),
          ('signup-done', 'active', 'signup_done', NULL, NOW()),
          ('pending-terms', 'active', 'social_terms_required', NULL, NOW()),
          ('pending-profile', 'active', 'social_profile_required', NULL, NOW()),
          ('not-started', 'active', 'not_started', NULL, NOW()),
          ('suspended', 'suspended', 'completed', NULL, NOW()),
          ('blocked', 'blocked', 'completed', NULL, NOW()),
          ('withdrawing', 'withdrawal_pending', 'completed', NULL, NOW()),
          ('deleted', 'deleted', 'completed', NOW(), NOW()),
          ('soft-deleted', 'active', 'completed', NOW(), NOW())`);
      await tx.$executeRawUnsafe(`INSERT INTO v1_user_record_consents
        (user_id, state, policy_hash, effective_at, updated_at)
        VALUES ('private', 'REVOKED', 'explicit-private', '2026-01-01', '2026-01-01'),
          ('public', 'GRANTED', 'explicit-public', '2026-01-01', '2026-01-01')`);
      const existing = await tx.$queryRawUnsafe('SELECT * FROM v1_user_record_consents ORDER BY user_id');

      await tx.$executeRawUnsafe(sql);
      const preserved = await tx.$queryRawUnsafe("SELECT * FROM v1_user_record_consents WHERE user_id IN ('private', 'public') ORDER BY user_id");
      expect(preserved).toEqual(existing);
      const initialized = await tx.$queryRawUnsafe<Array<{ user_id: string; state: string; policy_hash: string }>>(
        "SELECT user_id, state, policy_hash FROM v1_user_record_consents WHERE user_id NOT IN ('private', 'public') ORDER BY user_id");
      expect(initialized).toEqual(['deferred', 'signup-done', 'unset'].map(user_id => ({
        user_id, state: 'GRANTED', policy_hash: 'v1-public-record-default-2',
      })));

      await tx.$executeRawUnsafe("UPDATE v1_user_record_consents SET state = 'REVOKED', policy_hash = 'changed-after-default' WHERE user_id = 'unset'");
      const beforeReplay = await tx.$queryRawUnsafe('SELECT * FROM v1_user_record_consents ORDER BY user_id');
      await tx.$executeRawUnsafe(sql);
      expect(await tx.$queryRawUnsafe('SELECT * FROM v1_user_record_consents ORDER BY user_id')).toEqual(beforeReplay);
    }, { timeout: 15_000 });
  });
});
