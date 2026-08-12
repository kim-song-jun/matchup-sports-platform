import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { AdminContextService } from '../common/admin-context.service';
import { PrismaService } from '../prisma/prisma.service';

export type GameOperationFlagKey = 'PUBLIC_LIVE' | 'DIRECTOR_OFFICIALIZE';

export const GAME_OPERATION_FLAG_DEFAULTS: Readonly<Record<GameOperationFlagKey, 'off'>> = {
  PUBLIC_LIVE: 'off',
  DIRECTOR_OFFICIALIZE: 'off',
};

export type GameOperationFlagValue = 'off' | 'on';

const FLAG_KEYS: GameOperationFlagKey[] = ['DIRECTOR_OFFICIALIZE', 'PUBLIC_LIVE'];
const GATE_EVIDENCE_DIRECTORY = 'teameet-ulw-evidence';
const GATE_EVIDENCE_ATTEMPT = 'teameet-team-tournament-operations-v1';
const GATE_ROOT = `${resolveGameOperationGateRoot()}/`;
const SYSTEM_ACTOR = 'PLATFORM_OPS_CONTROL';
const IDEMPOTENCY_TTL_MS = 30 * 24 * 60 * 60 * 1_000;
const SHA_PATTERN = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class GameOperationGateRootConfigurationError extends Error {
  readonly name = 'GameOperationGateRootConfigurationError';

  constructor(readonly configuredTemporaryRoot: string) {
    super('Game operation gate evidence must use the current OS temporary root');
  }
}

export function resolveGameOperationGateRoot(
  configuredTemporaryRoot: string = tmpdir(),
): string {
  const currentTemporaryRoot = resolve(tmpdir());
  if (resolve(configuredTemporaryRoot) !== currentTemporaryRoot) {
    throw new GameOperationGateRootConfigurationError(configuredTemporaryRoot);
  }
  return join(
    currentTemporaryRoot,
    GATE_EVIDENCE_DIRECTORY,
    GATE_EVIDENCE_ATTEMPT,
  );
}

/**
 * Retired (Task 10 cutover cleanup): this file used to gate FOUR operation flags --
 * `GAME_WRITE`/`GAME_READ` (the Task 10 legacy-result read/write cutover, `'legacy' | 'compare' |
 * 'new'`-valued, latched via a `v1_game_cutover_epochs` row and rolled back only through an atomic
 * `tupleTransition()` seam) and `PUBLIC_LIVE`/`DIRECTOR_OFFICIALIZE` (plain on/off operational
 * kill switches). The cutover those first two flags governed is complete and permanent -- alpha
 * ran `GAME_WRITE=new`/`GAME_READ=new` in production with no rollback for a full cutover cycle --
 * so `GameOperationFlagKey` no longer has `GAME_WRITE`/`GAME_READ` values, and
 * `tupleTransition()`/`withNewWriteAuthority()`/the cutover-epoch table access below are gone. The
 * gate-bundle machinery further down only ever verifies a single-flag transition now -- the
 * 'tuple' shape it used to also accept existed exclusively for the GAME_READ/GAME_WRITE rollback
 * pair. The migration/comparator/CLI tooling that cutover used lived under
 * `apps/v1_api/src/games/migration/` and was removed in the same cleanup -- see git history.
 *
 * What remains -- `PUBLIC_LIVE`/`DIRECTOR_OFFICIALIZE` -- are ongoing operational rollback
 * switches, not a one-time migration, and are unaffected by this cleanup: `PUBLIC_LIVE=off`
 * demotes the public live scoreboard to `status_only`; `DIRECTOR_OFFICIALIZE=off` blocks a
 * tournament director's result confirmation. Both still go through the same CAS +
 * gate-bundle-verified `patchFlag()` (or the simplified DB-switch `simplifiedPatchFlag()`) path as
 * before.
 */

/**
 * Simplified gate switch (owner request: "굳이 다 환경변수로 하지 말고 DB 값으로 admin에서
 * 설정값으로 넣자").
 *
 * The literal gate bundle (docs/api/domains/game-migration.md) exists because promoting
 * `PUBLIC_LIVE`/`DIRECTOR_OFFICIALIZE` off->on is irreversible in effect ("public exposure can't
 * be un-seen") -- it deliberately costs a 14-day, twice-7x24h-signed ceremony. That ceremony stays
 * mandatory wherever this switch is off. It is opt-in, not opt-out, and defaults to disabled (see
 * migration `20260810120000_v1_operation_gate_setting`) so a freshly provisioned environment
 * (including production) never accidentally exposes the shortcut.
 *
 * This used to be gated by a dedicated opt-in environment variable set only in the alpha compose
 * overlay, because `NODE_ENV` can't distinguish alpha from real production (both compose files
 * hardcode `NODE_ENV=production`). The owner decided environment-locking was the wrong control:
 * the switch now lives in
 * `v1_game_operation_gate_settings` (a CAS'd singleton row, see `setSimplifiedGate`) and a
 * `platform_ops` admin can flip it from any environment, including production. The control is the
 * CAS + mandatory `reason` + `V1OperationAudit` trail on the switch itself, not which environment
 * it runs in.
 */

/**
 * The simplified path only skips the gate-bundle *paperwork* (see `simplifiedPatchFlag`'s doc
 * comment below) -- the data-consistency invariants that protect the flag are untouched:
 * `assertSingleTransition` (one step at a time), CAS on `expectedVersion`, the
 * `V1OperationAudit` trail, and the `platform_ops` permission level all still apply.
 */
export const SIMPLIFIED_GATE_ALLOWED_KEYS: readonly GameOperationFlagKey[] = [
  'PUBLIC_LIVE',
  'DIRECTOR_OFFICIALIZE',
];

export type SimplifiedPatchGameOperationFlagInput = {
  expectedVersion: number;
  value: string;
  reason: string;
};

export type SetSimplifiedGateInput = {
  expectedVersion: number;
  enabled: boolean;
  reason: string;
};

export type PatchGameOperationFlagInput = {
  expectedVersion: number;
  value: string;
  gateBundlePath: string;
  gateBundleHash: string;
  reason: string;
};

