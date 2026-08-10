import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AdminContextService } from '../../src/common/admin-context.service';
import {
  GameOperationFlagsService,
  resolveGameOperationGateRoot,
} from '../../src/config/game-operation-flags';
import type { GameOperationFlagKey } from '../../src/config/game-operation-flags';
import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * Task: admin on/off for all four operation flags without the immutable gate bundle. Whether the
 * shortcut is reachable at all is now a DB-backed switch (`v1_game_operation_gate_settings`
 * singleton row, flipped via `setSimplifiedGate`), not an environment variable -- these specs
 * cover:
 *  1. The single most important behavior: the shortcut is REJECTED while the DB switch is off,
 *     regardless of caller role or payload.
 *  2. `setSimplifiedGate` itself: CAS on `expectedVersion` (VERSION_CONFLICT), rejecting a no-op
 *     flip (GATE_MODE_UNCHANGED), and that it audits with action `OPERATION_GATE_MODE_CHANGED`.
 *  3. Once the switch is on, every safety mechanism `patchFlag` has is still enforced:
 *     admin permission parity, CAS, transition validity, and -- deliberately preserved, not
 *     relaxed -- the frozen cutover order (`assertFrozenForwardOrder`), independent of any
 *     gate-bundle evidence.
 *  4. Audit logging on `simplifiedPatchFlag` still fires, with a `gateMode: 'simplified'` marker
 *     distinguishing this path from the fully gated one in the same `V1OperationAudit` trail.
 */
