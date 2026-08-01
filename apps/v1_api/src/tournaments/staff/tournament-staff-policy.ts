export const TOURNAMENT_STAFF_ROLES = [
  'platform_ops',
  'tournament_director',
  'field_operator',
  'support_readonly',
  'team_manager',
  'public',
] as const;

export type TournamentStaffRole = (typeof TOURNAMENT_STAFF_ROLES)[number];

export const TOURNAMENT_STAFF_ACTIONS = [
  'read',
  'tournament_command',
  'event_append',
  'event_reverse',
  'lineup_mutate',
  'cancel',
] as const;

export type TournamentStaffAction = (typeof TOURNAMENT_STAFF_ACTIONS)[number];

export type TournamentStaffDecisionReason =
  | 'ALLOWED'
  | 'INVALID_INPUT'
  | 'ROLE_ACTION_DENIED'
  | 'ASSIGNMENT_REQUIRED'
  | 'ASSIGNMENT_ROLE_MISMATCH'
  | 'ASSIGNMENT_REVOKED'
  | 'ASSIGNMENT_NOT_STARTED'
  | 'ASSIGNMENT_EXPIRED'
  | 'CROSS_TOURNAMENT_SCOPE'
  | 'FIXTURE_SCOPE_REQUIRED'
  | 'FIXTURE_SCOPE_DENIED'
  | 'FIELD_SCOPE_REQUIRED'
  | 'FIELD_SCOPE_DENIED';

export type TournamentStaffDecision =
  | { readonly allowed: true; readonly reason: 'ALLOWED' }
  | { readonly allowed: false; readonly reason: Exclude<TournamentStaffDecisionReason, 'ALLOWED'> };

type ParsedAssignment = {
  readonly role: Extract<TournamentStaffRole, 'tournament_director' | 'field_operator' | 'support_readonly'>;
  readonly tournamentId: string;
  readonly startsAt: number;
  readonly expiresAt: number | null;
  readonly revokedAt: number | null;
  readonly fixtureIds: readonly string[];
  readonly fieldOrCourtId: string | null;
};

type ParsedResource = {
  readonly tournamentId: string;
  readonly fixtureId: string | null;
  readonly fieldOrCourtId: string | null;
};

type ParsedRequest = {
  readonly role: TournamentStaffRole;
  readonly action: TournamentStaffAction;
  readonly now: number;
  readonly resource: ParsedResource;
  readonly assignment: ParsedAssignment | null;
  readonly assignmentRoleMismatch: boolean;
};

const STABLE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function deny(reason: Exclude<TournamentStaffDecisionReason, 'ALLOWED'>): TournamentStaffDecision {
  return { allowed: false, reason };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasOwn(record: Readonly<Record<string, unknown>>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function hasOnlyKeys(record: Readonly<Record<string, unknown>>, allowedKeys: readonly string[]): boolean {
  return Object.keys(record).every((key) => allowedKeys.includes(key));
}

function isStableId(value: unknown): value is string {
  return typeof value === 'string' && STABLE_ID_PATTERN.test(value);
}

function parseInstant(value: unknown): number | null {
  if (typeof value !== 'string' || !ISO_INSTANT_PATTERN.test(value)) {
    return null;
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return null;
  }
  return new Date(timestamp).toISOString() === value ? timestamp : null;
}

function isRole(value: unknown): value is TournamentStaffRole {
  switch (value) {
    case 'platform_ops':
    case 'tournament_director':
    case 'field_operator':
    case 'support_readonly':
    case 'team_manager':
    case 'public':
      return true;
    default:
      return false;
  }
}

function isStaffAssignmentRole(
  value: TournamentStaffRole,
): value is ParsedAssignment['role'] {
  switch (value) {
    case 'tournament_director':
    case 'field_operator':
    case 'support_readonly':
      return true;
    case 'platform_ops':
    case 'team_manager':
    case 'public':
      return false;
  }
}

function isAction(value: unknown): value is TournamentStaffAction {
  switch (value) {
    case 'read':
    case 'tournament_command':
    case 'event_append':
    case 'event_reverse':
    case 'lineup_mutate':
    case 'cancel':
      return true;
    default:
      return false;
  }
}

function parseOptionalStableId(
  record: Readonly<Record<string, unknown>>,
  key: string,
): string | null | undefined {
  if (!hasOwn(record, key)) {
    return undefined;
  }
  const value = record[key];
  return isStableId(value) ? value : null;
}

function parseOptionalInstant(
  record: Readonly<Record<string, unknown>>,
  key: string,
): number | null | undefined | false {
  if (!hasOwn(record, key)) {
    return undefined;
  }
  const value = record[key];
  if (value === null) {
    return null;
  }
  const instant = parseInstant(value);
  return instant === null ? false : instant;
}

function parseFixtureIds(value: unknown): readonly string[] | null {
  if (!Array.isArray(value) || value.some((fixtureId) => !isStableId(fixtureId))) {
    return null;
  }
  if (new Set(value).size !== value.length) {
    return null;
  }
  return value;
}

function parseFieldOrCourtId(record: Readonly<Record<string, unknown>>): string | null | false {
  const fieldId = parseOptionalStableId(record, 'fieldId');
  const courtId = parseOptionalStableId(record, 'courtId');
  if (fieldId === null || courtId === null || (fieldId !== undefined && courtId !== undefined)) {
    return false;
  }
  return fieldId ?? courtId ?? null;
}

function parseAssignment(value: unknown): ParsedAssignment | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      'role',
      'tournamentId',
      'startsAt',
      'expiresAt',
      'revokedAt',
      'fixtureIds',
      'fieldId',
      'courtId',
    ]) ||
    !hasOwn(value, 'role') ||
    !hasOwn(value, 'tournamentId') ||
    !hasOwn(value, 'startsAt') ||
    !hasOwn(value, 'revokedAt')
  ) {
    return null;
  }
  const role = value.role;
  const tournamentId = value.tournamentId;
  const startsAt = parseInstant(value.startsAt);
  const parsedExpiresAt = parseOptionalInstant(value, 'expiresAt');
  const parsedRevokedAt = parseOptionalInstant(value, 'revokedAt');
  const fieldOrCourtId = parseFieldOrCourtId(value);
  const fixtureIds = hasOwn(value, 'fixtureIds') ? parseFixtureIds(value.fixtureIds) : [];
  if (
    !isRole(role) ||
    !isStaffAssignmentRole(role) ||
    !isStableId(tournamentId) ||
    startsAt === null ||
    parsedExpiresAt === false ||
    parsedRevokedAt === false ||
    parsedRevokedAt === undefined ||
    fieldOrCourtId === false ||
    fixtureIds === null
  ) {
    return null;
  }
  const expiresAt = parsedExpiresAt ?? null;
  const revokedAt = parsedRevokedAt;
  if (role === 'field_operator' && fixtureIds.length === 0 && fieldOrCourtId === null) {
    return null;
  }
  if (role !== 'field_operator' && (fixtureIds.length > 0 || fieldOrCourtId !== null)) {
    return null;
  }
  return { role, tournamentId, startsAt, expiresAt, revokedAt, fixtureIds, fieldOrCourtId };
}

