import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { V1TournamentFixture } from '@/types/api';
import { FixtureCard } from './tournament-detail-client';

function fixtureWith(overrides: Partial<V1TournamentFixture>): V1TournamentFixture {
  return {
    id: 'fx-1',
    groupId: null,
    round: '4강',
    fixtureNumber: 1,
    legNumber: 1,
    scheduledAt: null,
    venue: null,
    status: 'scheduled',
    liveStatus: 'scheduled',
    homeRegistrationId: null,
    homeTeamId: null,
    homeTeamName: 'TBD',
    homeTeamLogoUrl: null,
    awayRegistrationId: null,
    awayTeamId: null,
    awayTeamName: 'TBD',
    awayTeamLogoUrl: null,
    homeSlotLabel: null,
    awaySlotLabel: null,
    result: null,
    videos: [],
    ...overrides,
  };
}

describe('FixtureCard — 빈 사이드의 자리 라벨', () => {
  it('팀이 없고 자리가 있는 사이드는 TBD 대신 자리 라벨을 보여 준다', () => {
    render(<FixtureCard fixture={fixtureWith({ homeSlotLabel: 'A조 1위', awaySlotLabel: 'B조 2위' })} />);
    expect(screen.getByText('A조 1위')).toBeInTheDocument();
    expect(screen.getByText('B조 2위')).toBeInTheDocument();
    expect(screen.queryByText('TBD')).not.toBeInTheDocument();
  });

  it('대조군: 자리 라벨이 없는 사이드는 미정, 가려진 팀은 비공개로 그대로 구분한다', () => {
    render(<FixtureCard fixture={fixtureWith({ homeSlotLabel: 'A조 1위', awayTeamName: null, awayRegistrationId: 'reg-away' })} />);
    expect(screen.getByText('A조 1위')).toBeInTheDocument();
    expect(screen.getByText('비공개')).toBeInTheDocument();
    render(<FixtureCard fixture={fixtureWith({})} />);
    expect(screen.getAllByText('미정').length).toBeGreaterThanOrEqual(2);
  });

  it('팀이 정해진 사이드는 라벨이 와도 팀 이름을 보여 준다', () => {
    render(<FixtureCard fixture={fixtureWith({ homeTeamName: '서울FC', homeRegistrationId: 'reg-home', homeSlotLabel: 'A조 1위' })} />);
    expect(screen.getByText('서울FC')).toBeInTheDocument();
    expect(screen.queryByText('A조 1위')).not.toBeInTheDocument();
  });
});
