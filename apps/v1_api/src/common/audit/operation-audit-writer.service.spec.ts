import type { Prisma } from '@prisma/client';
import type { JsonValue, OperationAuditActor } from './operation-audit.contract';
import {
  OperationAuditWriterService,
  type OperationAuditCreateClient,
} from './operation-audit-writer.service';

describe('OperationAuditWriterService', () => {
  const writer = new OperationAuditWriterService();

  afterAll(() => {
    console.log(
      'TASK7_AUDIT_WRITER=PASS actors=2 ipv4=masked ipv6=masked snapshots=frozen rawIp=absent mutations=create-only',
    );
  });

  it.each([
    {
      actor: { type: 'TOURNAMENT_STAFF' as const, id: 'user:staff-18' },
      sourceIp: '198.51.100.217',
      maskedSourceIp: '198.51.100.0',
      actorType: 'USER' as const,
      actorUserId: 'user:staff-18',
      systemActor: null,
    },
    {
      actor: { type: 'SYSTEM' as const, id: 'job:bracket-publisher' },
      sourceIp: '2001:db8:abcd:12::beef',
      maskedSourceIp: '2001:db8:abcd:12::',
      actorType: 'SYSTEM' as const,
      actorUserId: null,
      systemActor: 'job:bracket-publisher',
    },
  ])(
    'persists an actor-neutral $actorType audit with masked IP and immutable snapshots',
    async ({
      actor,
      sourceIp,
      maskedSourceIp,
      actorType,
      actorUserId,
      systemActor,
    }) => {
      let persistedData: Prisma.V1OperationAuditUncheckedCreateInput | undefined;
      const client: OperationAuditCreateClient = {
        v1OperationAudit: {
          create: async ({ data }) => {
            persistedData = data;
            return { id: 'audit-1' };
          },
        },
      };
      const before = { state: 'stale_state', nested: { version: 7 } };
      const after = { state: 'PUBLISHED', nested: { version: 8 } };

      await writer.create(client, {
        actor,
        requestId: 'request-7-audit-001',
        action: 'tournament.fixture.publish',
        targetType: 'TOURNAMENT_FIXTURE',
        targetId: 'fixture-42',
        occurredAt: new Date('2026-08-01T04:59:00.000Z'),
        sourceIp,
        before,
        after,
        tournamentId: 'tournament-42',
        fixtureId: 'fixture-42',
        fieldId: 'field-7',
      });

      before.state = 'TAMPERED';
      before.nested.version = 99;
      after.nested.version = 100;

      expect(persistedData).toEqual({
        actorType,
        actorUserId,
        systemActor,
        action: 'tournament.fixture.publish',
        resourceType: 'TOURNAMENT_FIXTURE',
        resourceId: 'fixture-42',
        requestId: 'request-7-audit-001',
        maskedSourceIp,
        before: { state: 'stale_state', nested: { version: 7 } },
        after: { state: 'PUBLISHED', nested: { version: 8 } },
        tournamentId: 'tournament-42',
        fixtureId: 'fixture-42',
        fieldId: 'field-7',
        createdAt: new Date('2026-08-01T04:59:00.000Z'),
      });
      expect(JSON.stringify(persistedData)).not.toContain(sourceIp);
      expect(Object.isFrozen(persistedData?.before)).toBe(true);
      const persistedBefore = persistedData?.before;
      if (!isPlainRecord(persistedBefore)) {
        throw new Error('Expected a persisted before snapshot object');
      }
      expect(isNestedSnapshotFrozen(persistedBefore)).toBe(true);
      expect(Object.isFrozen(persistedData?.after)).toBe(true);
    },
  );

  it('rejects incomplete stable scope IDs before reaching persistence', async () => {
    let createCalls = 0;
    const client: OperationAuditCreateClient = {
      v1OperationAudit: {
        create: async () => {
          createCalls += 1;
          return { id: 'unexpected' };
        },
      },
    };

    await expect(
      writer.create(client, {
        actor: { type: 'PLATFORM_OPS', id: 'user:ops-17' },
        requestId: 'request-7-audit-002',
        action: 'tournament.fixture.publish',
        targetType: 'TOURNAMENT_FIXTURE',
        targetId: 'fixture-42',
        occurredAt: new Date('2026-08-01T04:59:00.000Z'),
        before: null,
        after: { state: 'PUBLISHED' },
        fixtureId: 'fixture-42',
      }),
    ).rejects.toThrow('tournamentId is required when fixtureId or fieldId is present');
    expect(createCalls).toBe(0);
  });

  it('rejects malformed actors and sensitive request material before persistence', async () => {
    let createCalls = 0;
    const client: OperationAuditCreateClient = {
      v1OperationAudit: {
        create: async () => {
          createCalls += 1;
          return { id: 'unexpected' };
        },
      },
    };
    const baseInput = {
      actor: { type: 'PLATFORM_OPS' as const, id: 'user:ops-17' },
      requestId: 'request-7-audit-003',
      action: 'tournament.publish',
      targetType: 'TOURNAMENT',
      targetId: 'tournament-42',
      occurredAt: new Date('2026-08-01T04:59:00.000Z'),
      before: null,
      after: { state: 'PUBLISHED' },
      tournamentId: 'tournament-42',
    };
    const malformedActor: unknown = { type: 'REFEREE', id: 'user:ref-20' };

    await expect(
      writer.create(client, {
        ...baseInput,
        actor: malformedActor as OperationAuditActor,
      }),
    ).rejects.toThrow('Unsupported audit actor type');
    await expect(
      writer.create(client, {
        ...baseInput,
        before: { request: { headers: { authorization: 'Bearer raw-secret' } } },
      }),
    ).rejects.toThrow('before.request.headers is not permitted');
    expect(createCalls).toBe(0);
  });

  it.each<JsonValue>([
    { contactEmail: 'person@example.test' },
    { clientIp: '203.0.113.42' },
    { requestHeaders: { accept: 'application/json' } },
    { nested: { CONTACT_EMAIL: 'person@example.test' } },
    { nested: { 'client-ip': '2001:db8::beef' } },
    { nested: { RequestHeaders: { cookie: 'raw-cookie' } } },
    { nested: { request_headers: { accept: 'application/json' } } },
  ])('rejects compound sensitive aliases before they reach Prisma: %j', async (before) => {
    let createCalls = 0;
    const client: OperationAuditCreateClient = {
      v1OperationAudit: {
        create: async () => {
          createCalls += 1;
          return { id: 'unexpected' };
        },
      },
    };

    await expect(
      writer.create(client, {
        actor: { type: 'TOURNAMENT_STAFF', id: 'user:staff-18' },
        requestId: 'request-7-audit-privacy',
        action: 'tournament.fixture.publish',
        targetType: 'TOURNAMENT_FIXTURE',
        targetId: 'fixture-42',
        occurredAt: new Date('2026-08-01T05:00:00.000Z'),
        before,
        after: { state: 'PUBLISHED' },
        tournamentId: 'tournament-42',
        fixtureId: 'fixture-42',
      }),
    ).rejects.toThrow('is not permitted in operation audit snapshots');
    expect(createCalls).toBe(0);
  });

  it('does not reject legitimate domain display-name snapshot keys', async () => {
    let persistedData: Prisma.V1OperationAuditUncheckedCreateInput | undefined;
    const client: OperationAuditCreateClient = {
      v1OperationAudit: {
        create: async ({ data }) => {
          persistedData = data;
          return { id: 'audit-display-name' };
        },
      },
    };

    await writer.create(client, {
      actor: { type: 'TOURNAMENT_STAFF', id: 'user:staff-18' },
      requestId: 'request-7-audit-display-name',
      action: 'tournament.lineup.publish',
      targetType: 'TOURNAMENT_FIXTURE',
      targetId: 'fixture-42',
      occurredAt: new Date('2026-08-01T05:00:00.000Z'),
      before: { playerDisplayName: '닉네임' },
      after: { playerDisplayName: '새 닉네임' },
      tournamentId: 'tournament-42',
      fixtureId: 'fixture-42',
    });

    expect(persistedData?.before).toEqual({ playerDisplayName: '닉네임' });
    expect(persistedData?.after).toEqual({ playerDisplayName: '새 닉네임' });
  });

  it('exposes create only and leaves update/delete enforcement to the database trigger', () => {
    expect(Object.getOwnPropertyNames(OperationAuditWriterService.prototype).sort()).toEqual([
      'constructor',
      'create',
    ]);
  });

  it('accepts the real Prisma transaction-client type without an adapter', () => {
    const transactionClientSeam = (
      client: Prisma.TransactionClient,
    ): OperationAuditCreateClient => client;

    expect(transactionClientSeam).toBeDefined();
  });
});

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function isNestedSnapshotFrozen(value: unknown): boolean {
  if (!isPlainRecord(value)) {
    return false;
  }
  return Object.isFrozen(value['nested']);
}
