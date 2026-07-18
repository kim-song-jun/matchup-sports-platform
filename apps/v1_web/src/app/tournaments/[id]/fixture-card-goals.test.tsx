import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { V1TournamentFixture } from '@/types/api';
import { FixtureCard } from './tournament-detail-client';

function makeFixture(overrides: Partial<V1TournamentFixture> = {}): V1TournamentFixture {
  return {
    id: 'fixture-1',
    groupId: null,
    round: 'final',
    fixtureNumber: 1,
    legNumber: 1,
    scheduledAt: null,
    venue: null,
    status: 'completed',
    homeRegistrationId: 'reg-home',
    homeTeamName: '서울 유나이티드',
    awayRegistrationId: 'reg-away',
    awayTeamName: '부산 FC',
    result: null,
    videos: [],
    ...overrides,
  };
}

describe('FixtureCard — 득점자 표시 (Task 109 Track 5)', () => {
  it('renders home and away scorer names on the correct side', () => {
    render(
      <FixtureCard
        fixture={makeFixture({
          result: {
            homeScore: 2,
            awayScore: 1,
            hasPenalty: false,
            homePenaltyScore: null,
            awayPenaltyScore: null,
            note: null,
            recordedAt: '2026-07-16T00:00:00.000Z',
            goals: [
              { id: 'goal-1', team: 'home', playerId: 'player-1', playerName: '홍길동', minute: 23 },
              { id: 'goal-2', team: 'away', playerId: null, playerName: '대타 선수', minute: 67 },
            ],
          },
        })}
      />,
    );

    expect(screen.getByText(/홍길동/)).toBeInTheDocument();
    expect(screen.getByText(/23′/)).toBeInTheDocument();
    expect(screen.getByText(/대타 선수/)).toBeInTheDocument();
    expect(screen.getByText(/67′/)).toBeInTheDocument();
  });

  it('renders nothing for the goal list when the result has no goals recorded', () => {
    render(
      <FixtureCard
        fixture={makeFixture({
          result: {
            homeScore: 0,
            awayScore: 0,
            hasPenalty: false,
            homePenaltyScore: null,
            awayPenaltyScore: null,
            note: null,
            recordedAt: '2026-07-16T00:00:00.000Z',
            goals: [],
          },
        })}
      />,
    );

    expect(screen.queryByRole('list', { name: '득점자' })).not.toBeInTheDocument();
  });
});
