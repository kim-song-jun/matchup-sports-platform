export const OPERATION_AUDIT_ACTOR_TYPES = [
  'PLATFORM_OPS',
  'TOURNAMENT_STAFF',
  'TEAM_MANAGER',
  'SYSTEM',
] as const;

export type OperationAuditActorType = (typeof OPERATION_AUDIT_ACTOR_TYPES)[number];

export type OperationAuditActor =
  | { readonly type: 'PLATFORM_OPS'; readonly id: string }
  | { readonly type: 'TOURNAMENT_STAFF'; readonly id: string }
  | { readonly type: 'TEAM_MANAGER'; readonly id: string }
  | { readonly type: 'SYSTEM'; readonly id: string };

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export interface CreateOperationAuditEnvelopeInput {
  actor: OperationAuditActor;
  requestId: string;
  action: string;
  targetType: string;
  targetId: string;
  occurredAt: Date;
  sourceIp?: string | null;
  before: JsonValue;
  after: JsonValue;
  /** Optional free-text justification persisted on the SAME audit row as the mutation it explains.
   * It must travel in the envelope rather than being patched on afterwards: the
   * `v1_operation_audits_append_only` trigger rejects every UPDATE against this table (SQLSTATE
   * 55000), so a create-then-update sequence cannot work, and a second follow-up row would break
   * the "one audit row per mutation" contract. */
  reason?: string | null;
}

export interface OperationAuditEnvelope {
  readonly actor: OperationAuditActor;
  readonly requestId: string;
  readonly action: string;
  readonly targetType: string;
  readonly targetId: string;
  readonly occurredAt: string;
  readonly maskedSourceIp: string | null;
  readonly before: JsonValue;
  readonly after: JsonValue;
  readonly reason: string | null;
}

export function createOperationAuditEnvelope(
  input: CreateOperationAuditEnvelopeInput,
): OperationAuditEnvelope {
  const actor = normalizeActor(input.actor);

  if (!(input.occurredAt instanceof Date) || Number.isNaN(input.occurredAt.getTime())) {
    throw new TypeError('occurredAt must be a valid Date');
  }

  return Object.freeze({
    actor,
    requestId: requireNonBlankString(input.requestId, 'requestId'),
    action: requireNonBlankString(input.action, 'action'),
    targetType: requireNonBlankString(input.targetType, 'targetType'),
    targetId: requireNonBlankString(input.targetId, 'targetId'),
    occurredAt: input.occurredAt.toISOString(),
    maskedSourceIp: maskSourceIp(input.sourceIp),
    before: cloneJsonSnapshot(input.before, 'before'),
    after: cloneJsonSnapshot(input.after, 'after'),
    reason: typeof input.reason === 'string' && input.reason.trim().length > 0 ? input.reason : null,
  });
}

export function maskSourceIp(sourceIp: string | null | undefined): string | null {
  if (typeof sourceIp !== 'string') {
    return null;
  }

  const candidate = sourceIp.trim();
  if (candidate.length === 0) {
    return null;
  }

  const ipv4 = parseIpv4(candidate);
  if (ipv4 !== null) {
    return `${ipv4[0]}.${ipv4[1]}.${ipv4[2]}.0`;
  }

  const ipv6 = parseIpv6(candidate);
  if (ipv6 === null) {
    return null;
  }

  return formatIpv6([...ipv6.slice(0, 4), 0, 0, 0, 0]);
}

function normalizeActor(actor: OperationAuditActor): OperationAuditActor {
  if (!isRecord(actor) || !isOperationAuditActorType(actor.type)) {
    throw new TypeError('Unsupported audit actor type');
  }

  return Object.freeze({
    type: actor.type,
    id: requireNonBlankString(actor.id, 'audit actor id'),
  });
}

function isOperationAuditActorType(value: unknown): value is OperationAuditActorType {
  return typeof value === 'string' && OPERATION_AUDIT_ACTOR_TYPES.includes(value as OperationAuditActorType);
}

