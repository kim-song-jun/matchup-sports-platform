import { describe, expect, it } from 'vitest';
import {
  canStartTournamentRegistration,
  describeTournamentCapacity,
  describeTournamentRegistrationBlock,
  resolveTournamentCapacity,
  resolveTournamentRegistrationBlock,
} from './tournament-registration-availability';

const NOW = new Date('2026-07-27T00:00:00.000Z');

type CapacityFixture = Parameters<typeof resolveTournamentCapacity>[0] & {
  maxTeams?: number | null;
  maxPlayers?: number | null;
  activeRegistrationCount?: number;
};

function tournament(overrides: Partial<CapacityFixture> = {}) {
  return {
    status: 'open',
    teamCount: 8,
    confirmedCount: 5,
    pendingPaymentCount: 0,
    registrationDeadlineAt: '2026-08-10T14:59:00.000Z',
    ...overrides,
  };
}

describe('resolveTournamentCapacity', () => {
  it('counts awaiting-payment teams as reserved capacity', () => {
    const capacity = resolveTournamentCapacity(tournament({ confirmedCount: 5, pendingPaymentCount: 3 }));
    expect(capacity.reservedCount).toBe(8);
    expect(capacity.remainingCount).toBe(0);
    expect(capacity.isFull).toBe(true);
  });

  it('reports remaining slots when nothing is pending', () => {
    const capacity = resolveTournamentCapacity(tournament());
    expect(capacity.remainingCount).toBe(3);
    expect(capacity.isFull).toBe(false);
  });

  it('treats a zero-slot tournament as full, matching the server inequality', () => {
    // 서버는 reservedCount >= teamCount 로 검사하므로 teamCount=0 은 항상 거절된다.
    // 프론트만 "신청 가능"으로 판정하면 사용자가 위저드를 다 채운 뒤 409를 받는다.
    const capacity = resolveTournamentCapacity(
      tournament({ teamCount: 0, confirmedCount: 0, pendingPaymentCount: 0 }),
    );
    expect(capacity.isFull).toBe(true);
    expect(resolveTournamentRegistrationBlock(tournament({ teamCount: 0, confirmedCount: 0 }), NOW)).toBe(
      'capacity_full',
    );
  });

  it('clamps reserved count so over-booked data cannot exceed the cap', () => {
    const capacity = resolveTournamentCapacity(
      tournament({ confirmedCount: 8, pendingPaymentCount: 4 }),
    );
    expect(capacity.reservedCount).toBe(8);
    expect(capacity.remainingCount).toBe(0);
  });
});

describe('resolveTournamentRegistrationBlock', () => {
  it('allows registration while the tournament is open, before the deadline, with room left', () => {
    expect(resolveTournamentRegistrationBlock(tournament(), NOW)).toBeNull();
    expect(canStartTournamentRegistration(tournament(), NOW)).toBe(true);
  });

  it('blocks when awaiting-payment teams fill the remaining slots', () => {
    expect(
      resolveTournamentRegistrationBlock(tournament({ pendingPaymentCount: 3 }), NOW),
    ).toBe('capacity_full');
  });

  it('blocks after the registration deadline even when slots remain', () => {
    expect(
      resolveTournamentRegistrationBlock(
        tournament({ registrationDeadlineAt: '2026-07-01T00:00:00.000Z' }),
        NOW,
      ),
    ).toBe('deadline_passed');
  });

  it('blocks when the tournament is not open', () => {
    expect(resolveTournamentRegistrationBlock(tournament({ status: 'cancelled' }), NOW)).toBe('not_open');
    expect(resolveTournamentRegistrationBlock(tournament({ status: 'closed' }), NOW)).toBe('not_open');
  });

  it('ignores an unparseable deadline instead of blocking everyone', () => {
    expect(
      resolveTournamentRegistrationBlock(tournament({ registrationDeadlineAt: 'not-a-date' }), NOW),
    ).toBeNull();
  });

  it('treats a missing deadline as open-ended', () => {
    expect(
      resolveTournamentRegistrationBlock(tournament({ registrationDeadlineAt: null }), NOW),
    ).toBeNull();
  });
  it.each(['draft', 'open', 'in_progress'])('keeps a regular league open by future deadline while status is %s', (status) => {
    expect(resolveTournamentRegistrationBlock(tournament({ kind: 'regular_league', status, teamCount: 0, confirmedCount: 99, pendingPaymentCount: 99 }), NOW)).toBeNull();
  });

  it.each(['completed', 'cancelled'])('blocks a terminal regular league even with a future deadline: %s', (status) => {
    expect(resolveTournamentRegistrationBlock(tournament({ kind: 'regular_league', status, registrationDeadlineAt: '2026-08-10T14:59:00.000Z' }), NOW)).toBe('not_open');
  });

  it('blocks a regular league with no deadline or an expired deadline', () => {
    expect(resolveTournamentRegistrationBlock(tournament({ kind: 'regular_league', status: 'draft', registrationDeadlineAt: null }), NOW)).toBe('not_open');
    expect(resolveTournamentRegistrationBlock(tournament({ kind: 'regular_league', status: 'in_progress', registrationDeadlineAt: '2026-07-01T00:00:00.000Z' }), NOW)).toBe('deadline_passed');
  });

});

