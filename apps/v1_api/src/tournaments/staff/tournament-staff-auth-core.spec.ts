import 'reflect-metadata';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import type { ExecutionContext } from '@nestjs/common';
import { CurrentUser } from '../../auth/current-user.decorator';
import type { V1AuthUser } from '../../auth/v1-auth-user';
import { Reflector } from '@nestjs/core';
import { RequireTournamentStaff } from './require-tournament-staff.decorator';
import { TournamentStaffAccessService } from './tournament-staff-access.service';
import { TournamentStaffGuard } from './tournament-staff.guard';
import {
  decideTournamentStaffAccess,
  type TournamentStaffAction,
  type TournamentStaffRole,
} from './tournament-staff-policy';

type CustomRouteArgumentMetadata = {
  readonly factory: (data: unknown, context: ExecutionContext) => unknown;
};

const IDS = {
  user: '77000000-0000-4000-8000-000000000001',
  assignment: '77000000-0000-4000-8000-000000000010',
  tournament: '77000000-0000-4000-8000-000000000040',
  otherTournament: '77000000-0000-4000-8000-000000000041',
  fixture: '77000000-0000-4000-8000-000000000050',
  field: '77000000-0000-4000-8000-000000000060',
  otherField: '77000000-0000-4000-8000-000000000061',
} as const;

const NOW = new Date('2026-08-01T12:00:00.000Z');

const PERSONA_CASES = [
  { role: 'platform_ops', mutation: 'event_reverse', read: true, mutate: true },
  { role: 'tournament_director', mutation: 'event_reverse', read: true, mutate: true },
  { role: 'field_operator', mutation: 'event_append', read: true, mutate: true },
  { role: 'support_readonly', mutation: 'event_append', read: true, mutate: false },
  { role: 'team_manager', mutation: 'lineup_mutate', read: true, mutate: true },
  { role: 'public', mutation: 'event_append', read: true, mutate: false },
] as const satisfies readonly {
  role: TournamentStaffRole;
  mutation: TournamentStaffAction;
  read: boolean;
  mutate: boolean;
}[];

function evaluatePersonaMatrix() {
  return PERSONA_CASES.flatMap((persona) => {
    const assignment =
      persona.role === 'field_operator'
        ? {
            role: persona.role,
            tournamentId: IDS.tournament,
            startsAt: '2026-08-01T11:00:00.000Z',
            expiresAt: null,
            revokedAt: null,
            fixtureIds: [IDS.fixture],
            courtId: IDS.field,
          }
        : persona.role === 'tournament_director' || persona.role === 'support_readonly'
          ? {
              role: persona.role,
              tournamentId: IDS.tournament,
              startsAt: '2026-08-01T11:00:00.000Z',
              expiresAt: null,
              revokedAt: null,
            }
          : undefined;
    const decide = (action: TournamentStaffAction) =>
      decideTournamentStaffAccess({
        role: persona.role,
        action,
        now: NOW.toISOString(),
        resource: {
          tournamentId: IDS.tournament,
          fixtureId: IDS.fixture,
          courtId: IDS.field,
        },
        ...(assignment === undefined ? {} : { assignment }),
      });
    return [
      { persona: persona.role, action: 'read', expected: persona.read, decision: decide('read') },
      {
        persona: persona.role,
        action: persona.mutation,
        expected: persona.mutate,
        decision: decide(persona.mutation),
      },
    ];
  });
}

type DbRole = 'FIELD_OPERATOR' | 'SUPPORT_READONLY' | 'TOURNAMENT_DIRECTOR';

function staffAssignment(
  role: DbRole,
  overrides: Partial<{
    tournamentId: string;
    fieldId: string | null;
    version: number;
    expiresAt: Date | null;
    revokedAt: Date | null;
    fixtureScopes: readonly { fixtureId: string }[];
  }> = {},
) {
  const scoped = role === 'FIELD_OPERATOR';
  return {
    id: IDS.assignment,
    tournamentId: IDS.tournament,
    role,
    fieldId: scoped ? IDS.field : null,
    version: 4,
    createdAt: new Date('2026-08-01T11:00:00.000Z'),
    expiresAt: null,
    revokedAt: null,
    fixtureScopes: scoped ? [{ fixtureId: IDS.fixture }] : [],
    ...overrides,
  };
}