function requireNonBlankString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${fieldName} is required`);
  }

  return value.trim();
}

function cloneJsonSnapshot(value: JsonValue, fieldName: string): JsonValue {
  if (!isJsonValue(value, new Set<object>())) {
    throw new TypeError(`${fieldName} must be a JSON value`);
  }

  return deepFreeze(JSON.parse(JSON.stringify(value)) as JsonValue);
}

function isJsonValue(value: unknown, ancestors: Set<object>): value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return true;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value);
  }

  if (typeof value !== 'object') {
    return false;
  }

  if (ancestors.has(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null && !Array.isArray(value)) {
    return false;
  }

  if (Object.getOwnPropertySymbols(value).length > 0) {
    return false;
  }

  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    Object.entries(descriptors).some(
      ([key, descriptor]) =>
        (key !== 'length' || !Array.isArray(value)) &&
        (!descriptor.enumerable || !('value' in descriptor)),
    )
  ) {
    return false;
  }

  ancestors.add(value);
  const valid = Array.isArray(value)
    ? value.every((item) => isJsonValue(item, ancestors))
    : Object.values(value).every((item) => isJsonValue(item, ancestors));
  ancestors.delete(value);

  return valid;
}

function deepFreeze(value: JsonValue): JsonValue {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => deepFreeze(item));
  } else {
    Object.values(value).forEach((item) => deepFreeze(item));
  }

  return Object.freeze(value);
}

function parseIpv4(value: string): number[] | null {
  const segments = value.split('.');
  if (segments.length !== 4) {
    return null;
  }

  const numbers = segments.map((segment) => {
    if (!/^(0|[1-9]\d{0,2})$/.test(segment)) {
      return Number.NaN;
    }
    return Number(segment);
  });

  return numbers.every((segment) => Number.isInteger(segment) && segment >= 0 && segment <= 255)
    ? numbers
    : null;
}

function parseIpv6(value: string): number[] | null {
  let candidate = value;
  if (candidate.includes('.')) {
    const separator = candidate.lastIndexOf(':');
    if (separator <= 0) {
      return null;
    }

    const embeddedIpv4 = parseIpv4(candidate.slice(separator + 1));
    if (embeddedIpv4 === null) {
      return null;
    }

    candidate = `${candidate.slice(0, separator)}:${((embeddedIpv4[0] << 8) | embeddedIpv4[1]).toString(16)}:${((embeddedIpv4[2] << 8) | embeddedIpv4[3]).toString(16)}`;
  }

  const compression = candidate.indexOf('::');
  if (compression !== -1 && candidate.indexOf('::', compression + 2) !== -1) {
    return null;
  }

  const left = compression === -1 ? candidate : candidate.slice(0, compression);
  const right = compression === -1 ? '' : candidate.slice(compression + 2);
  const leftGroups = parseIpv6Groups(left);
  const rightGroups = parseIpv6Groups(right);
  if (leftGroups === null || rightGroups === null) {
    return null;
  }

  const groupCount = leftGroups.length + rightGroups.length;
  if ((compression === -1 && groupCount !== 8) || (compression !== -1 && groupCount >= 8)) {
    return null;
  }

  return compression === -1
    ? leftGroups
    : [...leftGroups, ...Array(8 - groupCount).fill(0), ...rightGroups];
}

function parseIpv6Groups(value: string): number[] | null {
  if (value.length === 0) {
    return [];
  }

  const groups = value.split(':');
  if (groups.some((group) => !/^[0-9a-fA-F]{1,4}$/.test(group))) {
    return null;
  }

  return groups.map((group) => Number.parseInt(group, 16));
}

function formatIpv6(groups: number[]): string {
  const normalized = groups.map((group) => group.toString(16));
  let bestStart = -1;
  let bestLength = 0;
  let runStart = -1;

  for (let index = 0; index <= normalized.length; index += 1) {
    if (index < normalized.length && normalized[index] === '0') {
      if (runStart === -1) {
        runStart = index;
      }
      continue;
    }

    const runLength = runStart === -1 ? 0 : index - runStart;
    if (runLength > bestLength && runLength >= 2) {
      bestStart = runStart;
      bestLength = runLength;
    }
    runStart = -1;
  }

  if (bestStart === -1) {
    return normalized.join(':');
  }

  const before = normalized.slice(0, bestStart).join(':');
  const after = normalized.slice(bestStart + bestLength).join(':');
  if (before.length === 0 && after.length === 0) {
    return '::';
  }
  if (before.length === 0) {
    return `::${after}`;
  }
  if (after.length === 0) {
    return `${before}::`;
  }
  return `${before}::${after}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}