describe('simplified (DB-gated) operation flag admin toggle', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let service: GameOperationFlagsService;
  const EVIDENCE_ROOT = resolveGameOperationGateRoot();
  const BASELINE_SHA = 'a'.repeat(40);
  const CANDIDATE_SHA = 'b'.repeat(40);
  const PLAN_SHA = 'c'.repeat(64);
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
    await prisma.$executeRaw`DELETE FROM v1_game_cutover_epochs WHERE id = 'game-cutover'`;
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

    it('turns the gate on, after which the simplified toggle becomes reachable, and audits OPERATION_GATE_MODE_CHANGED', async () => {
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

      // Now reachable -- still order-gated, proving the shortcut skips only the gate-bundle
      // paperwork, never the frozen cutover order.
      await expect(
        service.simplifiedPatchFlag(
          OWNER_USER_ID,
          'PUBLIC_LIVE',
          { expectedVersion: 0, value: 'on', reason: 'gate now enabled' },
          'gate-now-on-attempt',
        ),
      ).rejects.toMatchObject({ response: { code: 'CUTOVER_ORDER_VIOLATION' } });
    });
  });

  // ── 3. Once enabled: permission parity, transition validity, frozen order for all four keys ──
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
          { expectedVersion: 0, value: 'on', reason: 'ops is allowed to attempt (still blocked by frozen order)' },
          'perm-ops',
        ),
      ).rejects.toMatchObject({ response: { code: 'CUTOVER_ORDER_VIOLATION' } });
    });

    // NOTE: the previous "rejects a latched flag key (GAME_WRITE/GAME_READ)" test was deleted
    // rather than kept as a fake pass -- `SIMPLIFIED_GATE_ALLOWED_KEYS` now contains all four
    // members of `GameOperationFlagKey`, and `parseFlagKey` rejects any other string with
    // `INVALID_OPERATION_FLAG` before the allowlist check ever runs, so `SIMPLIFIED_GATE_KEY_NOT_ALLOWED`
    // is unreachable through any real call and there is no way to exercise it without mocking
    // internals (which `assertReceiptIdentity`/CLAUDE.md's "가짜 테스트 금지" rules this project
    // out). See tests 5/6 below for GAME_WRITE/GAME_READ now going through this path instead.

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

    // ── 4. The key finding: frozen cutover order is preserved, not relaxed ──
    it('rejects PUBLIC_LIVE off->on while GAME_WRITE/GAME_READ remain legacy (matches alpha today)', async () => {
      await service.getFlag(OWNER_USER_ID, 'PUBLIC_LIVE'); // ensureDefaults: GAME_WRITE=legacy, GAME_READ=legacy
      await expect(
        service.simplifiedPatchFlag(
          OWNER_USER_ID,
          'PUBLIC_LIVE',
          { expectedVersion: 0, value: 'on', reason: 'reveal live scores before migration completes' },
          'frozen-order-public-live',
        ),
      ).rejects.toMatchObject({ response: { code: 'CUTOVER_ORDER_VIOLATION' } });
      await expect(
        service.simplifiedPatchFlag(
          OWNER_USER_ID,
          'DIRECTOR_OFFICIALIZE',
          { expectedVersion: 0, value: 'on', reason: 'same invariant applies to the other boolean flag' },
          'frozen-order-director',
        ),
      ).rejects.toMatchObject({ response: { code: 'CUTOVER_ORDER_VIOLATION' } });
      expect(await auditRowsFor('PUBLIC_LIVE')).toHaveLength(0);
      expect(await auditRowsFor('DIRECTOR_OFFICIALIZE')).toHaveLength(0);
    });

    // ── 5. The frozen order also protects the newly-allowed GAME_WRITE/GAME_READ keys ──
    it('rejects GAME_WRITE legacy->new while GAME_READ is still legacy (order invariant survives the simplified path)', async () => {
      await service.getFlag(OWNER_USER_ID, 'GAME_WRITE'); // ensureDefaults: GAME_READ=legacy too
      await expect(
        service.simplifiedPatchFlag(
          OWNER_USER_ID,
          'GAME_WRITE',
          { expectedVersion: 0, value: 'new', reason: 'skip ahead without advancing GAME_READ first' },
          'order-write-before-read',
        ),
      ).rejects.toMatchObject({ response: { code: 'CUTOVER_ORDER_VIOLATION' } });
      expect(await auditRowsFor('GAME_WRITE')).toHaveLength(0);
    });

    // ── 6. GAME_READ legacy->compare, then GAME_WRITE legacy->new, in the frozen order: succeeds ──
    it('allows GAME_READ legacy->compare then GAME_WRITE legacy->new through the simplified path', async () => {
      await service.getFlag(OWNER_USER_ID, 'GAME_READ'); // ensureDefaults
      const read = await service.simplifiedPatchFlag(
        OWNER_USER_ID,
        'GAME_READ',
        { expectedVersion: 0, value: 'compare', reason: 'advance read authority to compare first' },
        'order-read-compare',
      );
      expect(read).toMatchObject({ value: 'compare', version: 1 });

      const write = await service.simplifiedPatchFlag(
        OWNER_USER_ID,
        'GAME_WRITE',
        { expectedVersion: 0, value: 'new', reason: 'advance write authority once read is compare' },
        'order-write-after-read',
      );
      expect(write).toMatchObject({ value: 'new', version: 1 });

      const writeAudit = await prisma.$queryRaw<Array<{ after: { gateMode?: string } }>>`
        SELECT after FROM v1_operation_audits WHERE resource_id = 'GAME_WRITE'
      `;
      expect(writeAudit).toHaveLength(1);
      expect(writeAudit[0].after).toMatchObject({ gateMode: 'simplified' });
    });

    // ── 7. Rollback (on->off) is not order-gated, and always available as an escape hatch ──
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

    // ── 8. Once the real migration has advanced write/read to 'new', the simplified path works ──
    it('allows PUBLIC_LIVE off->on once GAME_WRITE=new and GAME_READ=new via the fully gated path', async () => {
      await advanceWriteReadToNew();
      const toggled = await service.simplifiedPatchFlag(
        OWNER_USER_ID,
        'PUBLIC_LIVE',
        { expectedVersion: 0, value: 'on', reason: 'migration complete, reveal live scores' },
        'post-migration-on',
      );
      expect(toggled).toMatchObject({ value: 'on', version: 1 });
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

  /** Drives GAME_READ legacy->compare->new and GAME_WRITE legacy->new through the real,
   * fully-gated `patchFlag` path -- mirrors `game-operations-control.integration-spec.ts`'s
   * `advanceToNewTuple()` so this file stays self-contained. */
  async function advanceWriteReadToNew() {
    const attemptId = randomUUID();
    const attemptRoot = join(EVIDENCE_ROOT, `simplified-gate-${attemptId}`);
    mkdirSync(attemptRoot, { recursive: true, mode: 0o700 });
    const bundlePaths: string[] = [];
    let receiptSequence = 0;

    try {
      const compare = writeSingleGate({
        phase: 'B',
        key: 'GAME_READ',
        from: { value: 'legacy', version: 0 },
        to: { value: 'compare', version: 1 },
        gates: [{ gateId: 'V10', commandId: 'V10' }],
      });
      await service.patchFlag(
        OWNER_USER_ID,
        'GAME_READ',
        { expectedVersion: 0, value: 'compare', gateBundlePath: compare.path, gateBundleHash: compare.sha256, reason: 'advance compare' },
        'simplified-gate-advance-read-compare',
      );
      const write = writeSingleGate({
        phase: 'C',
        key: 'GAME_WRITE',
        from: { value: 'legacy', version: 0 },
        to: { value: 'new', version: 1 },
        gates: [{ gateId: 'V10', commandId: 'V10' }, { gateId: 'V25', commandId: 'V25' }],
      });
      await service.patchFlag(
        OWNER_USER_ID,
        'GAME_WRITE',
        { expectedVersion: 0, value: 'new', gateBundlePath: write.path, gateBundleHash: write.sha256, reason: 'advance write' },
        'simplified-gate-advance-write',
      );
      const read = writeSingleGate({
        phase: 'C',
        key: 'GAME_READ',
        from: { value: 'compare', version: 1 },
        to: { value: 'new', version: 2 },
        gates: [{ gateId: 'V10', commandId: 'V10' }, { gateId: 'V25', commandId: 'V25' }],
      });
      await service.patchFlag(
        OWNER_USER_ID,
        'GAME_READ',
        { expectedVersion: 1, value: 'new', gateBundlePath: read.path, gateBundleHash: read.sha256, reason: 'advance read authority' },
        'simplified-gate-advance-read-new',
      );
    } finally {
      for (const path of bundlePaths) rmSync(path, { force: true });
      rmSync(attemptRoot, { recursive: true, force: true });
    }

    function writeSingleGate(input: {
      phase: 'B' | 'C';
      key: GameOperationFlagKey;
      from: { value: string; version: number };
      to: { value: string; version: number };
      gates: Array<{ gateId: string; commandId: string }>;
    }) {
      const prerequisites = [...input.gates]
        .sort((left, right) => `${left.gateId}\u0000${left.commandId}`.localeCompare(`${right.gateId}\u0000${right.commandId}`))
        .map((gate) => {
          const path = join(attemptRoot, `receipt-${receiptSequence++}-${input.phase}-${gate.gateId}-${gate.commandId}.json`);
          const receipt = immutableJson(path, {
            schemaVersion: 1,
            gateId: gate.gateId,
            phase: input.phase,
            commandId: gate.commandId,
            attemptId,
            baselineSHA: BASELINE_SHA,
            candidateSHA: CANDIDATE_SHA,
            planSHA: PLAN_SHA,
            verdict: 'accepted',
            createdAt: new Date().toISOString(),
          });
          return { gateId: gate.gateId, phase: input.phase, commandId: gate.commandId, path: receipt.path, sha256: receipt.sha256, verdict: 'accepted' };
        });
      const transition = `${input.key}:${input.from.value}->${input.to.value}`;
      const path = join(EVIDENCE_ROOT, `flag-gate-${attemptId}-${input.phase}-${slug(transition)}.json`);
      bundlePaths.push(path);
      return immutableJson(path, {
        schemaVersion: 1,
        phase: input.phase,
        attemptId,
        baselineSHA: BASELINE_SHA,
        candidateSHA: CANDIDATE_SHA,
        planSHA: PLAN_SHA,
        transition,
        key: input.key,
        from: input.from,
        to: input.to,
        prerequisites,
        createdAt: new Date().toISOString(),
      });
    }
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

function immutableJson(path: string, value: unknown) {
  const bytes = Buffer.from(canonicalJson(value));
  writeFileSync(path, bytes, { flag: 'wx', mode: 0o444 });
  return { path, sha256: createHash('sha256').update(bytes).digest('hex') };
}

function slug(value: string) {
  return value.replace(/[^A-Za-z0-9._-]+/g, '-');
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) throw new Error('test receipt is not JSON serializable');
    return encoded;
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (!isRecord(value)) throw new Error('test receipt must be a record');
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(',')}}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
