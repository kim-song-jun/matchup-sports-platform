import { render, screen, within } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TournamentBracket } from './tournament-bracket';
import type { V1TournamentFixture } from '@/types/api';
import { queryImageBySrc } from '@/test/next-image';

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

    // next/image 전환(U15) 이후 실제 DOM src는 `/_next/image?url=...`로 재작성된다.
    expect(queryImageBySrc(container, '/uploads/teams/home.png')).not.toBeNull();
    expect(queryImageBySrc(container, '/uploads/teams/away.png')).not.toBeNull();
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

it('12강 부전승은 상대 미배정과 구분해 경기 점수 없이 표시한다', () => {
  render(<TournamentBracket fixtures={[makeFixture({ id: 'r12-match', fixtureNumber: 1, round: '12강' }), makeFixture({ id: 'quarter-match', fixtureNumber: 2, round: '8강' })]}
    groups={[{ id: 'round12', name: '12강', phase: 'round12', sortOrder: 0, advanceCount: null, standings: [],
      groupTeams: [{ id: 'bye', registrationId: 'bye-registration', teamId: 'bye-team', teamName: '직행FC', teamLogoUrl: null, sortOrder: 0, isBye: true }] }]} />);
  expect(screen.getByRole('region', { name: '12강 부전승' })).toHaveTextContent('부전승 · 8강 직행');
  expect(screen.getByText('직행FC')).toBeVisible();
  expect(screen.getByRole('navigation', { name: '대진 단계 이동' })).toHaveTextContent('12강');
});

it('진출팀이 미정인 자리에 실제 저장된 이전 경기의 승자 출처를 표시한다', () => {
  render(<TournamentBracket groups={[]} fixtures={[
    makeFixture({ id: 'q-source', round: 'quarter', fixtureNumber: 3 }),
    makeFixture({ id: 's-target', round: 'semi', fixtureNumber: 1, homeTeamName: 'TBD', bracketSources: [{ fixtureId: 'q-source', side: 'HOME', outcome: 'WINNER' }] }),
  ]} />);
  expect(screen.getByText('8강 3경기 승자')).toBeVisible();
  expect(screen.getByRole('img', { name: '경기별 진출 연결선' })).toBeInTheDocument();
});

it('12강 경기가 아직 없어도 명시적 부전승을 8강 배정과 함께 표시한다', () => {
  render(<TournamentBracket fixtures={[makeFixture({ id: 'q-bye', round: 'quarter', fixtureNumber: 1, homeRegistrationId: 'direct' })]}
    groups={[{ id: 'r12-bye', name: '12강', phase: 'round12', sortOrder: 0, advanceCount: null, standings: [], groupTeams: [{ id: 'bye-only', registrationId: 'direct', teamId: 'direct-team', teamName: '직행팀', teamLogoUrl: null, sortOrder: 0, isBye: true }] }]} />);
  expect(screen.getByText('직행팀')).toBeVisible();
  expect(screen.getByRole('navigation', { name: '대진 단계 이동' })).toHaveTextContent('12강');
});


it('3·4위전의 미정 두 자리에 저장된 4강 패자 출처를 표시한다', () => {
  render(<TournamentBracket groups={[]} fixtures={[
    makeFixture({ id: 'semi-one', round: 'semi', fixtureNumber: 1 }),
    makeFixture({ id: 'semi-two', round: 'semi', fixtureNumber: 2 }),
    makeFixture({ id: 'third', round: 'third_place', fixtureNumber: 1,
      homeTeamName: 'TBD', awayTeamName: 'TBD', bracketSources: [
        { fixtureId: 'semi-one', side: 'HOME', outcome: 'LOSER' },
        { fixtureId: 'semi-two', side: 'AWAY', outcome: 'LOSER' },
      ] }),
  ]} />);
  const card = screen.getByRole('group', { name: '4강 1경기 패자 대 4강 2경기 패자' });
  expect(within(card).getByText('4강 1경기 패자')).toBeVisible();
  expect(within(card).getByText('4강 2경기 패자')).toBeVisible();
});
