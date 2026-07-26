import { describe, expect, it } from 'vitest';
import { getTournamentPaymentDeadlineState } from './tournament-payment-deadline';

describe('getTournamentPaymentDeadlineState', () => {
  it('formats a future KST payment deadline for user-facing copy', () => {
    const state = getTournamentPaymentDeadlineState(
      '2026-06-14T02:00:00.000Z',
      new Date('2026-06-14T01:10:00.000Z'),
    );

    expect(state).toEqual({
      label: '6월 14일 11:00',
      isOverdue: false,
      message: '6월 14일 11:00까지 입금해 주세요.',
    });
  });

  it('marks an elapsed deadline without inventing a successful payment state', () => {
    const state = getTournamentPaymentDeadlineState(
      '2026-06-14T02:00:00.000Z',
      new Date('2026-06-14T02:01:00.000Z'),
    );

    expect(state).toEqual({
      label: '6월 14일 11:00',
      isOverdue: true,
      message: '입금 기한이 지났어요. 새로 신청해 주세요.',
    });
  });

  it('returns null when the API has not provided a usable deadline', () => {
    expect(getTournamentPaymentDeadlineState(null)).toBeNull();
    expect(getTournamentPaymentDeadlineState('not-a-date')).toBeNull();
  });
});
