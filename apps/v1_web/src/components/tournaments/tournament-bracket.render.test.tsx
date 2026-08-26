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
    liveStatus: 'scheduled',
    homeRegistrationId: null,
    homeTeamId: null,
    homeTeamName: '레드FC',
    homeTeamLogoUrl: null,
    awayRegistrationId: null,
    awayTeamId: null,
    awayTeamName: '블루FC',
    awayTeamLogoUrl: null,
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

  it('저장된 홈·원정 팀 로고를 대진표 슬롯에 표시한다', () => {
    const { container } = render(
      <TournamentBracket
        fixtures={[
          makeFixture({
            id: 'fixture-logo',
            fixtureNumber: 1,
            homeTeamId: 'team-home',
            homeTeamLogoUrl: '/uploads/teams/home.png',
            awayTeamId: 'team-away',
            awayTeamLogoUrl: '/uploads/teams/away.png',
          }),
        ]}
        groups={[]}
      />,
    );

    expect(container.querySelector('img[src="/uploads/teams/home.png"]')).toBeInTheDocument();
    expect(container.querySelector('img[src="/uploads/teams/away.png"]')).toBeInTheDocument();
  });

  it('진행 중(LIVE) 경기는 LIVE 배지와 예정 시각을 함께 보여준다', () => {
    // 프로덕션에서 실제로 만들어지는 조합을 그대로 재현한다: 경기가 뛰고 있어도
    // 원본 `status` 컬럼은 `scheduled` 에 머무르고(서버가 `in_progress` 로 쓰지 않는다),
    // 진행 중이라는 사실은 `V1Game.state` 파생인 `liveStatus` 에만 나타난다.
    // 이 테스트는 예전에 `status: 'in_progress'` 로 통과하고 있었는데, 그 조합은
    // 서버가 절대 만들지 않는 값이라 실제 LIVE 배지 누락을 잡지 못했다.
    const fixture = makeFixture({
      id: 'f-live',
      fixtureNumber: 1,
      status: 'scheduled',
      liveStatus: 'live',
      scheduledAt: '2026-08-07T11:00:00.000Z',
    });
    render(<TournamentBracket fixtures={[fixture]} groups={[]} />);
    const card = screen.getByRole('group', { name: '레드FC 대 블루FC' });
    expect(within(card).getByText('● LIVE')).toBeInTheDocument();
    expect(within(card).getByText('8/7 (금) 20:00')).toBeInTheDocument();
  });

  it('원본 status 만 in_progress 인 픽스처는 LIVE 로 보지 않는다', () => {
    // 서버가 만들지 않는 조합이지만, LIVE 판정이 다시 원본 컬럼으로 되돌아가면
    // 이 단언이 깨지면서 회귀를 잡는다.
    const fixture = makeFixture({
      id: 'f-stale-column',
      fixtureNumber: 1,
      status: 'in_progress',
      liveStatus: 'scheduled',
      scheduledAt: '2026-08-07T11:00:00.000Z',
    });
    render(<TournamentBracket fixtures={[fixture]} groups={[]} />);
    const card = screen.getByRole('group', { name: '레드FC 대 블루FC' });
    expect(within(card).queryByText('● LIVE')).not.toBeInTheDocument();
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
