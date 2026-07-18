import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TournamentRegistrationCountdown } from './tournament-registration-countdown';

describe('TournamentRegistrationCountdown', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows real remaining time and disappears after the deadline', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-07T22:00:00.000Z'));
    render(
      <TournamentRegistrationCountdown
        deadlineAt="2026-08-08T00:00:00.000Z"
        availability="available"
      />,
    );

    expect(screen.getByText('참가 신청 마감까지')).toBeInTheDocument();
    expect(screen.getByText('2시간 0분')).toBeInTheDocument();

    act(() => {
      vi.setSystemTime(new Date('2026-08-08T00:01:00.000Z'));
      vi.advanceTimersByTime(60_000);
    });

    expect(screen.queryByText('참가 신청 마감까지')).not.toBeInTheDocument();
  });
});
