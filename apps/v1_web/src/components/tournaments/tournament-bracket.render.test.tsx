import { render, screen, within } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TournamentBracket } from './tournament-bracket';
import type { V1TournamentFixture } from '@/types/api';

function makeFixture(
  overrides: Partial<V1TournamentFixture> & Pick<V1TournamentFixture, 'id' | 'fixtureNumber'>,
): V1TournamentFixture {
  return {
    groupId: null,
    round: 'semi',
    legNumber: 1,
    scheduledAt: null,
    venue: null,
    status: 'scheduled',
    homeRegistrationId: null,
    homeTeamName: '레드FC',
    awayRegistrationId: null,
    awayTeamName: '블루FC',
    result: null,
    videos: [],
    ...overrides,
  };
}

describe('MatchCard — 진행 중·종료 경기도 시각을 유지한다 (D-12)', () => {
  const originalTz = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = 'Asia/Seoul';
  });
  afterAll(() => {
    process.env.TZ = originalTz;
  });

  it('진행 중(LIVE) 경기는 LIVE 배지와 예정 시각을 함께 보여준다', () => {
    const fixture = makeFixture({
      id: 'f-live',
      fixtureNumber: 1,
      status: 'in_progress',
      scheduledAt: '2026-08-07T11:00:00.000Z',
    });
    render(<TournamentBracket fixtures={[fixture]} groups={[]} />);
    const card = screen.getByRole('group', { name: '레드FC 대 블루FC' });
    expect(within(card).getByText('● LIVE')).toBeInTheDocument();
    expect(within(card).getByText('8/7 (금) 20:00')).toBeInTheDocument();
  });

  it('종료된 승부차기 경기는 PK 배지와 경기 시각을 함께 보여준다', () => {
    const fixture = makeFixture({
      id: 'f-done',
      fixtureNumber: 1,
      status: 'completed',
      scheduledAt: '2026-08-07T11:00:00.000Z',
      result: {
        homeScore: 1,
        awayScore: 1,
        hasPenalty: true,
        homePenaltyScore: 5,
        awayPenaltyScore: 4,
        note: null,
        recordedAt: '2026-08-07T13:00:00.000Z',
        goals: [],
      },
    });
    render(<TournamentBracket fixtures={[fixture]} groups={[]} />);
    const card = screen.getByRole('group', { name: '레드FC 대 블루FC' });
    expect(within(card).getByText('PK 5:4')).toBeInTheDocument();
    expect(within(card).getByText('8/7 (금) 20:00')).toBeInTheDocument();
  });

  it('예정 경기는 시각 배지만 보여주고 LIVE·PK 배지는 없다 (기존 동작 유지)', () => {
    const fixture = makeFixture({
      id: 'f-scheduled',
      fixtureNumber: 1,
      status: 'scheduled',
      scheduledAt: '2026-08-07T11:00:00.000Z',
    });
    render(<TournamentBracket fixtures={[fixture]} groups={[]} />);
    const card = screen.getByRole('group', { name: '레드FC 대 블루FC' });
    expect(within(card).getByText('8/7 (금) 20:00')).toBeInTheDocument();
    expect(within(card).queryByText('● LIVE')).not.toBeInTheDocument();
  });
});
