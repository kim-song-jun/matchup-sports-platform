import { describe, expect, it } from 'vitest';
import {
  canStartTournamentRegistration,
  describeTournamentCapacity,
  describeTournamentRegistrationBlock,
  resolveTournamentCapacity,
  resolveTournamentRegistrationBlock,
} from './tournament-registration-availability';

const NOW = new Date('2026-07-27T00:00:00.000Z');

function tournament(overrides: Partial<Parameters<typeof resolveTournamentCapacity>[0]> = {}) {
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
