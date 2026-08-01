import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TournamentCampaignPrimaryAction } from './tournament-campaign-primary-action';
import { TournamentCampaignRegistrationProvider } from './tournament-campaign-registration-state';

describe('TournamentCampaignPrimaryAction', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('removes an application action once its registration deadline passes', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-07T23:58:00.000Z'));
    render(
      <TournamentCampaignRegistrationProvider
        availability="available"
        deadlineAt="2026-08-08T00:00:00.000Z"
      >
        <TournamentCampaignPrimaryAction
          action={{ label: '참가 신청하기', href: '/tournaments/tournament-1/my' }}
          enforceRegistrationDeadline
        />
      </TournamentCampaignRegistrationProvider>,
    );

    expect(screen.getByRole('link', { name: '참가 신청하기' })).toHaveAttribute(
      'href', '/tournaments/tournament-1/my',
    );

    act(() => {
      vi.setSystemTime(new Date('2026-08-08T00:01:00.000Z'));
      vi.advanceTimersByTime(60_000);
    });

    expect(screen.queryByRole('link', { name: '참가 신청하기' })).not.toBeInTheDocument();
  });

  it('keeps non-registration actions available without a deadline', () => {
    render(
      <TournamentCampaignRegistrationProvider availability="closed" deadlineAt={null}>
        <TournamentCampaignPrimaryAction
          action={{ label: '결과 보기', href: '/tournaments/tournament-1/results' }}
          enforceRegistrationDeadline={false}
        />
      </TournamentCampaignRegistrationProvider>,
    );

    expect(screen.getByRole('link', { name: '결과 보기' })).toHaveAttribute(
      'href', '/tournaments/tournament-1/results',
    );
  });

  it('keeps deadline-free registration available when the server marks it available', () => {
    render(
      <TournamentCampaignRegistrationProvider availability="available" deadlineAt={null}>
        <TournamentCampaignPrimaryAction
          action={{ label: '참가 신청하기', href: '/tournaments/tournament-1/my' }}
          enforceRegistrationDeadline
        />
      </TournamentCampaignRegistrationProvider>,
    );

    expect(screen.getByRole('link', { name: '참가 신청하기' })).toHaveAttribute(
      'href', '/tournaments/tournament-1/my',
    );
  });
});