export type RequeueGameOperationJobInput = {
  expectedVersion: number;
  reason: string;
};

type FlagRow = {
  key: GameOperationFlagKey;
  value: string;
  version: number;
  owner_actor: string;
  updated_by_user_id: string | null;
  rollback_value: string | null;
  updated_at: Date;
};

type GateSettingRow = {
  id: string;
  simplified_gate_enabled: boolean;
  version: number;
  updated_by_user_id: string | null;
  updated_at: Date;
};

type GateSettingState = {
  enabled: boolean;
  version: number;
  updatedByUserId: string | null;
  updatedAt: Date;
};

type IdempotencyRow = {
  payload_hash: string;
  response_status: number;
  response_body: unknown;
};

type JobRow = {
  id: string;
  status: string;
  attempts: number;
  retry_generation: number;
  available_at: Date;
  version: number;
  lease_owner: string | null;
  lease_until: Date | null;
  last_error: string | null;
};

type GateIdentity = {
  phase: string;
  attemptId: string;
  baselineSHA: string;
  candidateSHA: string;
  planSHA: string;
};

type GateReference = {
  path: string;
  sha256: string;
};

type GatePrerequisite = GateReference & {
  gateId: string;
  phase: string;
  commandId: string;
  verdict: string;
};

type RequiredGate = {
  gateId: string;
  commandId: string;
};

type VerifiedGateBundle = GateIdentity & {
  transition: string;
  prerequisites: GatePrerequisite[];
  hash: string;
  path: string;
};

type ExpectedGateTransition = {
  key: GameOperationFlagKey;
  from: { value: string; version: number };
  to: { value: string; version: number };
};

