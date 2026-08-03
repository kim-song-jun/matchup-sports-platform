import { ConflictException, ForbiddenException, UnprocessableEntityException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { OperationAuditWriterService } from '../../common/audit/operation-audit-writer.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  TournamentStaffAccessService,
  type TournamentStaffPrincipal,
} from '../../tournaments/staff/tournament-staff-access.service';
import {
  TournamentOperationsFieldsService,
  type TournamentOperationsFieldAuditContext,
} from './tournament-operations-fields.service';

const tournamentId = '00000000-0000-4000-8000-000000000001';
const fixtureId = '00000000-0000-4000-8000-000000000002';
const fieldId = '00000000-0000-4000-8000-000000000003';
const actorUserId = 'actor-1';

const audit = (requestId: string): TournamentOperationsFieldAuditContext => ({
  requestId,
  sourceIp: null,
});

function platformOpsPrincipal(): TournamentStaffPrincipal {
  return {
    userId: actorUserId,
    role: 'platform_ops',
    tournamentId,
    fixtureId: null,
    fieldOrCourtId: null,
    authorizationSubject: `platform_ops:${actorUserId}@0`,
    assignmentId: null,
    assignmentVersion: null,
  };
}

type FakeTx = ReturnType<typeof createFakeTx>;

function createFakeTx(initialFixtureFieldId: string | null) {
  const idempotency = new Map<string, { payloadHash: string; responseBody: unknown; expiresAt: Date }>();
  const fixture = { id: fixtureId, tournamentId, fieldId: initialFixtureFieldId };

  type IdempotencyKeyParts = {
    actorUserId: string;
    action: string;
    resourceType: string;
    resourceId: string;
    idempotencyKey: string;
  };
  const idempotencyKey = (w: IdempotencyKeyParts) =>
    [w.actorUserId, w.action, w.resourceType, w.resourceId, w.idempotencyKey].join('::');

  return {
    idempotency,
    fixture,
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    v1IdempotencyRecord: {
      findUnique: jest.fn(async ({ where }: { where: { actorUserId_action_resourceType_resourceId_idempotencyKey: IdempotencyKeyParts } }) => {
        const record = idempotency.get(idempotencyKey(where.actorUserId_action_resourceType_resourceId_idempotencyKey));
        return record ?? null;
      }),
      create: jest.fn(async ({ data }: { data: IdempotencyKeyParts & { payloadHash: string; responseBody: unknown; expiresAt: Date } }) => {
        idempotency.set(idempotencyKey(data), {
          payloadHash: data.payloadHash,
          responseBody: data.responseBody,
          expiresAt: data.expiresAt,
        });
        return { id: 'idem-1' };
      }),
    },
    v1TournamentField: {
      create: jest.fn(async ({ data }: { data: { scopeKey: string; name: string; sortOrder: number } }) => ({
        id: fieldId,
        tournamentId,
        scopeKey: data.scopeKey,
        name: data.name,
        sortOrder: data.sortOrder,
        active: true,
        version: 0,
      })),
      findUnique: jest.fn(async () => ({
        id: fieldId,
        tournamentId,
        scopeKey: 'court-a',
        name: 'Court A',
        sortOrder: 0,
        active: true,
        version: 0,
      })),
      updateMany: jest.fn(async () => ({ count: 0 })),
    },
    v1TournamentFixture: {
      findUnique: jest.fn(async () => ({ id: fixture.id, tournamentId: fixture.tournamentId, fieldId: fixture.fieldId })),
      updateMany: jest.fn(async ({ where, data }: { where: { fieldId: string | null }; data: { fieldId: string | null } }) => {
        if (where.fieldId !== fixture.fieldId) {
          return { count: 0 };
        }
        fixture.fieldId = data.fieldId;
        return { count: 1 };
      }),
    },
    v1OperationAudit: {
      create: jest.fn(async () => ({ id: 'audit-1' })),
    },
  };
}