function accessService(options: {
  admin?: object | null;
  assignments?: readonly object[];
  findMany?: jest.Mock;
} = {}) {
  const prisma = {
    v1AdminUser: { findUnique: jest.fn().mockResolvedValue(options.admin ?? null) },
    v1TournamentStaffAssignment: {
      findMany: options.findMany ?? jest.fn().mockResolvedValue(options.assignments ?? []),
    },
  };
  return {
    prisma,
    service: new TournamentStaffAccessService(prisma as never, () => NOW),
  };
}

function staffInput(overrides: Partial<{
  action: 'read' | 'event_append';
  tournamentId: string;
  fixtureId: string;
  fieldId: string;
  expectedAssignmentVersion: number;
}> = {}) {
  return {
    userId: IDS.user,
    action: overrides.action ?? 'event_append',
    resource: {
      tournamentId: overrides.tournamentId ?? IDS.tournament,
      fixtureId: overrides.fixtureId ?? IDS.fixture,
      fieldId: overrides.fieldId ?? IDS.field,
    },
    ...(overrides.expectedAssignmentVersion === undefined
      ? {}
      : { expectedAssignmentVersion: overrides.expectedAssignmentVersion }),
  } as const;
}

function expectScopeDenial(promise: Promise<unknown>, reason: string) {
  return expect(promise).rejects.toMatchObject({
    response: { code: 'STAFF_SCOPE_DENIED', details: { reason } },
  });
}

function currentUserFactory(): CustomRouteArgumentMetadata['factory'] {
  class CharacterizationController {
    route(@CurrentUser() _user: V1AuthUser | undefined): void {}
  }

  const metadata: Readonly<Record<string, CustomRouteArgumentMetadata>> = Reflect.getMetadata(
    ROUTE_ARGS_METADATA,
    CharacterizationController,
    'route',
  );
  const entry = Object.values(metadata)[0];
  if (entry === undefined) {
    throw new Error('CurrentUser route metadata was not registered');
  }
  return entry.factory;
}