@Injectable()
export class GameOperationFlagsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminContext: AdminContextService,
  ) {}

  async getFlag(userId: string, key: string) {
    await this.assertPlatformOps(userId);
    const normalizedKey = parseFlagKey(key);
    await this.ensureDefaults();
    const rows = await this.prisma.$queryRaw<FlagRow[]>`
      SELECT key, value, version, owner_actor, updated_by_user_id, rollback_value, updated_at
      FROM v1_game_operation_flags
      WHERE key = ${normalizedKey}::"V1GameOperationFlagKey"
    `;
    const row = rows[0];
    if (!row) {
      throw new NotFoundException({
        code: 'OPERATION_FLAG_NOT_FOUND',
        message: 'Operation flag was not found',
      });
    }
    return presentFlag(row);
  }

  async patchFlag(
    userId: string,
    key: string,
    input: PatchGameOperationFlagInput,
    idempotencyKey: string | undefined,
  ) {
    await this.assertPlatformOps(userId);
    const normalizedKey = parseFlagKey(key);
    const normalizedIdempotencyKey = requireIdempotencyKey(idempotencyKey);
    const nextValue = parseFlagValue(normalizedKey, input.value);
    assertReason(input.reason);
    assertVersion(input.expectedVersion);
    await this.ensureDefaults();
    const requestPayload = {
      key: normalizedKey,
      expectedVersion: input.expectedVersion,
      value: nextValue,
      gateBundlePath: resolve(input.gateBundlePath),
      gateBundleHash: input.gateBundleHash,
      reason: input.reason,
    };
    const replay = await this.findIdempotencyReplay(
      userId,
      'operation_flag.patch',
      'operation_flag',
      normalizedKey,
      normalizedIdempotencyKey,
      requestPayload,
    );
    if (replay.found) return replay.response;

    const currentRows = await this.prisma.$queryRaw<FlagRow[]>`
      SELECT key, value, version, owner_actor, updated_by_user_id, rollback_value, updated_at
      FROM v1_game_operation_flags
      WHERE key = ${normalizedKey}::"V1GameOperationFlagKey"
    `;
    const current = currentRows[0];
    if (!current) {
      throw new NotFoundException({
        code: 'OPERATION_FLAG_NOT_FOUND',
        message: 'Operation flag was not found',
      });
    }
    assertSingleTransition(normalizedKey, current.value, nextValue);
    const gate = verifyGateBundle(input.gateBundlePath, input.gateBundleHash, {
      key: normalizedKey,
      from: { value: current.value, version: input.expectedVersion },
      to: { value: nextValue, version: input.expectedVersion + 1 },
    });

    return this.withIdempotency(
      userId,
      'operation_flag.patch',
      'operation_flag',
      normalizedKey,
      normalizedIdempotencyKey,
      requestPayload,
      async (tx) => {
        const lockedRows = await this.lockAllFlags(tx);
        const locked = requireFlagRow(lockedRows, normalizedKey);
        if (
          locked.version !== input.expectedVersion ||
          locked.value !== current.value
        ) {
          throw versionConflict(normalizedKey, locked);
        }
        assertSingleTransition(normalizedKey, locked.value, nextValue);

        const updatedRows = await tx.$queryRaw<FlagRow[]>`
          UPDATE v1_game_operation_flags
          SET value = ${nextValue},
              version = version + 1,
              owner_actor = 'platform_ops',
              updated_by_user_id = ${userId},
              rollback_value = ${locked.value},
              updated_at = CURRENT_TIMESTAMP
          WHERE key = ${normalizedKey}::"V1GameOperationFlagKey"
            AND version = ${input.expectedVersion}
            AND value = ${locked.value}
          RETURNING key, value, version, owner_actor, updated_by_user_id, rollback_value, updated_at
        `;
        const updated = updatedRows[0];
        if (!updated) {
          throw versionConflict(normalizedKey, locked);
        }
        await this.writeControlEffect(
          tx,
          normalizedIdempotencyKey,
          'OPERATION_FLAG_CHANGED',
          'GAME_OPERATION_FLAG_CHANGED',
          'operation_flag',
          normalizedKey,
          input.reason,
          flagAuditState(locked),
          {
            ...flagAuditState(updated),
            gateBundlePath: gate.path,
            gateBundleHash: gate.hash,
            gatePhase: gate.phase,
            gateAttemptId: gate.attemptId,
          },
        );
        return presentFlag(updated);
      },
    );
  }

  /** Whether the simplified (non-gate-bundle) admin toggle is enabled, plus CAS/audit metadata. */
  async getSimplifiedGateStatus(userId: string): Promise<GateSettingState> {
    await this.assertPlatformOps(userId);
    return this.readGateSetting();
  }

  /**
   * Flips the simplified gate switch itself. This is the only way to change
   * `v1_game_operation_gate_settings` -- everything else in this file only reads it.
   */
  async setSimplifiedGate(
    userId: string,
    input: SetSimplifiedGateInput,
    idempotencyKey: string | undefined,
  ) {
    await this.assertPlatformOps(userId);
    const normalizedIdempotencyKey = requireIdempotencyKey(idempotencyKey);
    assertReason(input.reason);
    assertVersion(input.expectedVersion);
    await this.readGateSetting();
    const requestPayload = {
      expectedVersion: input.expectedVersion,
      enabled: input.enabled,
      reason: input.reason,
    };

    return this.withIdempotency(
      userId,
      'operation_gate.set',
      'operation_gate',
      'simplified',
      normalizedIdempotencyKey,
      requestPayload,
      async (tx) => {
        const lockedRows = await tx.$queryRaw<GateSettingRow[]>`
          SELECT id, simplified_gate_enabled, version, updated_by_user_id, updated_at
          FROM v1_game_operation_gate_settings
          WHERE id = 'singleton'
          FOR UPDATE
        `;
        const locked = lockedRows[0];
        if (!locked) {
          throw new NotFoundException({
            code: 'OPERATION_GATE_SETTING_NOT_FOUND',
            message: 'Operation gate setting was not found',
          });
        }
        if (locked.version !== input.expectedVersion) {
          throw gateVersionConflict(locked);
        }
        if (locked.simplified_gate_enabled === input.enabled) {
          throw new ConflictException({
            code: 'GATE_MODE_UNCHANGED',
            message: 'Simplified gate is already in the requested state',
          });
        }

        const updatedRows = await tx.$queryRaw<GateSettingRow[]>`
          UPDATE v1_game_operation_gate_settings
          SET simplified_gate_enabled = ${input.enabled},
              version = version + 1,
              updated_by_user_id = ${userId},
              updated_at = CURRENT_TIMESTAMP
          WHERE id = 'singleton' AND version = ${input.expectedVersion}
          RETURNING id, simplified_gate_enabled, version, updated_by_user_id, updated_at
        `;
        const updated = updatedRows[0];
        if (!updated) {
          throw gateVersionConflict(locked);
        }
        await this.writeControlEffect(
          tx,
          normalizedIdempotencyKey,
          'OPERATION_GATE_MODE_CHANGED',
          'GAME_OPERATION_GATE_MODE_CHANGED',
          'operation_gate',
          'simplified',
          input.reason,
          { simplifiedGateEnabled: locked.simplified_gate_enabled, version: locked.version },
          { simplifiedGateEnabled: updated.simplified_gate_enabled, version: updated.version },
        );
        return presentGateSetting(updated);
      },
    );
  }

  /**
   * Admin fast path for both operation flags -- see the doc comment on
   * `SIMPLIFIED_GATE_ALLOWED_KEYS` above for what it does NOT relax.
   *
   * Everything except the immutable gate-bundle evidence ceremony is identical to `patchFlag`:
   * same admin permission level (`assertPlatformOps`), same CAS on `expectedVersion`, same
   * `assertSingleTransition`, same mandatory `reason` + `Idempotency-Key`, same
   * `V1OperationAudit`/outbox write. The audit `after` payload is marked `gateMode: 'simplified'`
   * so the trail records which path was used.
   */
  async simplifiedPatchFlag(
    userId: string,
    key: string,
    input: SimplifiedPatchGameOperationFlagInput,
    idempotencyKey: string | undefined,
  ) {
    const gate = await this.readGateSetting();
    if (!gate.enabled) {
      throw new ForbiddenException({
        code: 'SIMPLIFIED_GATE_DISABLED',
        message: '간소 전환 모드가 꺼져 있어요',
      });
    }
    await this.assertPlatformOps(userId);
    const normalizedKey = parseFlagKey(key);
    if (!SIMPLIFIED_GATE_ALLOWED_KEYS.includes(normalizedKey)) {
      throw new BadRequestException({
        code: 'SIMPLIFIED_GATE_KEY_NOT_ALLOWED',
        message: `${normalizedKey} must use the fully gated operation flag path`,
      });
    }
    const normalizedIdempotencyKey = requireIdempotencyKey(idempotencyKey);
    const nextValue = parseFlagValue(normalizedKey, input.value);
    assertReason(input.reason);
    assertVersion(input.expectedVersion);
    await this.ensureDefaults();
    const requestPayload = {
      key: normalizedKey,
      expectedVersion: input.expectedVersion,
      value: nextValue,
      reason: input.reason,
      gateMode: 'simplified' as const,
    };
    const replay = await this.findIdempotencyReplay(
      userId,
      'operation_flag.simplified_patch',
      'operation_flag',
      normalizedKey,
      normalizedIdempotencyKey,
      requestPayload,
    );
    if (replay.found) return replay.response;

    const currentRows = await this.prisma.$queryRaw<FlagRow[]>`
      SELECT key, value, version, owner_actor, updated_by_user_id, rollback_value, updated_at
      FROM v1_game_operation_flags
      WHERE key = ${normalizedKey}::"V1GameOperationFlagKey"
    `;
    const current = currentRows[0];
    if (!current) {
      throw new NotFoundException({
        code: 'OPERATION_FLAG_NOT_FOUND',
        message: 'Operation flag was not found',
      });
    }
    assertSingleTransition(normalizedKey, current.value, nextValue);

    return this.withIdempotency(
      userId,
      'operation_flag.simplified_patch',
      'operation_flag',
      normalizedKey,
      normalizedIdempotencyKey,
      requestPayload,
      async (tx) => {
        const lockedRows = await this.lockAllFlags(tx);
        const locked = requireFlagRow(lockedRows, normalizedKey);
        if (
          locked.version !== input.expectedVersion ||
          locked.value !== current.value
        ) {
          throw versionConflict(normalizedKey, locked);
        }
        assertSingleTransition(normalizedKey, locked.value, nextValue);

        const updatedRows = await tx.$queryRaw<FlagRow[]>`
          UPDATE v1_game_operation_flags
          SET value = ${nextValue},
              version = version + 1,
              owner_actor = 'platform_ops',
              updated_by_user_id = ${userId},
              rollback_value = ${locked.value},
              updated_at = CURRENT_TIMESTAMP
          WHERE key = ${normalizedKey}::"V1GameOperationFlagKey"
            AND version = ${input.expectedVersion}
            AND value = ${locked.value}
          RETURNING key, value, version, owner_actor, updated_by_user_id, rollback_value, updated_at
        `;
        const updated = updatedRows[0];
        if (!updated) {
          throw versionConflict(normalizedKey, locked);
        }
        await this.writeControlEffect(
          tx,
          normalizedIdempotencyKey,
          'OPERATION_FLAG_CHANGED',
          'GAME_OPERATION_FLAG_CHANGED',
          'operation_flag',
          normalizedKey,
          input.reason,
          flagAuditState(locked),
          {
            ...flagAuditState(updated),
            gateMode: 'simplified',
          },
        );
        return presentFlag(updated);
      },
    );
  }

  async requeueJob(
    userId: string,
    jobId: string,
    input: RequeueGameOperationJobInput,
    idempotencyKey: string | undefined,
  ) {
    await this.assertPlatformOps(userId);
    const normalizedIdempotencyKey = requireIdempotencyKey(idempotencyKey);
    assertVersion(input.expectedVersion);
    assertReason(input.reason);
    const requestPayload = {
      jobId,
      expectedVersion: input.expectedVersion,
      reason: input.reason,
    };
    return this.withIdempotency(
      userId,
      'game_operation_job.requeue',
      'game_operation_job',
      jobId,
      normalizedIdempotencyKey,
      requestPayload,
      async (tx) => {
        const jobs = await tx.$queryRaw<JobRow[]>`
          SELECT id, status, attempts, retry_generation, available_at, version,
                 lease_owner, lease_until, last_error
          FROM v1_outbox_events
          WHERE id = ${jobId}
          FOR UPDATE
        `;
        const job = jobs[0];
        if (!job) {
          throw new NotFoundException({
            code: 'JOB_NOT_FOUND',
            message: 'Game operation job was not found',
          });
        }
        if (job.version !== input.expectedVersion) {
          throw new ConflictException({
            code: 'VERSION_CONFLICT',
            message: 'Game operation job version changed',
            currentVersion: job.version,
          });
        }
        if (job.status !== 'POISONED') {
          throw new ConflictException({
            code: 'JOB_NOT_POISONED',
            message: 'Only poisoned jobs can be requeued',
          });
        }
        const updatedRows = await tx.$queryRaw<JobRow[]>`
          UPDATE v1_outbox_events
          SET status = 'RETRY',
              attempts = 0,
              retry_generation = retry_generation + 1,
              available_at = CURRENT_TIMESTAMP,
              lease_owner = NULL,
              lease_until = NULL,
              last_error = NULL,
              version = version + 1,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ${jobId}
            AND status = 'POISONED'
            AND version = ${input.expectedVersion}
          RETURNING id, status, attempts, retry_generation, available_at, version,
                    lease_owner, lease_until, last_error
        `;
        const updated = updatedRows[0];
        if (!updated) {
          throw new ConflictException({
            code: 'VERSION_CONFLICT',
            message: 'Game operation job changed before requeue',
          });
        }
        await this.writeControlEffect(
          tx,
          normalizedIdempotencyKey,
          'JOB_REQUEUED',
          'GAME_OPERATION_JOB_REQUEUED',
          'game_operation_job',
          jobId,
          input.reason,
          jobAuditState(job),
          jobAuditState(updated),
        );
        return presentJob(updated);
      },
    );
  }

  private async assertPlatformOps(userId: string) {
    return this.adminContext.getMutationAdmin(userId);
  }

  /** Mirrors `ensureDefaults()` below: guarantees the singleton gate-setting row exists, then
   * reads it. Called by every path that reads or writes the simplified gate switch. */
  private async readGateSetting(): Promise<GateSettingState> {
    const now = new Date();
    await this.prisma.$executeRaw`
      INSERT INTO v1_game_operation_gate_settings
        (id, simplified_gate_enabled, version, updated_at, created_at)
      VALUES ('singleton', false, 0, ${now}, ${now})
      ON CONFLICT (id) DO NOTHING
    `;
    const rows = await this.prisma.$queryRaw<GateSettingRow[]>`
      SELECT id, simplified_gate_enabled, version, updated_by_user_id, updated_at
      FROM v1_game_operation_gate_settings
      WHERE id = 'singleton'
    `;
    const row = rows[0];
    if (!row) {
      throw new NotFoundException({
        code: 'OPERATION_GATE_SETTING_NOT_FOUND',
        message: 'Operation gate setting was not found',
      });
    }
    return presentGateSetting(row);
  }

  private async ensureDefaults() {
    const now = new Date();
    for (const key of FLAG_KEYS) {
      await this.prisma.$executeRaw`
        INSERT INTO v1_game_operation_flags
          (id, key, value, version, owner_actor, updated_at, created_at)
        VALUES
          (${randomUUID()}, ${key}::"V1GameOperationFlagKey",
           ${GAME_OPERATION_FLAG_DEFAULTS[key]}, 0, 'platform_ops', ${now}, ${now})
        ON CONFLICT (key) DO NOTHING
      `;
    }
  }

  private async lockAllFlags(tx: Prisma.TransactionClient) {
    return tx.$queryRaw<FlagRow[]>`
      SELECT key, value, version, owner_actor, updated_by_user_id, rollback_value, updated_at
      FROM v1_game_operation_flags
      WHERE key IN ('PUBLIC_LIVE', 'DIRECTOR_OFFICIALIZE')
      ORDER BY key
      FOR UPDATE
    `;
  }

  private async withIdempotency<T>(
    actorUserId: string,
    action: string,
    resourceType: string,
    resourceId: string,
    idempotencyKey: string,
    payload: unknown,
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T | unknown> {
    const payloadHash = sha256(stableStringify(payload));
    return this.prisma.$transaction(
      async (tx) => {
        const scope = stableStringify([
          actorUserId,
          action,
          resourceType,
          resourceId,
          idempotencyKey,
        ]);
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${scope}, 0))`;
        const existingRows = await tx.$queryRaw<IdempotencyRow[]>`
          SELECT payload_hash, response_status, response_body
          FROM v1_idempotency_records
          WHERE actor_user_id = ${actorUserId}
            AND action = ${action}
            AND resource_type = ${resourceType}
            AND resource_id = ${resourceId}
            AND idempotency_key = ${idempotencyKey}
            AND expires_at > CURRENT_TIMESTAMP
          FOR UPDATE
        `;
        const existing = existingRows[0];
        if (existing) {
          if (existing.payload_hash !== payloadHash) {
            throw new ConflictException({
              code: 'IDEMPOTENCY_PAYLOAD_CONFLICT',
              message: 'Idempotency key was already used with a different payload',
            });
          }
          return existing.response_body;
        }
        const response = await operation(tx);
        const expiresAt = new Date(Date.now() + IDEMPOTENCY_TTL_MS);
        await tx.$executeRaw`
          INSERT INTO v1_idempotency_records
            (id, actor_user_id, action, resource_type, resource_id,
             idempotency_key, payload_hash, response_status, response_body,
             expires_at, created_at)
          VALUES
            (${randomUUID()}, ${actorUserId}, ${action}, ${resourceType}, ${resourceId},
             ${idempotencyKey}, ${payloadHash}, 200, ${JSON.stringify(response)}::jsonb,
             ${expiresAt}, CURRENT_TIMESTAMP)
        `;
        return response;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async findIdempotencyReplay(
    actorUserId: string,
    action: string,
    resourceType: string,
    resourceId: string,
    idempotencyKey: string,
    payload: unknown,
  ): Promise<{ found: true; response: unknown } | { found: false }> {
    const payloadHash = sha256(stableStringify(payload));
    const rows = await this.prisma.$queryRaw<IdempotencyRow[]>`
      SELECT payload_hash, response_status, response_body
      FROM v1_idempotency_records
      WHERE actor_user_id = ${actorUserId}
        AND action = ${action}
        AND resource_type = ${resourceType}
        AND resource_id = ${resourceId}
        AND idempotency_key = ${idempotencyKey}
        AND expires_at > CURRENT_TIMESTAMP
    `;
    const existing = rows[0];
    if (!existing) return { found: false };
    if (existing.payload_hash !== payloadHash) {
      throw new ConflictException({
        code: 'IDEMPOTENCY_PAYLOAD_CONFLICT',
        message: 'Idempotency key was already used with a different payload',
      });
    }
    return { found: true, response: existing.response_body };
  }

  private async writeControlEffect(
    tx: Prisma.TransactionClient,
    requestId: string,
    action: string,
    eventType: string,
    resourceType: string,
    resourceId: string,
    reason: string,
    before: Record<string, unknown>,
    after: Record<string, unknown>,
  ) {
    const auditId = randomUUID();
    const now = new Date();
    await tx.$executeRaw`
      INSERT INTO v1_operation_audits
        (id, actor_type, actor_user_id, system_actor, action, resource_type,
         resource_id, request_id, before, after, reason, created_at)
      VALUES
        (${auditId}, 'SYSTEM', NULL, ${SYSTEM_ACTOR}, ${action}, ${resourceType},
         ${resourceId}, ${requestId}, ${JSON.stringify(before)}::jsonb,
         ${JSON.stringify(after)}::jsonb, ${reason}, ${now})
    `;
    await tx.$executeRaw`
      INSERT INTO v1_outbox_events
        (id, business_key, aggregate_type, aggregate_id, type, payload,
         available_at, attempts, retry_generation, version, status, created_at, updated_at)
      VALUES
        (${randomUUID()}, ${`platform-ops-control:${auditId}`}, ${resourceType},
         ${resourceId}, ${eventType},
         ${JSON.stringify({
           auditId,
           action,
           resourceType,
           resourceId,
           systemActor: SYSTEM_ACTOR,
         })}::jsonb,
         ${now}, 0, 0, 0, 'PENDING', ${now}, ${now})
    `;
  }
}

function parseFlagKey(value: string): GameOperationFlagKey {
  switch (value) {
    case 'PUBLIC_LIVE':
    case 'DIRECTOR_OFFICIALIZE':
      return value;
    default:
      throw new BadRequestException({
        code: 'INVALID_OPERATION_FLAG',
        message: 'Unknown operation flag',
      });
  }
}

function parseFlagValue(
  key: GameOperationFlagKey,
  value: string,
): GameOperationFlagValue {
  if (value === 'off' || value === 'on') return value;
  throw new BadRequestException({
    code: 'INVALID_OPERATION_FLAG_VALUE',
    message: `${value} is not valid for ${key}`,
  });
}

function assertVersion(value: number | undefined): asserts value is number {
  if (!Number.isInteger(value) || value === undefined || value < 0) {
    throw new BadRequestException({
      code: 'EXPECTED_VERSION_REQUIRED',
      message: 'Expected version must be a non-negative integer',
    });
  }
}

function assertReason(reason: string) {
  if (reason.trim().length === 0 || reason.length > 1_000) {
    throw new BadRequestException({
      code: 'INVALID_REASON',
      message: 'Reason must contain between 1 and 1000 characters',
    });
  }
}

function requireIdempotencyKey(value: string | undefined) {
  const normalized = value?.trim();
  if (!normalized) {
    throw new BadRequestException({
      code: 'IDEMPOTENCY_KEY_REQUIRED',
      message: 'Idempotency-Key header is required',
    });
  }
  if (normalized.length > 200) {
    throw new BadRequestException({
      code: 'IDEMPOTENCY_KEY_INVALID',
      message: 'Idempotency-Key must be at most 200 characters',
    });
  }
  return normalized;
}

/** Both remaining flags are plain booleans -- the only legal single-step transitions are
 * off->on (promotion) and on->off (rollback). There is no forward-order dependency between
 * `PUBLIC_LIVE`/`DIRECTOR_OFFICIALIZE` (unlike the retired GAME_READ/GAME_WRITE pair, which had
 * to move through a frozen READ/WRITE sequence -- see this file's top-level doc comment), so no
 * cross-flag check runs here. */
function assertSingleTransition(
  key: GameOperationFlagKey,
  from: string,
  to: string,
) {
  const forward = from === 'off' && to === 'on';
  const rollback = from === 'on' && to === 'off';
  if (forward || rollback) return;
  throw new ConflictException({
    code: 'INVALID_FLAG_TRANSITION',
    message: `${key} cannot transition from ${from} to ${to}`,
  });
}

function requireFlagRow(rows: FlagRow[], key: GameOperationFlagKey) {
  const row = rows.find((candidate) => candidate.key === key);
  if (!row) {
    throw new NotFoundException({
      code: 'OPERATION_FLAG_NOT_FOUND',
      message: `${key} was not found`,
    });
  }
  return row;
}

function presentFlag(row: FlagRow) {
  return {
    key: row.key,
    value: row.value,
    version: row.version,
    ownerActor: row.owner_actor,
    updatedByUserId: row.updated_by_user_id,
    rollbackValue: row.rollback_value,
    updatedAt: row.updated_at.toISOString(),
  };
}

function flagAuditState(row: FlagRow): Record<string, unknown> {
  return {
    key: row.key,
    value: row.value,
    version: row.version,
    ownerActor: row.owner_actor,
    rollbackValue: row.rollback_value,
  };
}

function presentJob(row: JobRow) {
  return {
    id: row.id,
    status: row.status,
    attempts: row.attempts,
    retryGeneration: row.retry_generation,
    availableAt: row.available_at.toISOString(),
    version: row.version,
    leaseOwner: row.lease_owner,
    leaseUntil: row.lease_until?.toISOString() ?? null,
    lastError: row.last_error,
  };
}

function jobAuditState(row: JobRow): Record<string, unknown> {
  return {
    status: row.status,
    attempts: row.attempts,
    retryGeneration: row.retry_generation,
    version: row.version,
    leaseOwner: row.lease_owner,
    leaseUntil: row.lease_until?.toISOString() ?? null,
    lastError: row.last_error,
  };
}

function versionConflict(key: GameOperationFlagKey, current: FlagRow) {
  return new ConflictException({
    code: 'VERSION_CONFLICT',
    message: `${key} changed before the transition`,
    currentVersion: current.version,
    currentValue: current.value,
  });
}

function presentGateSetting(row: GateSettingRow): GateSettingState {
  return {
    enabled: row.simplified_gate_enabled,
    version: row.version,
    updatedByUserId: row.updated_by_user_id,
    updatedAt: row.updated_at,
  };
}

function gateVersionConflict(current: GateSettingRow) {
  return new ConflictException({
    code: 'VERSION_CONFLICT',
    message: 'Operation gate setting changed before the transition',
    currentVersion: current.version,
  });
}

function verifyGateBundle(
  path: string,
  expectedHash: string,
  expected: ExpectedGateTransition,
): VerifiedGateBundle {
  const document = readImmutableJson(path, expectedHash, true);
  assertExactKeys(
    document,
    [
      'schemaVersion',
      'phase',
      'attemptId',
      'baselineSHA',
      'candidateSHA',
      'planSHA',
      'transition',
      'key',
      'from',
      'to',
      'prerequisites',
      'priorPhaseReceipt',
      'deploymentManifest',
      'publicProof',
      'createdAt',
    ],
    [
      'schemaVersion',
      'phase',
      'attemptId',
      'baselineSHA',
      'candidateSHA',
      'planSHA',
      'transition',
      'prerequisites',
      'createdAt',
      'key',
      'from',
      'to',
    ],
    'gate bundle',
  );
  if (document.schemaVersion !== 1) gateFailure('Unsupported gate bundle schema');
  const identity = readGateIdentity(document);
  assertGatePhase(identity.phase);
  const transition = requireString(document.transition, 'transition');
  const expectedFileName = `flag-gate-${identity.attemptId}-${identity.phase}-${slug(transition)}.json`;
  if (basename(path) !== expectedFileName) {
    gateFailure('Gate bundle path does not match its attempt/phase/transition descriptor');
  }
  assertIsoTimestamp(document.createdAt, 'createdAt');
  if (document.key !== expected.key) gateFailure('Gate bundle key does not match request');
  assertVersionObject(document.from, expected.from, 'from');
  assertVersionObject(document.to, expected.to, 'to');
  const prerequisites = readPrerequisites(document.prerequisites);
  const requiredGates = requiredGatesFor(identity.phase, expected.key);
  if (
    JSON.stringify(prerequisites.map((item) => gateKey(item.gateId, item.commandId))) !==
    JSON.stringify(requiredGates.map((item) => gateKey(item.gateId, item.commandId)))
  ) {
    gateFailure(
      `Gate bundle requires exactly ${requiredGates
        .map((item) => `${item.gateId}/${item.commandId}`)
        .join(',')}`,
    );
  }
  const ordering = prerequisites.map((item) => gateKey(item.gateId, item.commandId));
  if (JSON.stringify(ordering) !== JSON.stringify([...ordering].sort())) {
    gateFailure('Prerequisites must be lexically ordered by gateId/commandId');
  }
  for (const prerequisite of prerequisites) {
    if (prerequisite.phase !== identity.phase) gateFailure('Cross-phase prerequisite');
    if (prerequisite.verdict !== 'accepted') gateFailure('Prerequisite is not accepted');
    const receipt = readImmutableJson(
      prerequisite.path,
      prerequisite.sha256,
      false,
    );
    assertReceiptIdentity(receipt, prerequisite, identity);
    verifyLifecycleReferences(receipt, identity);
  }
  verifyRolloutReferences(document, identity, expected);
  return {
    ...identity,
    transition,
    prerequisites,
    hash: expectedHash,
    path: resolve(path),
  };
}

function assertGatePhase(phase: string) {
  if (phase === 'R1' || phase === 'R2') return;
  if (phase !== 'C') gateFailure('Gate phase does not match the requested transition');
}

function readImmutableJson(
  path: string,
  expectedHash: string,
  requireGateRoot: boolean,
): Record<string, unknown> {
  if (!SHA256_PATTERN.test(expectedHash)) gateFailure('Expected hash must be lowercase SHA-256');
  const absolutePath = resolve(path);
  if (
    requireGateRoot &&
    dirname(absolutePath) !== GATE_ROOT.slice(0, -1)
  ) {
    gateFailure('Gate bundle path is outside the canonical evidence root');
  }
  let descriptor: number | undefined;
  try {
    const linkState = lstatSync(absolutePath);
    if (!linkState.isFile() || linkState.isSymbolicLink()) {
      gateFailure('Evidence must be a regular non-symlink file');
    }
    if ((linkState.mode & 0o777) !== 0o444) {
      gateFailure('Evidence must be immutable mode 0444');
    }
    if (realpathSync(absolutePath) !== absolutePath) {
      gateFailure('Evidence path must be canonical');
    }
    descriptor = openSync(
      absolutePath,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    const before = fstatSync(descriptor, { bigint: true });
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs ||
      !after.isFile() ||
      (Number(after.mode) & 0o777) !== 0o444
    ) {
      gateFailure('Evidence changed while it was being verified');
    }
    const actualHash = createHash('sha256').update(bytes).digest('hex');
    if (actualHash !== expectedHash) gateFailure('Evidence SHA-256 mismatch');
    const parsed: unknown = JSON.parse(bytes.toString('utf8'));
    const record = requireRecord(parsed, 'evidence JSON');
    if (bytes.toString('utf8') !== stableStringify(record)) {
      gateFailure('Evidence must be canonical JSON without trailing content');
    }
    return record;
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    throw new BadRequestException({
      code: 'INVALID_GATE_BUNDLE',
      message: error instanceof Error ? error.message : 'Gate evidence could not be verified',
    });
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function readGateIdentity(document: Record<string, unknown>): GateIdentity {
  const phase = requireString(document.phase, 'phase');
  const attemptId = requireString(document.attemptId, 'attemptId');
  const baselineSHA = requireString(document.baselineSHA, 'baselineSHA');
  const candidateSHA = requireString(document.candidateSHA, 'candidateSHA');
  const planSHA = requireString(document.planSHA, 'planSHA');
  if (!/^(?:B|C|R1|R2)$/.test(phase)) gateFailure('Unknown gate phase');
  if (!UUID_PATTERN.test(attemptId)) gateFailure('Invalid gate attempt id');
  if (!SHA_PATTERN.test(baselineSHA) || !SHA_PATTERN.test(candidateSHA)) {
    gateFailure('Invalid baseline or candidate identity');
  }
  if (!SHA256_PATTERN.test(planSHA)) gateFailure('Invalid plan identity');
  return { phase, attemptId, baselineSHA, candidateSHA, planSHA };
}

function readPrerequisites(value: unknown): GatePrerequisite[] {
  if (!Array.isArray(value)) gateFailure('Prerequisites must be an array');
  return value.map((entry) => {
    const record = requireRecord(entry, 'prerequisite');
    assertExactKeys(
      record,
      ['gateId', 'phase', 'commandId', 'path', 'sha256', 'verdict'],
      ['gateId', 'phase', 'commandId', 'path', 'sha256', 'verdict'],
      'prerequisite',
    );
    return {
      gateId: requireString(record.gateId, 'gateId'),
      phase: requireString(record.phase, 'phase'),
      commandId: requireString(record.commandId, 'commandId'),
      path: requireString(record.path, 'path'),
      sha256: requireString(record.sha256, 'sha256'),
      verdict: requireString(record.verdict, 'verdict'),
    };
  });
}

function assertReceiptIdentity(
  receipt: Record<string, unknown>,
  prerequisite: GatePrerequisite,
  identity: GateIdentity,
) {
  if (
    receipt.schemaVersion !== 1 ||
    receipt.gateId !== prerequisite.gateId ||
    receipt.phase !== prerequisite.phase ||
    receipt.commandId !== prerequisite.commandId ||
    receipt.attemptId !== identity.attemptId ||
    receipt.baselineSHA !== identity.baselineSHA ||
    receipt.candidateSHA !== identity.candidateSHA ||
    receipt.planSHA !== identity.planSHA ||
    receipt.verdict !== prerequisite.verdict
  ) {
    gateFailure('Prerequisite receipt identity does not match gate bundle');
  }
}

function verifyLifecycleReferences(
  receipt: Record<string, unknown>,
  identity: GateIdentity,
) {
  const references = [
    ['dbLifecycleReceiptPath', 'dbLifecycleReceiptSHA'],
    ['hostBrowserLifecycleReceiptPath', 'hostBrowserLifecycleReceiptSHA'],
    ['parentLifecycleReceiptPath', 'parentLifecycleReceiptSHA'],
  ];
  for (const [pathKey, hashKey] of references) {
    const path = receipt[pathKey];
    const hash = receipt[hashKey];
    if (path === undefined && hash === undefined) continue;
    const linked = readImmutableJson(
      requireString(path, pathKey),
      requireString(hash, hashKey),
      false,
    );
    for (const [key, expected] of Object.entries(identity)) {
      if (linked[key] !== undefined && linked[key] !== expected) {
        gateFailure(`Cross-attempt lifecycle identity in ${pathKey}`);
      }
    }
    if (linked.verdict !== undefined && !['accepted', 'APPROVED'].includes(requireString(linked.verdict, 'verdict'))) {
      gateFailure(`Lifecycle receipt ${pathKey} is not accepted`);
    }
  }
}

function verifyRolloutReferences(
  bundle: Record<string, unknown>,
  identity: GateIdentity,
  expected: ExpectedGateTransition,
) {
  const prior = readOptionalReference(bundle.priorPhaseReceipt, 'priorPhaseReceipt');
  const deployment = readOptionalReference(bundle.deploymentManifest, 'deploymentManifest');
  const publicProof = readOptionalReference(bundle.publicProof, 'publicProof');
  if (identity.phase !== 'R2') {
    if (prior || deployment || publicProof) {
      gateFailure('Local gate bundle cannot mix rollout receipts');
    }
    return;
  }
  if (!prior) gateFailure('R2 requires a signed R1 terminal receipt');
  const priorReceipt = readImmutableJson(prior.path, prior.sha256, false);
  if (priorReceipt.candidateSHA !== identity.candidateSHA || priorReceipt.phase !== 'R1') {
    gateFailure('R2 prior receipt belongs to another candidate or phase');
  }
  const includesPublic = expected.key === 'PUBLIC_LIVE';
  if (!includesPublic) return;
  if (!deployment || !publicProof) {
    gateFailure('R2 public-live requires deployment manifest and public proof');
  }
  const manifest = readImmutableJson(deployment.path, deployment.sha256, false);
  const proof = readImmutableJson(publicProof.path, publicProof.sha256, false);
  if (
    manifest.schemaVersion !== 1 ||
    manifest.candidateSHA !== identity.candidateSHA ||
    manifest.environment !== 'alpha'
  ) {
    gateFailure('Deployment manifest identity mismatch');
  }
  if (
    proof.schemaVersion !== 1 ||
    proof.phase !== 'R1-public-proof' ||
    proof.candidateSHA !== identity.candidateSHA ||
    proof.deploymentAttemptId !== manifest.deploymentAttemptId ||
    proof.deploymentManifestSHA !== deployment.sha256 ||
    proof.verdict !== 'accepted'
  ) {
    gateFailure('Public proof belongs to another deployment');
  }
  for (const document of [manifest, proof]) {
    requireString(document.actor, 'actor');
    requireString(document.signingKeyId, 'signingKeyId');
    requireString(document.signature, 'signature');
  }
}

function readOptionalReference(value: unknown, label: string): GateReference | null {
  if (value === undefined) return null;
  const record = requireRecord(value, label);
  assertExactKeys(record, ['path', 'sha256'], ['path', 'sha256'], label);
  return {
    path: requireString(record.path, `${label}.path`),
    sha256: requireString(record.sha256, `${label}.sha256`),
  };
}

/** Unambiguous comparison/sort key for a (gateId, commandId) pair -- JSON-array-encoded rather
 * than delimiter-joined so no value either field could legally hold (any printable string) can
 * ever make two distinct pairs collide onto the same key. */
function gateKey(gateId: string, commandId: string): string {
  return JSON.stringify([gateId, commandId]);
}

function requiredGatesFor(phase: string, key: GameOperationFlagKey): RequiredGate[] {
  if (phase === 'R2') {
    return [{ gateId: 'V25', commandId: 'V25' }];
  }
  const required = new Map<string, RequiredGate>();
  const add = (gateId: string, commandId: string) => {
    required.set(gateKey(gateId, commandId), { gateId, commandId });
  };
  if (key === 'PUBLIC_LIVE') {
    add('V24', 'V24');
    add('V26', 'PUBLIC-01');
  } else if (key === 'DIRECTOR_OFFICIALIZE') {
    add('V7', 'V7');
    add('V22', 'V22');
    add('V23', 'V23');
  }
  return [...required.values()].sort((left, right) =>
    gateKey(left.gateId, left.commandId).localeCompare(gateKey(right.gateId, right.commandId)),
  );
}

function assertVersionObject(
  value: unknown,
  expected: { value: string; version: number },
  label: string,
) {
  const record = requireRecord(value, label);
  assertExactKeys(record, ['value', 'version'], ['value', 'version'], label);
  if (record.value !== expected.value || record.version !== expected.version) {
    gateFailure(`${label} does not match the requested transition`);
  }
}

function assertExactKeys(
  record: Record<string, unknown>,
  allowed: string[],
  required: string[],
  label: string,
) {
  const keys = Object.keys(record);
  const extras = keys.filter((key) => !allowed.includes(key));
  const missing = required.filter((key) => !keys.includes(key));
  if (extras.length > 0 || missing.length > 0) {
    gateFailure(`${label} has invalid fields`);
  }
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    gateFailure(`${label} must be an object`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, label: string) {
  if (typeof value !== 'string' || value.length === 0) {
    gateFailure(`${label} must be a non-empty string`);
  }
  return value;
}

function assertIsoTimestamp(value: unknown, label: string) {
  const timestamp = requireString(value, label);
  if (!Number.isFinite(Date.parse(timestamp))) gateFailure(`${label} must be an ISO timestamp`);
}

function gateFailure(message: string): never {
  throw new BadRequestException({
    code: 'INVALID_GATE_BUNDLE',
    message,
  });
}

function slug(value: string) {
  return value.replace(/[^A-Za-z0-9._-]+/g, '-');
}

function sha256(value: string | Buffer) {
  return createHash('sha256').update(value).digest('hex');
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) {
      throw new BadRequestException({
        code: 'INVALID_IDEMPOTENCY_PAYLOAD',
        message: 'Idempotency payload must be JSON serializable',
      });
    }
    return encoded;
  }
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const record = requireRecord(value, 'idempotency payload');
  // class-transformer's ValidationPipe (transform: true) can expose a declared optional property
  // on a nested DTO instance as an own property explicitly set to `undefined` even when it was
  // absent from the request body. Real `JSON.stringify` silently omits undefined-valued object
  // properties instead of failing to serialize, so an object shaped this way *is* JSON
  // serializable; only recursing into that `undefined` and treating it as a top-level
  // unserializable value produced a false-positive INVALID_IDEMPOTENCY_PAYLOAD. Filtering keeps
  // the hash identical to what a plain object literal with the same present keys would produce
  // (e.g. a direct service-layer call bypassing the DTO transform).
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
}
