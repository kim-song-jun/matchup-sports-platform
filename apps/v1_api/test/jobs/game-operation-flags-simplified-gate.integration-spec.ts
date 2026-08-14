import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { AdminContextService } from '../../src/common/admin-context.service';
import { GameOperationFlagsService } from '../../src/config/game-operation-flags';
import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * Task: admin on/off for both operation flags without the immutable gate bundle. Whether the
 * shortcut is reachable at all is now a DB-backed switch (`v1_game_operation_gate_settings`
 * singleton row, flipped via `setSimplifiedGate`), not an environment variable -- these specs
 * cover:
 *  1. The single most important behavior: the shortcut is REJECTED while the DB switch is off,
 *     regardless of caller role or payload.
 *  2. `setSimplifiedGate` itself: CAS on `expectedVersion` (VERSION_CONFLICT), rejecting a no-op
 *     flip (GATE_MODE_UNCHANGED), and that it audits with action `OPERATION_GATE_MODE_CHANGED`.
 *  3. Once the switch is on, every safety mechanism `patchFlag` has is still enforced: admin
 *     permission parity, CAS, and transition validity (off<->on only -- both flags are
 *     independent booleans now that the Task 10 GAME_WRITE/GAME_READ cutover, and the frozen
 *     forward order it required, are retired; see `game-operation-flags.ts`'s top-level doc
 *     comment).
 *  4. Audit logging on `simplifiedPatchFlag` still fires, with a `gateMode: 'simplified'` marker
 *     distinguishing this path from the fully gated one in the same `V1OperationAudit` trail.
 */