describe('copy helpers', () => {
  it('names awaiting-payment teams so a "5 / 8" card cannot look misleadingly open', () => {
    const capacity = resolveTournamentCapacity(tournament({ pendingPaymentCount: 3 }));
    expect(describeTournamentCapacity(capacity)).toBe('확정 5팀 · 입금대기 3팀 / 총 8팀');
    expect(describeTournamentRegistrationBlock('capacity_full', capacity)).toContain('입금대기 3팀이 자리를 잡고');
  });

  it('omits the awaiting-payment clause when there is none', () => {
    const capacity = resolveTournamentCapacity(tournament({ confirmedCount: 8 }));
    expect(describeTournamentCapacity(capacity)).toBe('확정 8팀 / 총 8팀');
    expect(describeTournamentRegistrationBlock('capacity_full', capacity)).not.toContain('입금대기');
  });

  it('explains the deadline and closed cases in 해요체', () => {
    const capacity = resolveTournamentCapacity(tournament());
    expect(describeTournamentRegistrationBlock('deadline_passed', capacity)).toBe(
      '신청이 마감돼서 새로 신청할 수 없어요.',
    );
    expect(describeTournamentRegistrationBlock('not_open', capacity)).toBe('지금은 참가 신청을 받지 않아요.');
  });
});

describe('regular league optional team capacity', () => {
  it.each(['draft', 'open', 'in_progress'])('blocks a full finite league while status is %s', (status) => {
    // Given: the actual team cap differs from the legacy tournament mirror default.
    const league = tournament({ kind: 'regular_league', status, maxTeams: 5, confirmedCount: 5 });
    // When: the same capacity data reaches the application entry and summary.
    const capacity = resolveTournamentCapacity(league);
    // Then: neither consumer offers a sixth reserved place.
    expect(resolveTournamentRegistrationBlock(league, NOW)).toBe('capacity_full');
    expect(canStartTournamentRegistration(league, NOW)).toBe(false);
    expect(capacity).toMatchObject({ reservedCount: 5, remainingCount: 0, isFull: true });
  });

  it('reserves places for awaiting_payment, payment_checking and paid in the server aggregate', () => {
    // Given: two confirmed teams and the three pending-payment statuses occupy five places.
    const league = tournament({
      kind: 'regular_league', maxTeams: 5, confirmedCount: 2, pendingPaymentCount: 3,
      activeRegistrationCount: 1,
    });
    // When: capacity is resolved from all-source serializer counts.
    const capacity = resolveTournamentCapacity(league);
    // Then: the applied-only operational count cannot replace occupancy.
    expect(capacity).toMatchObject({ reservedCount: 5, remainingCount: 0, isFull: true });
    expect(resolveTournamentRegistrationBlock(league, NOW)).toBe('capacity_full');
  });

  it.each([undefined, null])('keeps an unset team cap unlimited: %s', (maxTeams) => {
    // Given: neither the mirror teamCount nor the player cap limits team admission.
    const league = tournament({
      kind: 'regular_league', maxTeams, maxPlayers: 2, teamCount: 8,
      confirmedCount: 99, pendingPaymentCount: 99,
    });
    // When: unlimited capacity is resolved after more than eight registrations.
    const capacity = resolveTournamentCapacity(league);
    // Then: every reservation stays visible and another team can apply.
    expect(capacity).toMatchObject({ teamCount: null, reservedCount: 198, remainingCount: null, isFull: false });
    expect(describeTournamentCapacity(capacity)).toContain('무제한');
    expect(resolveTournamentRegistrationBlock(league, NOW)).toBeNull();
  });

  it('keeps player limits and applied-only counts independent from the team cap', () => {
    // Given: nine teams fit a ten-team league despite a smaller legacy mirror/player limit.
    const league = tournament({
      kind: 'regular_league', maxTeams: 10, maxPlayers: 2, teamCount: 8,
      confirmedCount: 9, activeRegistrationCount: 99,
    });
    // When: the remaining team places are calculated.
    const capacity = resolveTournamentCapacity(league);
    // Then: one team place remains and the actual nine occupied places are retained.
    expect(capacity).toMatchObject({ reservedCount: 9, remainingCount: 1, isFull: false });
    expect(resolveTournamentRegistrationBlock(league, NOW)).toBeNull();
  });

  it('retains actual occupancy when existing teams exceed a finite league cap', () => {
    // Given: historical data already contains six reserved teams against a three-team cap.
    const league = tournament({ kind: 'regular_league', maxTeams: 3, confirmedCount: 4, pendingPaymentCount: 2 });
    // When: the summary is resolved.
    const capacity = resolveTournamentCapacity(league);
    // Then: occupancy is never truncated to disguise the stored registrations.
    expect(capacity).toMatchObject({ reservedCount: 6, remainingCount: 0, isFull: true });
  });

  it('preserves the regular tournament teamCount contract', () => {
    // Given: a regular tournament still has eight team places.
    const competition = tournament({ kind: 'regular_tournament', maxTeams: 1, maxPlayers: 1 });
    // When: the tournament capacity is resolved.
    const capacity = resolveTournamentCapacity(competition);
    // Then: league and roster fields cannot shrink tournament capacity.
    expect(capacity).toMatchObject({ teamCount: 8, reservedCount: 5, remainingCount: 3, isFull: false });
    expect(resolveTournamentRegistrationBlock(competition, NOW)).toBeNull();
  });
});
