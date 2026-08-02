import {
  BadRequestException,
  ConflictException,
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

export type GameOperationFlagKey =
  | 'GAME_WRITE'
  | 'GAME_READ'
  | 'PUBLIC_LIVE'
  | 'DIRECTOR_OFFICIALIZE';

export const GAME_OPERATION_FLAG_DEFAULTS: Readonly<
  Record<GameOperationFlagKey, 'legacy' | 'off'>
> = {
  GAME_WRITE: 'legacy',
  GAME_READ: 'legacy',
  PUBLIC_LIVE: 'off',
  DIRECTOR_OFFICIALIZE: 'off',
};

export type GameOperationFlagValue =
  | 'legacy'
  | 'compare'
  | 'new'
  | 'off'
  | 'on';

const FLAG_VALUES: Record<GameOperationFlagKey, readonly GameOperationFlagValue[]> = {
  GAME_WRITE: ['legacy', 'new'],
  GAME_READ: ['legacy', 'compare', 'new'],
  PUBLIC_LIVE: ['off', 'on'],
  DIRECTOR_OFFICIALIZE: ['off', 'on'],
};
const FLAG_KEYS: GameOperationFlagKey[] = [
  'DIRECTOR_OFFICIALIZE',
  'GAME_READ',
  'GAME_WRITE',
  'PUBLIC_LIVE',
];
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

export type PatchGameOperationFlagInput = {
  expectedVersion: number;
  value: string;
  gateBundlePath: string;
  gateBundleHash: string;
  reason: string;
};

export type GameOperationFlagTransitionInput = {
  key: GameOperationFlagKey;
  from: string;
  to: string;
};

export type TupleTransitionInput = {
  expectedVersions: Partial<Record<GameOperationFlagKey, number>>;
  transitions: GameOperationFlagTransitionInput[];
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

type CutoverRow = {
  version: number;
  write_mode: 'legacy' | 'new';
  first_new_write_at: Date | null;
  first_new_write_resource_id: string | null;
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

type ExpectedGateTransition =
  | {
      kind: 'single';
      key: GameOperationFlagKey;
      from: { value: string; version: number };
      to: { value: string; version: number };
    }
  | {
      kind: 'tuple';
      tupleKeys: GameOperationFlagKey[];
      fromTuple: Record<string, { value: string; version: number }>;
      toTuple: Record<string, { value: string; version: number }>;
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
      kind: 'single',
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
        const needsEpochLock =
          normalizedKey === 'GAME_WRITE' ||
          (normalizedKey === 'GAME_READ' &&
            transitionDirection(normalizedKey, current.value, nextValue) === 'backward');
        const epoch = needsEpochLock ? await this.lockCutoverEpoch(tx) : null;
        const locked = requireFlagRow(lockedRows, normalizedKey);
        if (
          locked.version !== input.expectedVersion ||
          locked.value !== current.value
        ) {
          throw versionConflict(normalizedKey, locked);
        }
        assertSingleTransition(normalizedKey, locked.value, nextValue);
        assertFrozenForwardOrder(normalizedKey, locked.value, nextValue, lockedRows);
        if (
          epoch?.first_new_write_at &&
          transitionDirection(normalizedKey, locked.value, nextValue) === 'backward'
        ) {
          throw new ConflictException({
            code: 'CUTOVER_LATCHED',
            message: 'Read/write authority cannot roll back after the first new write',
          });
        }

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
        if (normalizedKey === 'GAME_WRITE') {
          await tx.$executeRaw`
            UPDATE v1_game_cutover_epochs
            SET write_mode = ${nextValue}::"V1GameWriteMode",
                version = version + 1,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = 'game-cutover'
          `;
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

  async tupleTransition(
    userId: string,
    input: TupleTransitionInput,
    idempotencyKey: string | undefined,
  ) {
    await this.assertPlatformOps(userId);
    const normalizedIdempotencyKey = requireIdempotencyKey(idempotencyKey);
    assertReason(input.reason);
    const transitions = normalizeTupleTransitions(input.transitions);
    const keys = transitions.map((transition) => transition.key).sort();
    if (
      keys.length !== 2 ||
      keys[0] !== 'GAME_READ' ||
      keys[1] !== 'GAME_WRITE'
    ) {
      throw new ConflictException({
        code: 'TUPLE_TRANSITION_REQUIRED',
        message: 'Tuple transitions are reserved for atomic GAME_READ/GAME_WRITE rollback',
      });
    }
    for (const key of keys) {
      const expectedVersion = input.expectedVersions[key];
      assertVersion(expectedVersion);
    }
    await this.ensureDefaults();
    const snapshot = await this.readFlags();
    const fromTuple: Record<string, { value: string; version: number }> = {};
    const toTuple: Record<string, { value: string; version: number }> = {};
    for (const transition of transitions) {
      const row = requireFlagRow(snapshot, transition.key);
      const expectedVersion = input.expectedVersions[transition.key];
      if (expectedVersion === undefined) {
        throw new BadRequestException({
          code: 'EXPECTED_VERSION_REQUIRED',
          message: `Expected version is required for ${transition.key}`,
        });
      }
      if (transition.from !== row.value) {
        throw new ConflictException({
          code: 'FLAG_VALUE_CONFLICT',
          message: `${transition.key} no longer has the expected value`,
        });
      }
      const direction = transitionDirection(
        transition.key,
        transition.from,
        transition.to,
      );
      if (direction !== 'backward') {
        throw new ConflictException({
          code: 'INVALID_FLAG_TRANSITION',
          message: 'Authority tuple transitions must roll both flags backward',
        });
      }
      fromTuple[transition.key] = {
        value: transition.from,
        version: expectedVersion,
      };
      toTuple[transition.key] = {
        value: transition.to,
        version: expectedVersion + 1,
      };
    }
    const gate = verifyGateBundle(input.gateBundlePath, input.gateBundleHash, {
      kind: 'tuple',
      tupleKeys: keys,
      fromTuple,
      toTuple,
    });
    const requestPayload = {
      expectedVersions: input.expectedVersions,
      transitions,
      gateBundlePath: gate.path,
      gateBundleHash: gate.hash,
      reason: input.reason,
    };

    return this.withIdempotency(
      userId,
      'operation_flags.tuple_transition',
      'operation_flag_tuple',
      keys.join(','),
      normalizedIdempotencyKey,
      requestPayload,
      async (tx) => {
        const lockedRows = await this.lockAllFlags(tx);
        const epoch = await this.lockCutoverEpoch(tx);
        if (epoch.first_new_write_at) {
          throw new ConflictException({
            code: 'CUTOVER_LATCHED',
            message: 'Read/write authority cannot roll back after the first new write',
          });
        }
        const updated: FlagRow[] = [];
        for (const transition of transitions) {
          const locked = requireFlagRow(lockedRows, transition.key);
          const expectedVersion = input.expectedVersions[transition.key];
          if (
            expectedVersion === undefined ||
            locked.version !== expectedVersion ||
            locked.value !== transition.from
          ) {
            throw versionConflict(transition.key, locked);
          }
          const rows = await tx.$queryRaw<FlagRow[]>`
            UPDATE v1_game_operation_flags
            SET value = ${transition.to},
                version = version + 1,
                owner_actor = 'platform_ops',
                updated_by_user_id = ${userId},
                rollback_value = ${locked.value},
                updated_at = CURRENT_TIMESTAMP
            WHERE key = ${transition.key}::"V1GameOperationFlagKey"
              AND version = ${expectedVersion}
              AND value = ${transition.from}
            RETURNING key, value, version, owner_actor, updated_by_user_id, rollback_value, updated_at
          `;
          const changed = rows[0];
          if (!changed) {
            throw versionConflict(transition.key, locked);
          }
          updated.push(changed);
          await this.writeControlEffect(
            tx,
            normalizedIdempotencyKey,
            'OPERATION_FLAG_TUPLE_ROLLBACK',
            'GAME_OPERATION_FLAG_CHANGED',
            'operation_flag',
            transition.key,
            input.reason,
            flagAuditState(locked),
            {
              ...flagAuditState(changed),
              gateBundlePath: gate.path,
              gateBundleHash: gate.hash,
              gatePhase: gate.phase,
              gateAttemptId: gate.attemptId,
            },
          );
        }
        const write = updated.find((row) => row.key === 'GAME_WRITE');
        if (!write) {
          throw new ConflictException({
            code: 'INVALID_FLAG_TRANSITION',
            message: 'GAME_WRITE must be included in an authority rollback',
          });
        }
        await tx.$executeRaw`
          UPDATE v1_game_cutover_epochs
          SET write_mode = ${write.value}::"V1GameWriteMode",
              version = version + 1,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = 'game-cutover'
        `;
        return {
          flags: updated.sort((left, right) => left.key.localeCompare(right.key)).map(presentFlag),
          cutoverEpochVersion: epoch.version + 1,
        };
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

  async withNewWriteAuthority<T>(
    resourceId: string,
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    if (resourceId.trim().length === 0) {
      throw new BadRequestException({
        code: 'RESOURCE_ID_REQUIRED',
        message: 'New-authority writes require a resource id',
      });
    }
    await this.ensureDefaults();
    return this.prisma.$transaction(
      async (tx) => {
        const flags = await this.lockAllFlags(tx);
        const epoch = await this.lockCutoverEpoch(tx);
        const writeFlag = requireFlagRow(flags, 'GAME_WRITE');
        if (writeFlag.value !== 'new' || epoch.write_mode !== 'new') {
          throw new ConflictException({
            code: 'NEW_WRITE_AUTHORITY_DISABLED',
            message: 'New game write authority is not enabled',
          });
        }
        const result = await operation(tx);
        if (!epoch.first_new_write_at) {
          await tx.$executeRaw`
            UPDATE v1_game_cutover_epochs
            SET first_new_write_at = CURRENT_TIMESTAMP,
                first_new_write_resource_id = ${resourceId},
                version = version + 1,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = 'game-cutover'
              AND first_new_write_at IS NULL
          `;
        }
        return result;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async assertPlatformOps(userId: string) {
    return this.adminContext.getMutationAdmin(userId);
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
    await this.prisma.$executeRaw`
      INSERT INTO v1_game_cutover_epochs
        (id, version, write_mode, updated_at)
      VALUES ('game-cutover', 0, 'legacy', ${now})
      ON CONFLICT (id) DO NOTHING
    `;
  }

  private async readFlags() {
    return this.prisma.$queryRaw<FlagRow[]>`
      SELECT key, value, version, owner_actor, updated_by_user_id, rollback_value, updated_at
      FROM v1_game_operation_flags
      ORDER BY key
    `;
  }

  private async lockAllFlags(tx: Prisma.TransactionClient) {
    return tx.$queryRaw<FlagRow[]>`
      SELECT key, value, version, owner_actor, updated_by_user_id, rollback_value, updated_at
      FROM v1_game_operation_flags
      WHERE key IN ('GAME_READ', 'GAME_WRITE', 'PUBLIC_LIVE', 'DIRECTOR_OFFICIALIZE')
      ORDER BY key
      FOR UPDATE
    `;
  }

  private async lockCutoverEpoch(tx: Prisma.TransactionClient) {
    const rows = await tx.$queryRaw<CutoverRow[]>`
      SELECT version, write_mode, first_new_write_at, first_new_write_resource_id
      FROM v1_game_cutover_epochs
      WHERE id = 'game-cutover'
      FOR UPDATE
    `;
    const row = rows[0];
    if (!row) {
      throw new NotFoundException({
        code: 'CUTOVER_EPOCH_NOT_FOUND',
        message: 'Game cutover epoch was not found',
      });
    }
    return row;
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
    case 'GAME_WRITE':
    case 'GAME_READ':
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
  const valid =
    ((key === 'GAME_WRITE' || key === 'GAME_READ') &&
      (value === 'legacy' || value === 'new')) ||
    (key === 'GAME_READ' && value === 'compare') ||
    ((key === 'PUBLIC_LIVE' || key === 'DIRECTOR_OFFICIALIZE') &&
      (value === 'off' || value === 'on'));
  if (valid) return value;
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

function assertSingleTransition(
  key: GameOperationFlagKey,
  from: string,
  to: string,
) {
  const forward =
    (key === 'GAME_READ' &&
      ((from === 'legacy' && to === 'compare') ||
        (from === 'compare' && to === 'new'))) ||
    (key === 'GAME_WRITE' && from === 'legacy' && to === 'new') ||
    ((key === 'PUBLIC_LIVE' || key === 'DIRECTOR_OFFICIALIZE') &&
      from === 'off' &&
      to === 'on');
  const booleanRollback =
    (key === 'PUBLIC_LIVE' || key === 'DIRECTOR_OFFICIALIZE') &&
    from === 'on' &&
    to === 'off';
  if (forward || booleanRollback) return;
  if (
    (key === 'GAME_WRITE' && from === 'new' && to === 'legacy') ||
    (key === 'GAME_READ' &&
      ((from === 'new' && (to === 'compare' || to === 'legacy')) ||
        (from === 'compare' && to === 'legacy')))
  ) {
    throw new ConflictException({
      code: 'TUPLE_TRANSITION_REQUIRED',
      message: 'Read/write authority rollback requires tuple-transition',
    });
  }
  throw new ConflictException({
    code: 'INVALID_FLAG_TRANSITION',
    message: `${key} cannot transition from ${from} to ${to}`,
  });
}

function assertFrozenForwardOrder(
  key: GameOperationFlagKey,
  from: string,
  to: string,
  rows: FlagRow[],
) {
  if (transitionDirection(key, from, to) !== 'forward') return;
  const read = requireFlagRow(rows, 'GAME_READ');
  const write = requireFlagRow(rows, 'GAME_WRITE');
  const valid =
    (key === 'GAME_READ' && from === 'legacy' && to === 'compare') ||
    (key === 'GAME_WRITE' &&
      from === 'legacy' &&
      to === 'new' &&
      read.value === 'compare') ||
    (key === 'GAME_READ' &&
      from === 'compare' &&
      to === 'new' &&
      write.value === 'new') ||
    ((key === 'PUBLIC_LIVE' || key === 'DIRECTOR_OFFICIALIZE') &&
      write.value === 'new' &&
      read.value === 'new');
  if (!valid) {
    throw new ConflictException({
      code: 'CUTOVER_ORDER_VIOLATION',
      message: 'Operation flag transition violates the frozen cutover order',
    });
  }
}

function transitionDirection(
  key: GameOperationFlagKey,
  from: string,
  to: string,
): 'forward' | 'backward' {
  const order: readonly GameOperationFlagValue[] = FLAG_VALUES[key];
  const fromIndex = order.indexOf(parseFlagValue(key, from));
  const toIndex = order.indexOf(parseFlagValue(key, to));
  if (toIndex > fromIndex) return 'forward';
  if (toIndex < fromIndex) return 'backward';
  throw new ConflictException({
    code: 'INVALID_FLAG_TRANSITION',
    message: 'Flag transitions must change value',
  });
}

function normalizeTupleTransitions(
  values: GameOperationFlagTransitionInput[],
): GameOperationFlagTransitionInput[] {
  if (!Array.isArray(values) || values.length === 0) {
    throw new BadRequestException({
      code: 'TRANSITIONS_REQUIRED',
      message: 'At least one transition is required',
    });
  }
  const seen = new Set<GameOperationFlagKey>();
  const transitions = values.map((value) => {
    const key = parseFlagKey(value.key);
    if (seen.has(key)) {
      throw new BadRequestException({
        code: 'DUPLICATE_FLAG_TRANSITION',
        message: `Duplicate transition for ${key}`,
      });
    }
    seen.add(key);
    return {
      key,
      from: parseFlagValue(key, value.from),
      to: parseFlagValue(key, value.to),
    };
  });
  return transitions.sort((left, right) => left.key.localeCompare(right.key));
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

function verifyGateBundle(
  path: string,
  expectedHash: string,
  expected: ExpectedGateTransition,
): VerifiedGateBundle {
  const document = readImmutableJson(path, expectedHash, true);
  assertExactKeys(
    document,
    expected.kind === 'single'
      ? [
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
        ]
      : [
          'schemaVersion',
          'phase',
          'attemptId',
          'baselineSHA',
          'candidateSHA',
          'planSHA',
          'transition',
          'tupleKeys',
          'fromTuple',
          'toTuple',
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
      ...(expected.kind === 'single'
        ? ['key', 'from', 'to']
        : ['tupleKeys', 'fromTuple', 'toTuple']),
    ],
    'gate bundle',
  );
  if (document.schemaVersion !== 1) gateFailure('Unsupported gate bundle schema');
  const identity = readGateIdentity(document);
  assertGatePhase(identity.phase, expected);
  const transition = requireString(document.transition, 'transition');
  const expectedFileName = `flag-gate-${identity.attemptId}-${identity.phase}-${slug(transition)}.json`;
  if (basename(path) !== expectedFileName) {
    gateFailure('Gate bundle path does not match its attempt/phase/transition descriptor');
  }
  assertIsoTimestamp(document.createdAt, 'createdAt');
  if (expected.kind === 'single') {
    if (document.key !== expected.key) gateFailure('Gate bundle key does not match request');
    assertVersionObject(document.from, expected.from, 'from');
    assertVersionObject(document.to, expected.to, 'to');
  } else {
    const tupleKeys = readStringArray(document.tupleKeys, 'tupleKeys');
    if (
      tupleKeys.join('\u0000') !== expected.tupleKeys.join('\u0000') ||
      tupleKeys.join('\u0000') !== [...tupleKeys].sort().join('\u0000')
    ) {
      gateFailure('Gate tuple keys must be exact and lexically ordered');
    }
    assertTuple(document.fromTuple, expected.fromTuple, 'fromTuple');
    assertTuple(document.toTuple, expected.toTuple, 'toTuple');
  }
  const prerequisites = readPrerequisites(document.prerequisites);
  const requiredGates = requiredGatesFor(identity.phase, expected);
  if (
    prerequisites.map((item) => `${item.gateId}\u0000${item.commandId}`).join('\u0001') !==
    requiredGates.map((item) => `${item.gateId}\u0000${item.commandId}`).join('\u0001')
  ) {
    gateFailure(
      `Gate bundle requires exactly ${requiredGates
        .map((item) => `${item.gateId}/${item.commandId}`)
        .join(',')}`,
    );
  }
  const ordering = prerequisites.map((item) => `${item.gateId}\u0000${item.commandId}`);
  if (ordering.join('\u0000') !== [...ordering].sort().join('\u0000')) {
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

function assertGatePhase(phase: string, expected: ExpectedGateTransition) {
  if (phase === 'R1' || phase === 'R2') return;
  if (expected.kind === 'tuple') {
    if (phase !== 'C') gateFailure('Authority tuple rollback requires a Phase C bundle');
    return;
  }
  const isCompareEntry =
    expected.key === 'GAME_READ' &&
    expected.from.value === 'legacy' &&
    expected.to.value === 'compare';
  if ((isCompareEntry && phase !== 'B') || (!isCompareEntry && phase !== 'C')) {
    gateFailure('Gate phase does not match the requested transition');
  }
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
  const includesPublic =
    expected.kind === 'single'
      ? expected.key === 'PUBLIC_LIVE'
      : expected.tupleKeys.includes('PUBLIC_LIVE');
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

function requiredGatesFor(
  phase: string,
  expected: ExpectedGateTransition,
): RequiredGate[] {
  if (phase === 'R2') {
    return [{ gateId: 'V25', commandId: 'V25' }];
  }
  const keys =
    expected.kind === 'single' ? [expected.key] : expected.tupleKeys;
  const required = new Map<string, RequiredGate>();
  const add = (gateId: string, commandId: string) => {
    required.set(`${gateId}\u0000${commandId}`, { gateId, commandId });
  };
  for (const key of keys) {
    if (key === 'GAME_WRITE') {
      add('V10', 'V10');
      add('V25', 'V25');
    } else if (key === 'GAME_READ') {
      const from =
        expected.kind === 'single'
          ? expected.from.value
          : expected.fromTuple.GAME_READ?.value;
      const to =
        expected.kind === 'single'
          ? expected.to.value
          : expected.toTuple.GAME_READ?.value;
      add('V10', 'V10');
      if (from !== 'legacy' || to !== 'compare') add('V25', 'V25');
    } else if (key === 'PUBLIC_LIVE') {
      add('V24', 'V24');
      add('V26', 'PUBLIC-01');
    } else if (key === 'DIRECTOR_OFFICIALIZE') {
      add('V7', 'V7');
      add('V22', 'V22');
      add('V23', 'V23');
    }
  }
  return [...required.values()].sort((left, right) =>
    `${left.gateId}\u0000${left.commandId}`.localeCompare(
      `${right.gateId}\u0000${right.commandId}`,
    ),
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

function assertTuple(
  value: unknown,
  expected: Record<string, { value: string; version: number }>,
  label: string,
) {
  const record = requireRecord(value, label);
  assertExactKeys(record, Object.keys(expected), Object.keys(expected), label);
  for (const [key, state] of Object.entries(expected)) {
    assertVersionObject(record[key], state, `${label}.${key}`);
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

function readStringArray(value: unknown, label: string): string[] {
  if (!isStringArray(value)) {
    gateFailure(`${label} must be a string array`);
  }
  return value;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
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
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
}