function parseResource(value: unknown): ParsedResource | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['tournamentId', 'fixtureId', 'fieldId', 'courtId']) ||
    !hasOwn(value, 'tournamentId')
  ) {
    return null;
  }
  const tournamentId = value.tournamentId;
  const fixtureId = parseOptionalStableId(value, 'fixtureId');
  const fieldOrCourtId = parseFieldOrCourtId(value);
  if (!isStableId(tournamentId) || fixtureId === null || fieldOrCourtId === false) {
    return null;
  }
  return { tournamentId, fixtureId: fixtureId ?? null, fieldOrCourtId: fieldOrCourtId ?? null };
}

function parseRequest(value: unknown): ParsedRequest | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['role', 'action', 'now', 'resource', 'assignment']) ||
    !hasOwn(value, 'role') ||
    !hasOwn(value, 'action') ||
    !hasOwn(value, 'now') ||
    !hasOwn(value, 'resource')
  ) {
    return null;
  }
  const role = value.role;
  const action = value.action;
  const now = parseInstant(value.now);
  const resource = parseResource(value.resource);
  const assignmentPresent = hasOwn(value, 'assignment');
  const assignment = assignmentPresent ? parseAssignment(value.assignment) : null;
  if (!isRole(role) || !isAction(action) || now === null || resource === null) {
    return null;
  }
  if (isStaffAssignmentRole(role)) {
    if (!assignmentPresent) {
      return { role, action, now, resource, assignment: null, assignmentRoleMismatch: false };
    }
    if (assignment === null) {
      return null;
    }
    return {
      role,
      action,
      now,
      resource,
      assignment,
      assignmentRoleMismatch: assignment.role !== role,
    };
  }
  if (assignmentPresent) {
    return null;
  }
  return { role, action, now, resource, assignment: null, assignmentRoleMismatch: false };
}

function allowsRoleAction(role: TournamentStaffRole, action: TournamentStaffAction): boolean {
  switch (role) {
    case 'platform_ops':
    case 'tournament_director':
      return true;
    case 'field_operator':
      return action === 'read' || action === 'tournament_command' || action === 'event_append';
    case 'support_readonly':
    case 'public':
      return action === 'read';
    case 'team_manager':
      return action === 'read' || action === 'lineup_mutate';
  }
}

export function decideTournamentStaffAccess(input: unknown): TournamentStaffDecision {
  const request = parseRequest(input);
  if (request === null) {
    return deny('INVALID_INPUT');
  }
  if (!allowsRoleAction(request.role, request.action)) {
    return deny('ROLE_ACTION_DENIED');
  }
  if (request.assignmentRoleMismatch) {
    return deny('ASSIGNMENT_ROLE_MISMATCH');
  }
  if (isStaffAssignmentRole(request.role) && request.assignment === null) {
    return deny('ASSIGNMENT_REQUIRED');
  }
  if (request.assignment === null) {
    return { allowed: true, reason: 'ALLOWED' };
  }
  if (request.assignment.revokedAt !== null) {
    return deny('ASSIGNMENT_REVOKED');
  }
  if (request.assignment.startsAt > request.now) {
    return deny('ASSIGNMENT_NOT_STARTED');
  }
  if (request.assignment.expiresAt !== null && request.assignment.expiresAt <= request.now) {
    return deny('ASSIGNMENT_EXPIRED');
  }
  if (request.assignment.tournamentId !== request.resource.tournamentId) {
    return deny('CROSS_TOURNAMENT_SCOPE');
  }
  if (request.assignment.fixtureIds.length > 0) {
    if (request.resource.fixtureId === null) {
      return deny('FIXTURE_SCOPE_REQUIRED');
    }
    if (!request.assignment.fixtureIds.includes(request.resource.fixtureId)) {
      return deny('FIXTURE_SCOPE_DENIED');
    }
  }
  if (request.assignment.fieldOrCourtId !== null) {
    if (request.resource.fieldOrCourtId === null) {
      return deny('FIELD_SCOPE_REQUIRED');
    }
    if (request.assignment.fieldOrCourtId !== request.resource.fieldOrCourtId) {
      return deny('FIELD_SCOPE_DENIED');
    }
  }
  return { allowed: true, reason: 'ALLOWED' };
}
