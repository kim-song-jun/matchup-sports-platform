import {
  decideTournamentStaffAccess,
  type TournamentStaffAction,
  type TournamentStaffRole,
} from './tournament-staff-policy';

const IDS = {
  tournament: '77000000-0000-4000-8000-000000000040',
  otherTournament: '77000000-0000-4000-8000-000000000041',
  fixture: '77000000-0000-4000-8000-000000000050',
  otherFixture: '77000000-0000-4000-8000-000000000051',
  field: '77000000-0000-4000-8000-000000000060',
  otherField: '77000000-0000-4000-8000-000000000061',
} as const;

const NOW = '2026-08-01T12:00:00.000Z';

function assignment(role: TournamentStaffRole) {
  return {
    role,
    tournamentId: IDS.tournament,
    startsAt: '2026-08-01T11:00:00.000Z',
    expiresAt: null,
    revokedAt: null,
  };
}

function scopeAssignment(role: 'field_operator') {
  return {
    ...assignment(role),
    fixtureIds: [IDS.fixture],
    fieldId: IDS.field,
  };
}

function resource() {
  return {
    tournamentId: IDS.tournament,
    fixtureId: IDS.fixture,
    fieldId: IDS.field,
  };
}

function roleAssignment(role: TournamentStaffRole): object | undefined {
  switch (role) {
    case 'platform_ops':
    case 'team_manager':
    case 'public':
      return undefined;
    case 'tournament_director':
    case 'support_readonly':
      return assignment(role);
    case 'field_operator':
      return scopeAssignment(role);
  }
}