describe('simplified (DB-gated) operation flag admin toggle', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let service: GameOperationFlagsService;
  const OWNER_USER_ID = '00000000-0000-4000-8000-000000006001';
  const OPS_USER_ID = '00000000-0000-4000-8000-000000006002';
  const SUPPORT_USER_ID = '00000000-0000-4000-8000-000000006003';
  const ORDINARY_USER_ID = '00000000-0000-4000-8000-000000006004';
  const TEST_USER_IDS = [OWNER_USER_ID, OPS_USER_ID, SUPPORT_USER_ID, ORDINARY_USER_ID];

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for the simplified gate integration verification');
    }
    moduleRef = await Test.createTestingModule({
      providers: [PrismaService, AdminContextService, GameOperationFlagsService],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    service = moduleRef.get(GameOperationFlagsService);
    await prisma.$connect();
    await deleteTestRows(prisma);
    for (const userId of TEST_USER_IDS) {
      await prisma.v1User.create({
        data: {
          id: userId,
          email: `simplified-gate-${userId.slice(-4)}@example.test`,
          accountStatus: 'active',
          onboardingStatus: 'completed',
        },
      });
    }
    await prisma.v1AdminUser.createMany({
      data: [
        { id: '00000000-0000-4000-8000-000000006011', userId: OWNER_USER_ID, adminRole: 'owner', status: 'active' },
        { id: '00000000-0000-4000-8000-000000006012', userId: OPS_USER_ID, adminRole: 'ops', status: 'active' },
        { id: '00000000-0000-4000-8000-000000006013', userId: SUPPORT_USER_ID, adminRole: 'support', status: 'active' },
      ],
    });
  });

  beforeEach(async () => {
    await prisma.$executeRaw`
      DELETE FROM v1_idempotency_records
      WHERE actor_user_id IN (${OWNER_USER_ID}, ${OPS_USER_ID}, ${SUPPORT_USER_ID}, ${ORDINARY_USER_ID})
    `;
    await prisma.$executeRaw`DELETE FROM v1_outbox_events WHERE business_key LIKE 'platform-ops-control:%'`;
    await prisma.$executeRaw`TRUNCATE TABLE v1_operation_audits`;
    await prisma.$executeRaw`DELETE FROM v1_game_operation_flags`;
    await prisma.$executeRaw`DELETE FROM v1_game_operation_gate_settings WHERE id = 'singleton'`;
  });

  afterAll(async () => {
    await deleteTestRows(prisma);
    await prisma.$disconnect();
    await moduleRef.close();
  });

  // ── 1. The most important test: the DB switch defaults to off, so the shortcut is unreachable ──
  it('rejects the simplified toggle while the DB gate switch is off, even for an owner with a valid payload', async () => {
    await expect(
      service.simplifiedPatchFlag(
        OWNER_USER_ID,
        'PUBLIC_LIVE',
        { expectedVersion: 0, value: 'on', reason: 'trying to skip the gate while the switch is off' },
        'gate-off-reject-1',
      ),
    ).rejects.toMatchObject({
      response: { code: 'SIMPLIFIED_GATE_DISABLED' },
    });
    expect(await auditRowsFor('PUBLIC_LIVE')).toHaveLength(0);
    await expect(service.getFlag(OWNER_USER_ID, 'PUBLIC_LIVE')).resolves.toMatchObject({
      value: 'off',
      version: 0,
    });
  });

  // ── 2. setSimplifiedGate: the switch itself is CAS'd and audited ──
  describe('setSimplifiedGate', () => {
    it('rejects a stale expectedVersion (CAS conflict)', async () => {
      await service.getSimplifiedGateStatus(OWNER_USER_ID); // ensures the singleton row exists
      await expect(
        service.setSimplifiedGate(
          OWNER_USER_ID,
          { expectedVersion: 5, enabled: true, reason: 'stale version must be rejected' },
          'gate-cas-stale',
        ),
      ).rejects.toMatchObject({ response: { code: 'VERSION_CONFLICT' } });
    });

    it('rejects a no-op flip (already in the requested state)', async () => {
      await expect(
        service.setSimplifiedGate(
          OWNER_USER_ID,
          { expectedVersion: 0, enabled: false, reason: 'already off, this must not audit a no-op' },
          'gate-noop',
        ),
      ).rejects.toMatchObject({ response: { code: 'GATE_MODE_UNCHANGED' } });
    });

    it('turns the gate on, after which the simplified toggle becomes immediately reachable, and audits OPERATION_GATE_MODE_CHANGED', async () => {
      const enabled = await service.setSimplifiedGate(
        OWNER_USER_ID,
        { expectedVersion: 0, enabled: true, reason: 'owner enabling the simplified path' },
        'gate-on-1',
      );
      expect(enabled).toMatchObject({ enabled: true, version: 1, updatedByUserId: OWNER_USER_ID });

      const audits = await prisma.$queryRaw<
        Array<{ action: string; after: { simplifiedGateEnabled?: boolean; version?: number } }>
      >`
        SELECT action, after FROM v1_operation_audits
        WHERE resource_type = 'operation_gate' AND resource_id = 'simplified'
      `;
      expect(audits).toHaveLength(1);
      expect(audits[0].action).toBe('OPERATION_GATE_MODE_CHANGED');
      expect(audits[0].after).toMatchObject({ simplifiedGateEnabled: true, version: 1 });

      // Now reachable, and succeeds immediately -- both flags are independent booleans with no
      // prerequisite ordering (the Task 10 frozen-order invariant this used to also prove is
      // retired along with GAME_WRITE/GAME_READ).
      const toggled = await service.simplifiedPatchFlag(
        OWNER_USER_ID,
        'PUBLIC_LIVE',
        { expectedVersion: 0, value: 'on', reason: 'gate now enabled' },
        'gate-now-on-attempt',
      );
      expect(toggled).toMatchObject({ value: 'on', version: 1, updatedByUserId: OWNER_USER_ID });
    });
  });

  // ── 3. Once enabled: permission parity, CAS, and transition validity ──
  describe('with the DB gate switch enabled', () => {
    beforeEach(async () => {
      await service.setSimplifiedGate(
        OWNER_USER_ID,
        { expectedVersion: 0, enabled: true, reason: 'test setup: enable simplified gate' },
        `gate-enable-${randomUUID()}`,
      );
    });

    it('still requires the same ops/owner admin level as the gated path', async () => {
      await expect(
        service.simplifiedPatchFlag(
          SUPPORT_USER_ID,
          'PUBLIC_LIVE',
          { expectedVersion: 0, value: 'on', reason: 'support cannot mutate' },
          'perm-support',
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        service.simplifiedPatchFlag(
          ORDINARY_USER_ID,
          'PUBLIC_LIVE',
          { expectedVersion: 0, value: 'on', reason: 'ordinary user cannot mutate' },
          'perm-ordinary',
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        service.simplifiedPatchFlag(
          OPS_USER_ID,
          'PUBLIC_LIVE',
          { expectedVersion: 0, value: 'on', reason: 'ops is allowed to mutate, same as owner' },
          'perm-ops',
        ),
      ).resolves.toMatchObject({ value: 'on', version: 1, updatedByUserId: OPS_USER_ID });
    });

    // NOTE: a "rejects a key outside the allowlist" test was deleted rather than kept as a fake
    // pass -- `SIMPLIFIED_GATE_ALLOWED_KEYS` now equals the full `GameOperationFlagKey` set (both
    // members, since GAME_WRITE/GAME_READ were retired -- see game-operation-flags.ts), and
    // `parseFlagKey` rejects any other string with `INVALID_OPERATION_FLAG` before the allowlist
    // check ever runs, so `SIMPLIFIED_GATE_KEY_NOT_ALLOWED` is unreachable through any real call
    // and there is no way to exercise it without mocking internals (which `CLAUDE.md`'s "가짜
    // 테스트 금지" rule out).

    it('rejects a value outside off/on for the allowed keys', async () => {
      await expect(
        service.simplifiedPatchFlag(
          OWNER_USER_ID,
          'PUBLIC_LIVE',
          { expectedVersion: 0, value: 'legacy', reason: 'not a boolean value' },
          'value-invalid',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a stale expectedVersion (CAS conflict)', async () => {
      await service.getFlag(OWNER_USER_ID, 'PUBLIC_LIVE'); // ensureDefaults
      await expect(
        service.simplifiedPatchFlag(
          OWNER_USER_ID,
          'PUBLIC_LIVE',
          { expectedVersion: 5, value: 'on', reason: 'stale version must be rejected' },
          'cas-stale',
        ),
      ).rejects.toMatchObject({ response: { code: 'VERSION_CONFLICT' } });
    });

    // ── 4. Both flags promote off->on directly -- no prerequisite ordering between them ──
    it('allows DIRECTOR_OFFICIALIZE off->on directly, with no dependency on PUBLIC_LIVE (independent booleans)', async () => {
      const toggled = await service.simplifiedPatchFlag(
        OWNER_USER_ID,
        'DIRECTOR_OFFICIALIZE',
        { expectedVersion: 0, value: 'on', reason: 'enable director officialize independently' },
        'independent-director',
      );
      expect(toggled).toMatchObject({ value: 'on', version: 1 });

      const auditRow = await prisma.$queryRaw<Array<{ after: { gateMode?: string } }>>`
        SELECT after FROM v1_operation_audits WHERE resource_id = 'DIRECTOR_OFFICIALIZE'
      `;
      expect(auditRow).toHaveLength(1);
      expect(auditRow[0].after).toMatchObject({ gateMode: 'simplified' });
    });

    // ── 5. Rollback (on->off) is always available as an escape hatch ──
    it('allows PUBLIC_LIVE on->off rollback at any time, replays idempotently, and audits with gateMode: simplified', async () => {
      await forcePublicLiveOn();
      const input = {
        expectedVersion: 1,
        value: 'off',
        reason: 'roll back public live exposure',
      };
      const first = await service.simplifiedPatchFlag(OWNER_USER_ID, 'PUBLIC_LIVE', input, 'rollback-1');
      expect(first).toMatchObject({ value: 'off', version: 2, updatedByUserId: OWNER_USER_ID });

      const replay = await service.simplifiedPatchFlag(OWNER_USER_ID, 'PUBLIC_LIVE', input, 'rollback-1');
      expect(replay).toEqual(first);

      const audits = await prisma.$queryRaw<Array<{ after: { gateMode?: string; value?: string } }>>`
        SELECT after FROM v1_operation_audits WHERE resource_id = 'PUBLIC_LIVE'
      `;
      expect(audits).toHaveLength(1);
      expect(audits[0].after).toMatchObject({ gateMode: 'simplified', value: 'off' });
    });
  });

  // ── helpers ──────────────────────────────────────────────────────────────

  async function auditRowsFor(resourceId: string) {
    return prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM v1_operation_audits WHERE resource_id = ${resourceId}
    `;
  }

  /** Directly advances PUBLIC_LIVE to `on@v1` via raw SQL, bypassing all app-level checks, purely
   * to set up the rollback test's starting state without depending on the forward-transition path. */
  async function forcePublicLiveOn() {
    await service.getFlag(OWNER_USER_ID, 'PUBLIC_LIVE'); // ensureDefaults
    await prisma.$executeRaw`
      UPDATE v1_game_operation_flags
      SET value = 'on', version = 1, owner_actor = 'platform_ops', updated_at = CURRENT_TIMESTAMP
      WHERE key = 'PUBLIC_LIVE'::"V1GameOperationFlagKey"
    `;
  }
});

async function deleteTestRows(prisma: PrismaService) {
  const OWNER_USER_ID = '00000000-0000-4000-8000-000000006001';
  const OPS_USER_ID = '00000000-0000-4000-8000-000000006002';
  const SUPPORT_USER_ID = '00000000-0000-4000-8000-000000006003';
  const ORDINARY_USER_ID = '00000000-0000-4000-8000-000000006004';
  const TEST_USER_IDS = [OWNER_USER_ID, OPS_USER_ID, SUPPORT_USER_ID, ORDINARY_USER_ID];
  await prisma.$executeRaw`
    DELETE FROM v1_idempotency_records
    WHERE actor_user_id IN (${OWNER_USER_ID}, ${OPS_USER_ID}, ${SUPPORT_USER_ID}, ${ORDINARY_USER_ID})
  `;
  await prisma.$executeRaw`DELETE FROM v1_outbox_events WHERE business_key LIKE 'platform-ops-control:%'`;
  await prisma.$executeRaw`TRUNCATE TABLE v1_operation_audits`;
  await prisma.v1AdminUser.deleteMany({ where: { userId: { in: TEST_USER_IDS } } });
  await prisma.v1User.deleteMany({ where: { id: { in: TEST_USER_IDS } } });
}
