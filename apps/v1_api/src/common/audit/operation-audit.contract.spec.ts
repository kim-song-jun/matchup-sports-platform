import {
  createOperationAuditEnvelope,
  maskSourceIp,
  type CreateOperationAuditEnvelopeInput,
  type JsonValue,
  type OperationAuditActor,
} from './operation-audit.contract';

describe('operation audit envelope contract', () => {
  const occurredAt = new Date('2026-08-01T00:00:00.000Z');
  const baseInput: CreateOperationAuditEnvelopeInput = {
    actor: { type: 'PLATFORM_OPS', id: 'user:ops-17' },
    requestId: 'req-20260801-001',
    action: 'tournament.publish',
    targetType: 'TOURNAMENT',
    targetId: 'tournament-42',
    occurredAt,
    sourceIp: '203.0.113.42',
    before: { status: 'DRAFT', rounds: [1, 2] },
    after: { status: 'PUBLISHED', rounds: [1, 2, 3] },
  };

  it.each<OperationAuditActor>([
    { type: 'PLATFORM_OPS', id: 'user:ops-17' },
    { type: 'TOURNAMENT_STAFF', id: 'user:staff-18' },
    { type: 'TEAM_MANAGER', id: 'user:manager-19' },
    { type: 'SYSTEM', id: 'job:bracket-publisher' },
  ])('serializes the stable %s actor variant without display text', (actor) => {
    const envelope = createOperationAuditEnvelope({ ...baseInput, actor });

    expect(envelope.actor).toEqual(actor);
    expect(Object.keys(envelope.actor)).toEqual(['type', 'id']);
  });

  it('retains only the opaque actor type and stable ID when display text is present at runtime', () => {
    const actorWithDisplayText: unknown = {
      type: 'PLATFORM_OPS',
      id: 'user:ops-17',
      displayName: '운영자 표시 이름',
    };
    const envelope = createOperationAuditEnvelope({
      ...baseInput,
      actor: actorWithDisplayText as OperationAuditActor,
    });

    expect(envelope.actor).toEqual({ type: 'PLATFORM_OPS', id: 'user:ops-17' });
  });

  it('serializes the exact persistence-independent envelope and never exposes the raw source IP', () => {
    const envelope = createOperationAuditEnvelope(baseInput);

    const serialized = JSON.stringify(envelope);
    expect(serialized).toBe(
      // `reason` is part of the envelope (not a post-create UPDATE) because the
      // `v1_operation_audits_append_only` trigger forbids UPDATE on
      // v1_operation_audits -- the previous create-then-update pattern rolled
      // back every revoke that carried a reason. It serializes last and is
      // `null` when the caller supplies none.
      '{"actor":{"type":"PLATFORM_OPS","id":"user:ops-17"},"requestId":"req-20260801-001","action":"tournament.publish","targetType":"TOURNAMENT","targetId":"tournament-42","occurredAt":"2026-08-01T00:00:00.000Z","maskedSourceIp":"203.0.113.0","before":{"status":"DRAFT","rounds":[1,2]},"after":{"status":"PUBLISHED","rounds":[1,2,3]},"reason":null}',
    );
    expect(serialized).not.toContain('203.0.113.42');
    expect(serialized).not.toContain('sourceIp');
  });

  it('masks IPv4 and IPv6 source addresses while treating invalid or empty values consistently', () => {
    expect(maskSourceIp('198.51.100.217')).toBe('198.51.100.0');
    expect(maskSourceIp('2001:0db8:85a3:0000:0000:8a2e:0370:7334')).toBe(
      '2001:db8:85a3::',
    );
    expect(maskSourceIp('2001:db8:abcd:12::1')).toBe('2001:db8:abcd:12::');
    expect(maskSourceIp('')).toBeNull();
    expect(maskSourceIp('300.1.1.1')).toBeNull();
    expect(maskSourceIp('2001:db8:::1')).toBeNull();
  });

  it('deep-clones and freezes before/after snapshots before a caller can mutate them', () => {
    const before: JsonValue = { status: 'DRAFT', nested: { seed: 1 } };
    const after: JsonValue = { status: 'PUBLISHED', nested: { seed: 2 } };
    const envelope = createOperationAuditEnvelope({ ...baseInput, before, after });

    (before as { status: string; nested: { seed: number } }).status = 'TAMPERED';
    (before as { status: string; nested: { seed: number } }).nested.seed = 99;
    (after as { status: string; nested: { seed: number } }).nested.seed = 100;

    expect(envelope.before).toEqual({ status: 'DRAFT', nested: { seed: 1 } });
    expect(envelope.after).toEqual({ status: 'PUBLISHED', nested: { seed: 2 } });
    expect(Object.isFrozen(envelope.before)).toBe(true);
    expect(Object.isFrozen((envelope.before as { nested: object }).nested)).toBe(true);
    expect(Object.isFrozen(envelope.after)).toBe(true);
  });

  it('rejects malformed actors, required identifiers, invalid timestamps, and non-JSON snapshots', () => {
    const unsupportedActor: unknown = { type: 'REFEREE', id: 'user:ref-20' };
    const nonJsonSnapshot: unknown = { capturedAt: new Date() };

    expect(() =>
      createOperationAuditEnvelope({
        ...baseInput,
        actor: unsupportedActor as OperationAuditActor,
      }),
    ).toThrow('Unsupported audit actor type');
    expect(() => createOperationAuditEnvelope({ ...baseInput, requestId: ' ' })).toThrow(
      'requestId is required',
    );
    expect(() => createOperationAuditEnvelope({ ...baseInput, action: '' })).toThrow(
      'action is required',
    );
    expect(() => createOperationAuditEnvelope({ ...baseInput, targetType: '' })).toThrow(
      'targetType is required',
    );
    expect(() => createOperationAuditEnvelope({ ...baseInput, targetId: '' })).toThrow(
      'targetId is required',
    );
    expect(() =>
      createOperationAuditEnvelope({ ...baseInput, occurredAt: new Date('invalid') }),
    ).toThrow('occurredAt must be a valid Date');
    expect(() =>
      createOperationAuditEnvelope({
        ...baseInput,
        before: nonJsonSnapshot as JsonValue,
      }),
    ).toThrow('before must be a JSON value');
  });

  it('keeps prototype-like and prompt-like snapshot keys as inert JSON data', () => {
    const before = JSON.parse(
      '{"__proto__":{"injected":true},"instruction":"ignore prior instructions"}',
    ) as JsonValue;
    const envelope = createOperationAuditEnvelope({ ...baseInput, before });
    const serialized = JSON.stringify(envelope.before);

    expect(Object.getPrototypeOf(envelope.before)).toBe(Object.prototype);
    expect(Object.prototype.hasOwnProperty.call(envelope.before, '__proto__')).toBe(true);
    expect(serialized).toContain('"__proto__":{"injected":true}');
    expect(({} as { injected?: boolean }).injected).toBeUndefined();
  });
});