describe('Tournament staff policy', () => {
  it('PINs the six-role Game actor matrix against exact pure decisions', () => {
    // Given
    const actions = [
      'read',
      'tournament_command',
      'event_append',
      'event_reverse',
      'lineup_mutate',
      'cancel',
    ] as const satisfies readonly TournamentStaffAction[];
    const allowedByRole: Readonly<Record<TournamentStaffRole, readonly TournamentStaffAction[]>> = {
      platform_ops: actions,
      tournament_director: actions,
      // 2026-08-11: field_operator에 lineup_mutate 추가 — 경기 시작 권한(tournament_command)의
      // 전제조건인 라인업 제출을 현장 스태프가 직접 할 수 있어야 한다(알파 실측, 오너 결정).
      // 2026-08-27: field_operator에 event_reverse 추가 — 현장에서 오기록한 골/카드를
      // 현장에서 직접 되돌리고 어시스트를 지정할 수 있어야 한다(같은 논리, 알파 실측).
      field_operator: ['read', 'tournament_command', 'event_append', 'lineup_mutate', 'event_reverse'],
      support_readonly: ['read'],
      team_manager: ['read', 'lineup_mutate'],
      public: ['read'],
    };
    const roles = [
      'platform_ops',
      'tournament_director',
      'field_operator',
      'support_readonly',
      'team_manager',
      'public',
    ] as const satisfies readonly TournamentStaffRole[];
    let allowed = 0;
    let rejected = 0;

    for (const role of roles) {
      for (const action of actions) {
        // When
        const decision = decideTournamentStaffAccess({
          role,
          action,
          now: NOW,
          resource: resource(),
          ...(roleAssignment(role) === undefined ? {} : { assignment: roleAssignment(role) }),
        });
        const expectedAllowed = allowedByRole[role].includes(action);

        // Then
        expect(decision).toEqual({
          allowed: expectedAllowed,
          reason: expectedAllowed ? 'ALLOWED' : 'ROLE_ACTION_DENIED',
        });
        if (expectedAllowed) {
          allowed += 1;
        } else {
          rejected += 1;
        }
      }
    }

    expect({ allowed, rejected }).toEqual({ allowed: 21, rejected: 15 });
  });

  it('allows team managers only their frozen read and lineup mutation surface', () => {
    const base = {
      role: 'team_manager',
      now: NOW,
      resource: resource(),
    } as const;

    expect(decideTournamentStaffAccess({ ...base, action: 'read' })).toEqual({
      allowed: true,
      reason: 'ALLOWED',
    });
    expect(decideTournamentStaffAccess({ ...base, action: 'lineup_mutate' })).toEqual({
      allowed: true,
      reason: 'ALLOWED',
    });
    for (const action of ['tournament_command', 'event_append', 'event_reverse', 'cancel'] as const) {
      expect(decideTournamentStaffAccess({ ...base, action })).toEqual({
        allowed: false,
        reason: 'ROLE_ACTION_DENIED',
      });
    }
  });

  it('grants field_operator lineup_mutate + event_reverse (2026-08-11, 2026-08-27 fixes) without widening support_readonly', () => {
    // Given: field_operator must be able to submit the lineup that is a
    // precondition for the tournament_command it already holds (starting a
    // fixture requires a saved lineup first), and must be able to undo a
    // misrecorded event it just logged itself.
    const fieldOperatorBase = {
      role: 'field_operator',
      now: NOW,
      resource: resource(),
      assignment: scopeAssignment('field_operator'),
    } as const;

    // When / Then: field_operator now gets lineup_mutate and event_reverse...
    expect(decideTournamentStaffAccess({ ...fieldOperatorBase, action: 'lineup_mutate' })).toEqual({
      allowed: true,
      reason: 'ALLOWED',
    });
    expect(decideTournamentStaffAccess({ ...fieldOperatorBase, action: 'event_reverse' })).toEqual({
      allowed: true,
      reason: 'ALLOWED',
    });
    // ...while its still-excluded actions stay denied.
    for (const action of ['cancel', 'result_review', 'result_officialize'] as const) {
      expect(decideTournamentStaffAccess({ ...fieldOperatorBase, action })).toEqual({
        allowed: false,
        reason: 'ROLE_ACTION_DENIED',
      });
    }

    // support_readonly must remain read-only: this fix must not leak into it.
    const supportReadonlyBase = {
      role: 'support_readonly',
      now: NOW,
      resource: resource(),
      assignment: assignment('support_readonly'),
    } as const;
    expect(
      decideTournamentStaffAccess({ ...supportReadonlyBase, action: 'lineup_mutate' }),
    ).toEqual({ allowed: false, reason: 'ROLE_ACTION_DENIED' });
    expect(decideTournamentStaffAccess({ ...supportReadonlyBase, action: 'read' })).toEqual({
      allowed: true,
      reason: 'ALLOWED',
    });
  });

  it('allows public reads while rejecting every representative mutation', () => {
    const base = {
      role: 'public',
      now: NOW,
      resource: resource(),
    } as const;

    expect(decideTournamentStaffAccess({ ...base, action: 'read' })).toEqual({
      allowed: true,
      reason: 'ALLOWED',
    });
    for (const action of ['lineup_mutate', 'event_append', 'cancel'] as const) {
      expect(decideTournamentStaffAccess({ ...base, action })).toEqual({
        allowed: false,
        reason: 'ROLE_ACTION_DENIED',
      });
    }
  });

  it('re-evaluates revoked, expired, and not-started assignments at the supplied current time', () => {
    // Given
    const base = {
      role: 'field_operator',
      action: 'event_append',
      now: NOW,
      resource: resource(),
      assignment: scopeAssignment('field_operator'),
    } as const;

    // When / Then
    expect(
      decideTournamentStaffAccess({
        ...base,
        assignment: { ...base.assignment, revokedAt: '2026-08-01T11:59:59.999Z' },
      }),
    ).toEqual({ allowed: false, reason: 'ASSIGNMENT_REVOKED' });
    expect(
      decideTournamentStaffAccess({
        ...base,
        assignment: { ...base.assignment, expiresAt: NOW },
      }),
    ).toEqual({ allowed: false, reason: 'ASSIGNMENT_EXPIRED' });
    expect(
      decideTournamentStaffAccess({
        ...base,
        assignment: { ...base.assignment, startsAt: '2026-08-01T12:00:00.001Z' },
      }),
    ).toEqual({ allowed: false, reason: 'ASSIGNMENT_NOT_STARTED' });
    expect(
      decideTournamentStaffAccess({
        ...base,
        assignment: { ...base.assignment, startsAt: NOW },
      }),
    ).toEqual({ allowed: true, reason: 'ALLOWED' });
  });

  it('distinguishes absent and mismatched staff assignments from malformed assignment input', () => {
    // Given
    const input = {
      role: 'field_operator',
      action: 'event_append',
      now: NOW,
      resource: resource(),
    } as const;

    // When / Then
    expect(decideTournamentStaffAccess(input)).toEqual({
      allowed: false,
      reason: 'ASSIGNMENT_REQUIRED',
    });
    expect(
      decideTournamentStaffAccess({
        ...input,
        assignment: assignment('tournament_director'),
      }),
    ).toEqual({ allowed: false, reason: 'ASSIGNMENT_ROLE_MISMATCH' });
    expect(
      decideTournamentStaffAccess({
        ...input,
        assignment: {
          role: 'field_operator',
          tournamentId: IDS.tournament,
          revokedAt: null,
        },
      }),
    ).toEqual({ allowed: false, reason: 'INVALID_INPUT' });
  });

  it('fails closed for cross-tournament, fixture, field, and broad-resource scope mismatches', () => {
    // Given
    const input = {
      role: 'field_operator',
      action: 'event_append',
      now: NOW,
      resource: resource(),
      assignment: scopeAssignment('field_operator'),
    } as const;

    // When / Then
    expect(
      decideTournamentStaffAccess({
        ...input,
        resource: { ...input.resource, tournamentId: IDS.otherTournament },
      }),
    ).toEqual({ allowed: false, reason: 'CROSS_TOURNAMENT_SCOPE' });
    expect(
      decideTournamentStaffAccess({
        ...input,
        resource: { ...input.resource, fixtureId: IDS.otherFixture },
      }),
    ).toEqual({ allowed: false, reason: 'FIXTURE_SCOPE_DENIED' });
    expect(
      decideTournamentStaffAccess({
        ...input,
        resource: { ...input.resource, fieldId: IDS.otherField },
      }),
    ).toEqual({ allowed: false, reason: 'FIELD_SCOPE_DENIED' });
    expect(
      decideTournamentStaffAccess({
        ...input,
        resource: { tournamentId: IDS.tournament },
      }),
    ).toEqual({ allowed: false, reason: 'FIXTURE_SCOPE_REQUIRED' });
    expect(
      decideTournamentStaffAccess({
        ...input,
        assignment: { ...assignment('field_operator'), fixtureIds: [] },
      }),
    ).toEqual({ allowed: false, reason: 'INVALID_INPUT' });
  });

  it('rejects malformed IDs, invalid role/action values, and venue text at the runtime boundary', () => {
    // Given
    const valid = {
      role: 'tournament_director',
      action: 'event_reverse',
      now: NOW,
      resource: resource(),
      assignment: assignment('tournament_director'),
    } as const;

    // When / Then
    expect(
      decideTournamentStaffAccess({
        ...valid,
        resource: { ...valid.resource, tournamentId: 'not-a-stable-id' },
      }),
    ).toEqual({ allowed: false, reason: 'INVALID_INPUT' });
    expect(decideTournamentStaffAccess({ ...valid, role: 'malformed_role' })).toEqual({
      allowed: false,
      reason: 'INVALID_INPUT',
    });
    expect(decideTournamentStaffAccess({ ...valid, action: 'delete_everything' })).toEqual({
      allowed: false,
      reason: 'INVALID_INPUT',
    });
    expect(
      decideTournamentStaffAccess({
        ...valid,
        resource: { ...valid.resource, venueText: 'Main court by the river' },
      }),
    ).toEqual({ allowed: false, reason: 'INVALID_INPUT' });
  });
});