async function buildHarness(options: {
  assertAccess: jest.Mock;
  fixtureFieldId?: string | null;
}) {
  const tx = createFakeTx(options.fixtureFieldId ?? null);
  const prisma = {
    $transaction: jest.fn(async (callback: (tx: FakeTx) => Promise<unknown>) => callback(tx)),
    v1Tournament: { findFirst: jest.fn().mockResolvedValue({ id: tournamentId }) },
  };

  const moduleRef = await Test.createTestingModule({
    providers: [
      TournamentOperationsFieldsService,
      { provide: PrismaService, useValue: prisma },
      { provide: TournamentStaffAccessService, useValue: { assertAccess: options.assertAccess } },
      OperationAuditWriterService,
    ],
  }).compile();

  return { service: moduleRef.get(TournamentOperationsFieldsService), moduleRef, prisma, tx };
}

describe('TournamentOperationsFieldsService', () => {
  // Finding #8 -- authorization TOCTOU: a revoke that has already committed
  // must be visible to the recheck performed as the FIRST STATEMENT INSIDE
  // the write transaction (not a pre-check that gates whether the
  // transaction is even opened), and no fixture row may be touched.
  //
  // A prior version of this test mocked `assertAccess` with
  // `mockRejectedValue` (always rejects) and asserted only that the promise
  // rejected and that `tx.v1TournamentFixture.updateMany`/`findUnique` were
  // never called. That passes identically whether the recheck runs BEFORE
  // `this.prisma.$transaction(...)` is even called (the pre-fix arrangement)
  // or, as shipped, AFTER `$transaction` has already opened: either way, an
  // unconditionally-rejecting `assertAccess` throws before any `tx` method
  // runs, so the old assertions cannot tell the two arrangements apart.
  //
  // This version additionally tracks call ORDER between `prisma.$transaction`
  // opening and `assertAccess` rejecting, plus asserts `prisma.$transaction`
  // WAS invoked despite the ultimate rejection. If `assignFixtureField` ever
  // reverts to checking access BEFORE `return this.prisma.$transaction(...)`
  // (moving the `assertAccess` call back above that line), the rejection
  // would happen first and `this.prisma.$transaction` would never be called
  // at all -- `order` would be only `['access-recheck']` and
  // `prisma.$transaction` would have 0 calls, failing both new assertions
  // below even though the old assertions would still pass.
  it('assignFixtureField opens the transaction BEFORE rechecking access -- a revoke that lands before the recheck aborts the write instead of a pre-transaction check masking whether the recheck runs inside it', async () => {
    const order: string[] = [];
    const assertAccess = jest.fn(async () => {
      order.push('access-recheck');
      throw new ForbiddenException({ code: 'ASSIGNMENT_REVOKED', message: 'revoked' });
    });
    const { service, moduleRef, tx, prisma } = await buildHarness({ assertAccess, fixtureFieldId: null });
    prisma.$transaction.mockImplementation(async (callback: (tx: FakeTx) => Promise<unknown>) => {
      order.push('transaction-opened');
      return callback(tx);
    });

    try {
      await expect(
        service.assignFixtureField(actorUserId, tournamentId, fixtureId, { fieldId }, audit('req-1')),
      ).rejects.toBeInstanceOf(ForbiddenException);

      // The transaction must already be open by the time the recheck runs and rejects --
      // proving the recheck executes as the first statement INSIDE assignFixtureField's
      // `$transaction` callback, not as a gate deciding whether `$transaction` is even called.
      expect(order).toEqual(['transaction-opened', 'access-recheck']);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(assertAccess).toHaveBeenCalledTimes(1);
      expect(tx.v1TournamentFixture.updateMany).not.toHaveBeenCalled();
      expect(tx.v1TournamentFixture.findUnique).not.toHaveBeenCalled();
    } finally {
      await moduleRef.close();
    }
  });

  // Finding #8 -- lost update: two operators who both observed fieldId=null
  // must not both succeed. The CAS predicate losing (count !== 1) must
  // surface as a conflict, not a silently accepted overwrite.
  it('assignFixtureField returns 409 when the CAS predicate no longer matches (lost-update race)', async () => {
    const assertAccess = jest.fn().mockResolvedValue(platformOpsPrincipal());
    const { service, moduleRef, tx } = await buildHarness({ assertAccess, fixtureFieldId: null });
    // Force the CAS to lose regardless of the observed value, simulating a
    // concurrent winner that already moved the row.
    tx.v1TournamentFixture.updateMany.mockResolvedValueOnce({ count: 0 });

    try {
      const promise = service.assignFixtureField(actorUserId, tournamentId, fixtureId, { fieldId }, audit('req-2'));
      await expect(promise).rejects.toBeInstanceOf(ConflictException);
      await expect(promise).rejects.toMatchObject({
        response: { code: 'FIXTURE_FIELD_ASSIGNMENT_CONFLICT' },
      });
    } finally {
      await moduleRef.close();
    }
  });

  // Finding #9 -- Idempotency-Key must be real idempotency: replaying the
  // same key and the same body must return the original result without
  // re-applying the mutation (the underlying create() must run only once).
  it('create() replays the original response for a repeated Idempotency-Key with the same body', async () => {
    const assertAccess = jest.fn().mockResolvedValue(platformOpsPrincipal());
    const { service, moduleRef, tx } = await buildHarness({ assertAccess });
    const dto = { scopeKey: 'court-a', name: 'Court A', sortOrder: 0 };

    try {
      const first = await service.create(actorUserId, tournamentId, dto, audit('same-key'));
      const second = await service.create(actorUserId, tournamentId, dto, audit('same-key'));

      expect(second).toEqual(first);
      expect(tx.v1TournamentField.create).toHaveBeenCalledTimes(1);
    } finally {
      await moduleRef.close();
    }
  });

  // Finding #9 -- reusing the same key with a materially different body must
  // be rejected, not silently treated as a fresh mutation or a valid replay.
  it('create() rejects a repeated Idempotency-Key when the request body changed', async () => {
    const assertAccess = jest.fn().mockResolvedValue(platformOpsPrincipal());
    const { service, moduleRef, tx } = await buildHarness({ assertAccess });

    try {
      await service.create(
        actorUserId,
        tournamentId,
        { scopeKey: 'court-a', name: 'Court A', sortOrder: 0 },
        audit('reused-key'),
      );

      await expect(
        service.create(
          actorUserId,
          tournamentId,
          { scopeKey: 'court-b', name: 'Court B', sortOrder: 1 },
          audit('reused-key'),
        ),
      ).rejects.toMatchObject({ response: { code: 'IDEMPOTENCY_PAYLOAD_CONFLICT' } });

      expect(tx.v1TournamentField.create).toHaveBeenCalledTimes(1);
    } finally {
      await moduleRef.close();
    }
  });

  // Finding #16.1 -- an empty patch must not fabricate a new version/audit
  // row; the request is rejected before any write is attempted.
  it('update() rejects an empty patch body without touching the database', async () => {
    const assertAccess = jest.fn().mockResolvedValue(platformOpsPrincipal());
    const { service, moduleRef, prisma, tx } = await buildHarness({ assertAccess });

    try {
      await expect(
        service.update(actorUserId, tournamentId, fieldId, { expectedVersion: 0 }, audit('req-3')),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(tx.v1TournamentField.updateMany).not.toHaveBeenCalled();
    } finally {
      await moduleRef.close();
    }
  });

  // Finding #16.2 -- field-list ordering must be total: `id` is the final
  // tie-breaker after sortOrder/createdAt so two fields with identical
  // sortOrder and createdAt still resolve to one deterministic order.
  it('list() orders by id as the final tie-breaker', async () => {
    const assertAccess = jest.fn().mockResolvedValue(platformOpsPrincipal());
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = {
      v1TournamentField: { findMany },
      v1Tournament: { findFirst: jest.fn().mockResolvedValue({ id: tournamentId }) },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        TournamentOperationsFieldsService,
        { provide: PrismaService, useValue: prisma },
        { provide: TournamentStaffAccessService, useValue: { assertAccess } },
        OperationAuditWriterService,
      ],
    }).compile();

    try {
      await moduleRef.get(TournamentOperationsFieldsService).list(actorUserId, tournamentId);
      const call = findMany.mock.calls[0][0] as { orderBy: readonly Record<string, string>[] };
      expect(call.orderBy.at(-1)).toEqual({ id: 'asc' });
    } finally {
      await moduleRef.close();
    }
  });
});
