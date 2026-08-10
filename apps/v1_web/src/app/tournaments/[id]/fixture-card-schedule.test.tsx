import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { V1TournamentFixture } from '@/types/api';
import { FixtureCard } from './tournament-detail-client';

function makeGroupFixture(scheduledAt: string | null): V1TournamentFixture {
  return {
    id: 'group-fixture-1',
    groupId: 'group-a',
    round: 'group',
    fixtureNumber: 1,
    legNumber: 1,
    scheduledAt,
    venue: null,
    status: 'scheduled',
    homeRegistrationId: 'reg-home',
    homeTeamId: 'team-home',
    homeTeamName: '서울 유나이티드',
    homeTeamLogoUrl: null,
    awayRegistrationId: 'reg-away',
    awayTeamId: 'team-away',
    awayTeamName: '부산 FC',
    awayTeamLogoUrl: null,
    result: null,
    videos: [],
  };
}

describe('FixtureCard 조별 일정 시간', () => {
  it('경기 날짜와 시간을 함께 표시한다', () => {
    const scheduledAt = new Date(2026, 7, 7, 20, 30).toISOString();

    render(<FixtureCard fixture={makeGroupFixture(scheduledAt)} />);

    expect(screen.getByText(/8\/7 .* 20:30/)).toBeInTheDocument();
  });

  it('경기 시간이 아직 정해지지 않았으면 시간 미정을 표시한다', () => {
    render(<FixtureCard fixture={makeGroupFixture(null)} />);

    expect(screen.getByText('시간 미정')).toBeInTheDocument();
  });
});
