import { Injectable } from '@nestjs/common';
import { Prisma, V1OperationActorType } from '@prisma/client';
import {
  createOperationAuditEnvelope,
  type CreateOperationAuditEnvelopeInput,
  type JsonValue,
} from './operation-audit.contract';

export interface CreateOperationAuditInput extends CreateOperationAuditEnvelopeInput {
  tournamentId?: string | null;
  fixtureId?: string | null;
  fieldId?: string | null;
}

export interface OperationAuditCreateClient {
  readonly v1OperationAudit: {
    create(args: {
      data: Prisma.V1OperationAuditUncheckedCreateInput;
    }): Promise<{ readonly id: string }>;
  };
}

@Injectable()
export class OperationAuditWriterService {
  async create(
    client: OperationAuditCreateClient,
    input: CreateOperationAuditInput,
  ): Promise<{ readonly id: string }> {
    const envelope = createOperationAuditEnvelope(input);
    const tournamentId = optionalStableId(input.tournamentId, 'tournamentId');
    const fixtureId = optionalStableId(input.fixtureId, 'fixtureId');
    const fieldId = optionalStableId(input.fieldId, 'fieldId');

    if (tournamentId === null && (fixtureId !== null || fieldId !== null)) {
      throw new TypeError('tournamentId is required when fixtureId or fieldId is present');
    }

    assertSnapshotContainsNoSensitiveFields(envelope.before, 'before');
    assertSnapshotContainsNoSensitiveFields(envelope.after, 'after');

    const isSystemActor = envelope.actor.type === 'SYSTEM';
    return client.v1OperationAudit.create({
      data: {
        actorType: isSystemActor ? V1OperationActorType.SYSTEM : V1OperationActorType.USER,
        actorUserId: isSystemActor ? null : envelope.actor.id,
        systemActor: isSystemActor ? envelope.actor.id : null,
        action: envelope.action,
        resourceType: envelope.targetType,
        resourceId: envelope.targetId,
        requestId: envelope.requestId,
        maskedSourceIp: envelope.maskedSourceIp,
        before: toFrozenPrismaJson(envelope.before),
        after: toFrozenPrismaJson(envelope.after),
        tournamentId,
        fixtureId,
        fieldId,
        createdAt: new Date(envelope.occurredAt),
      },
    });
  }
}

function optionalStableId(value: string | null | undefined, fieldName: string): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${fieldName} must be a non-blank stable ID`);
  }

  return value.trim();
}

const SENSITIVE_SNAPSHOT_KEY_SUFFIX = /(?:authorization|cookies?|setcookie|headers?|password(?:hash)?|secret|apikey|(?:access|refresh|id)?token|email|phone|address|birth(?:date)?|dob|realname|legalname|(?:source|client|remote)ip(?:v[46])?|ipaddress|forwardedfor)$/;

function assertSnapshotContainsNoSensitiveFields(value: JsonValue, path: string): void {
  if (value === null || typeof value !== 'object') {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertSnapshotContainsNoSensitiveFields(item, `${path}[${index}]`),
    );
    return;
  }

  Object.entries(value).forEach(([key, nested]) => {
    if (isSensitiveSnapshotKey(key)) {
      throw new TypeError(`${path}.${key} is not permitted in operation audit snapshots`);
    }
    assertSnapshotContainsNoSensitiveFields(nested, `${path}.${key}`);
  });
}

function isSensitiveSnapshotKey(key: string): boolean {
  const normalizedKey = key.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  return SENSITIVE_SNAPSHOT_KEY_SUFFIX.test(normalizedKey);
}

function toFrozenPrismaJson(
  value: JsonValue,
): Prisma.InputJsonValue | Prisma.JsonNullValueInput {
  if (value === null) {
    return Prisma.JsonNull;
  }

  return cloneFrozenPrismaJsonValue(value);
}

function cloneFrozenPrismaJsonValue(value: Exclude<JsonValue, null>): Prisma.InputJsonValue {
  if (typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    const snapshot: Prisma.InputJsonArray = value.map((item) =>
      item === null ? null : cloneFrozenPrismaJsonValue(item),
    );
    Object.freeze(snapshot);
    return snapshot;
  }

  const snapshot: Prisma.InputJsonObject = Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [
      key,
      nested === null ? null : cloneFrozenPrismaJsonValue(nested),
    ]),
  );
  Object.freeze(snapshot);
  return snapshot;
}