describe('Tournament staff auth core', () => {
  it('PINs the existing authenticated-user request/decorator convention', () => {
    const user = {
      id: '77000000-0000-4000-8000-000000000001',
      email: 'operator@example.com',
      accountStatus: 'active',
      onboardingStatus: 'completed',
    } as const satisfies V1AuthUser;
    const context = {
      switchToHttp: () => ({ getRequest: () => ({ v1User: user }) }),
    } as ExecutionContext;

    expect(currentUserFactory()(undefined, context)).toBe(user);
  });

  it('revoked field operator is denied before handler', async () => {
    const handler = jest.fn();
    class TestController {
      @RequireTournamentStaff({ action: 'event_append' })
      route(): void {}
    }
    const assignment = staffAssignment('FIELD_OPERATOR', {
      revokedAt: new Date('2026-08-01T11:59:59.999Z'),
    });
    const { service } = accessService({ assignments: [assignment] });
    const guard = new TournamentStaffGuard(new Reflector(), service);
    const context = {
      getHandler: () => TestController.prototype.route,
      getClass: () => TestController,
      switchToHttp: () => ({
        getRequest: () => ({
          v1User: { id: IDS.user },
          params: {
            tournamentId: assignment.tournamentId,
            fixtureId: assignment.fixtureScopes[0].fixtureId,
            fieldId: assignment.fieldId,
          },
          header: () => undefined,
        }),
      }),
    } as unknown as ExecutionContext;

    const dispatch = async () => {
      if (await guard.canActivate(context)) handler();
    };

    await expectScopeDenial(dispatch(), 'ASSIGNMENT_REVOKED');
    expect(handler).not.toHaveBeenCalled();

    const platform = accessService({
      admin: {
        adminRole: 'ops',
        status: 'active',
        revokedAt: null,
        updatedAt: new Date('2026-08-01T10:00:00.000Z'),
        user: { accountStatus: 'active' },
      },
    });
    await expect(platform.service.assertAccess(staffInput())).resolves.toMatchObject({ role: 'platform_ops' });
    await expect(
      accessService({ assignments: [staffAssignment('TOURNAMENT_DIRECTOR')] }).service.assertAccess(
        staffInput(),
      ),
    ).resolves.toMatchObject({ role: 'tournament_director' });
    await expect(
      accessService({ assignments: [staffAssignment('FIELD_OPERATOR')] }).service.assertAccess(
        staffInput(),
      ),
    ).resolves.toMatchObject({ role: 'field_operator' });
    await expect(
      accessService({ assignments: [staffAssignment('SUPPORT_READONLY')] }).service.assertAccess(
        staffInput({ action: 'read' }),
      ),
    ).resolves.toMatchObject({ role: 'support_readonly' });
    const personaOutcomes = evaluatePersonaMatrix();
    for (const outcome of personaOutcomes) {
      expect(outcome.decision.allowed).toBe(outcome.expected);
    }
    await expectScopeDenial(
      accessService({ assignments: [staffAssignment('FIELD_OPERATOR')] }).service.assertAccess(
        staffInput({ tournamentId: IDS.otherTournament }),
      ),
      'CROSS_TOURNAMENT_SCOPE',
    );
    const crossCourt = decideTournamentStaffAccess({
      role: 'field_operator',
      action: 'event_append',
      now: NOW.toISOString(),
      resource: {
        tournamentId: IDS.tournament,
        fixtureId: IDS.fixture,
        courtId: IDS.otherField,
      },
      assignment: {
        role: 'field_operator',
        tournamentId: IDS.tournament,
        startsAt: '2026-08-01T11:00:00.000Z',
        expiresAt: null,
        revokedAt: null,
        fixtureIds: [IDS.fixture],
        fieldId: IDS.field,
      },
    });
    expect(crossCourt).toEqual(
      { allowed: false, reason: 'FIELD_SCOPE_DENIED' },
    );
    const personaCount = new Set(personaOutcomes.map((outcome) => outcome.persona)).size;
    const summary = [
      'TASK7_AUTH_CORE=PASS',
      `personas=${personaCount}`,
      `allowed=${personaOutcomes.filter((outcome) => outcome.decision.allowed).length}`,
      `denied=${personaOutcomes.filter((outcome) => !outcome.decision.allowed).length}`,
      `revoked=${handler.mock.calls.length === 0 ? 'deny' : 'allow'}`,
      'crossTournament=deny',
      `crossCourt=${crossCourt.allowed ? 'allow' : 'deny'}`,
      `downstreamWrites=${handler.mock.calls.length}`,
    ].join(' ');
    expect(summary).toBe(
      'TASK7_AUTH_CORE=PASS personas=6 allowed=10 denied=2 revoked=deny crossTournament=deny crossCourt=deny downstreamWrites=0',
    );
    console.log(summary);
  });

  it('re-reads assignment state and denies revoke or expiry immediately', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([staffAssignment('FIELD_OPERATOR')])
      .mockResolvedValueOnce([
        staffAssignment('FIELD_OPERATOR', { revokedAt: new Date('2026-08-01T12:00:00.000Z') }),
      ])
      .mockResolvedValueOnce([
        staffAssignment('FIELD_OPERATOR', { expiresAt: new Date('2026-08-01T12:00:00.000Z') }),
      ]);
    const { service } = accessService({ findMany });

    await expect(service.assertAccess(staffInput())).resolves.toMatchObject({ assignmentVersion: 4 });
    await expectScopeDenial(service.assertAccess(staffInput()), 'ASSIGNMENT_REVOKED');
    await expectScopeDenial(service.assertAccess(staffInput()), 'ASSIGNMENT_EXPIRED');
    expect(findMany).toHaveBeenCalledTimes(3);
  });

  it('fails closed for stale assignment version and malformed stable scope', async () => {
    const { service } = accessService({ assignments: [staffAssignment('FIELD_OPERATOR')] });

    await expectScopeDenial(
      service.assertAccess(staffInput({ expectedAssignmentVersion: 3 })),
      'STALE_ASSIGNMENT_VERSION',
    );
    await expectScopeDenial(
      service.assertAccess(staffInput({ tournamentId: 'malformed-tournament' })),
      'INVALID_INPUT',
    );
  });

  it('proves explicit six-persona read and representative mutation outcomes', () => {
    const outcomes = evaluatePersonaMatrix();
    for (const outcome of outcomes) {
      expect(outcome.decision.allowed).toBe(outcome.expected);
    }

    expect(outcomes).toHaveLength(12);
    expect(new Set(outcomes.map((outcome) => outcome.persona))).toEqual(
      new Set(PERSONA_CASES.map((persona) => persona.role)),
    );
    expect(outcomes.filter((outcome) => outcome.decision.allowed)).toHaveLength(10);
    expect(outcomes.filter((outcome) => !outcome.decision.allowed)).toHaveLength(2);
    expect(
      outcomes.find(
        (outcome) => outcome.persona === 'team_manager' && outcome.action === 'lineup_mutate',
      )?.decision,
    ).toEqual({ allowed: true, reason: 'ALLOWED' });
    expect(
      outcomes.find(
        (outcome) => outcome.persona === 'public' && outcome.action === 'event_append',
      )?.decision,
    ).toEqual({ allowed: false, reason: 'ROLE_ACTION_DENIED' });
  });
});
