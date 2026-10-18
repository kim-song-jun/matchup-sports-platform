import { render, screen, within } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TournamentBracket } from './tournament-bracket';
import type { V1TournamentFixture } from '@/types/api';
import { queryImageBySrc } from '@/test/next-image';

it('팀 없는 부전승 네 자리는 비공개 팀과 구분해 미정으로 표시한다', () => {
  render(<TournamentBracket fixtures={[]} groups={[{ id: 'r12', name: '12강', phase: 'round12', sortOrder: 0, advanceCount: null, standings: [], qualification: null,
    groupTeams: [0, 3, 4, 7].map((sortOrder, index) => ({ id: 'empty-bye-' + index, registrationId: null, teamId: null, teamName: null, teamLogoUrl: null, sortOrder, isBye: true })) }]} />);
  const slots = screen.getAllByRole('region', { name: '12강 부전승' });
  expect(slots).toHaveLength(4);
  for (const slot of slots) {
    expect(slot).toHaveTextContent('미정');
    expect(slot).toHaveTextContent('부전승 · 8강 직행');
    expect(slot).not.toHaveTextContent('비공개');
  }
});

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
    homeSlotLabel: null,
    awaySlotLabel: null,
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
    groups={[{ id: 'round12', name: '12강', phase: 'round12', sortOrder: 0, advanceCount: null, standings: [], qualification: null,
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
    groups={[{ id: 'r12-bye', name: '12강', phase: 'round12', sortOrder: 0, advanceCount: null, standings: [], qualification: null, groupTeams: [{ id: 'bye-only', registrationId: 'direct', teamId: 'direct-team', teamName: '직행팀', teamLogoUrl: null, sortOrder: 0, isBye: true }] }]} />);
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
describe('공개 대진표 — 자리 라벨', () => {
  it('보류 중인 슬롯은 알려진 팀 ID가 있어도 엠블럼 없이 중립 표시한다', () => {
    render(<TournamentBracket groups={[]} fixtures={[
      makeFixture({
        id: 'pending-known-team',
        round: 'semi',
        fixtureNumber: 1,
        homeTeamId: 'known-team-for-pending-slot',
        homeTeamName: 'TBD',
        homeSlotLabel: 'A조 1위',
      }),
    ]} />);

    const card = screen.getByRole('group', { name: 'A조 1위 대 블루FC' });
    const pendingRow = card.querySelector('.tm-bk2-row');
    expect(pendingRow).toHaveTextContent('A조 1위');
    expect(pendingRow?.querySelector('img')).toBeNull();
  });

  it('TBD 사이드에 자리 라벨이 있으면 라벨을 보여 주고 대기 모양으로 그린다', () => {
    render(<TournamentBracket groups={[]} fixtures={[
      makeFixture({ id: 'rank-one', round: 'semi', fixtureNumber: 1, homeTeamName: 'TBD', homeSlotLabel: 'A조 1위', awayTeamName: 'TBD', awaySlotLabel: 'B조 2위' }),
    ]} />);
    const card = screen.getByRole('group', { name: 'A조 1위 대 B조 2위' });
    const label = within(card).getByText('A조 1위');
    expect(label).toBeVisible();
    // 아직 정해지지 않은 자리라 이긴 팀 모양(진한 글자)이 아니라 대기 색을 쓴다.
    expect(label.getAttribute('style')).toContain('var(--text-caption)');
    expect(within(card).getByText('B조 2위')).toBeVisible();
  });

  it('대조군: 라벨도 연결선도 없는 TBD 는 미정, 팀이 있는 사이드는 라벨이 와도 팀 이름', () => {
    render(<TournamentBracket groups={[]} fixtures={[
      makeFixture({ id: 'mixed', round: 'semi', fixtureNumber: 1, homeTeamName: '서울FC', homeSlotLabel: 'A조 1위', awayTeamName: 'TBD' }),
    ]} />);
    const card = screen.getByRole('group', { name: '서울FC 대 미정' });
    expect(within(card).queryByText('A조 1위')).not.toBeInTheDocument();
  });

  it('대조군: 연결선 출처가 있는 TBD 는 지금처럼 이전 경기 설명을 보여 준다', () => {
    render(<TournamentBracket groups={[]} fixtures={[
      makeFixture({ id: 'q-source', round: 'quarter', fixtureNumber: 3 }),
      makeFixture({ id: 's-target', round: 'semi', fixtureNumber: 1, homeTeamName: 'TBD', homeSlotLabel: null, bracketSources: [{ fixtureId: 'q-source', side: 'HOME', outcome: 'WINNER' }] }),
    ]} />);
    expect(screen.getByText('8강 3경기 승자')).toBeVisible();
  });
});

it.each([['quarter', '8강', '4강'], ['semi', '4강', '결승']] as const)('%s 부전승도 해당 라운드와 다음 단계를 구분한다', (phase, label, nextLabel) => {
  render(<TournamentBracket fixtures={[]} groups={[{ id: phase, name: label, phase, sortOrder: 0, advanceCount: null, standings: [], qualification: null,
    groupTeams: [{ id: 'bye', registrationId: 'direct', teamId: 'direct-team', teamName: '직행팀', teamLogoUrl: null, sortOrder: 0, isBye: true }] }]} />);
  expect(screen.getByRole('region', { name: label + ' 부전승' })).toHaveTextContent('부전승 · ' + nextLabel + ' 직행');

});

it('저장된 시각과 경기장을 결선 그림에 함께 표시한다', () => {
  render(<TournamentBracket fixtures={[makeFixture({ id: 'saved-metadata', fixtureNumber: 31, scheduledAt: '2026-10-19T11:33:00.000Z', venue: 'A구장' })]} groups={[]} />);
  const card = screen.getByRole('group', { name: '레드FC 대 블루FC' });
  expect(within(card).getByText('10/19 (월) 20:33')).toBeInTheDocument();
  expect(within(card).getByText('A구장')).toBeInTheDocument();
});

it('미배정 부전승은 지정 문구를 표시하고 팀 확정 뒤에도 보조로 유지한다', () => {
  render(<TournamentBracket fixtures={[]} groups={[{ id: 'r12', name: '12강', phase: 'round12', sortOrder: 0, advanceCount: null, standings: [], qualification: null,
    groupTeams: [{ id: 'bye-empty', registrationId: null, teamId: null, teamName: null, teamLogoUrl: null, sortOrder: 0, isBye: true, displayLabel: '조 1위 중 5위' }, { id: 'bye-team', registrationId: 'reg', teamId: 'team', teamName: '확정 팀', teamLogoUrl: null, sortOrder: 2, isBye: true, displayLabel: '조 1위 중 6위' }] }]} />);
  expect(screen.getByText('조 1위 중 5위')).toBeInTheDocument();
  expect(screen.getByText('확정 팀')).toBeInTheDocument();
  expect(screen.getByText('조 1위 중 6위')).toBeInTheDocument();
});


it.each(['HOME', 'AWAY'] as const)('빈 부전승 타일에서 연결된 8강 %s 팀 줄까지 SVG 선을 렌더한다', (side) => {
  const { container } = render(<TournamentBracket fixtures={[makeFixture({ id: 'quarter', round: 'quarter', fixtureNumber: 5, homeTeamName: 'TBD', awayTeamName: 'TBD' })]}
    groups={[{ id: 'r12', name: '12강', phase: 'round12', sortOrder: 0, advanceCount: null, standings: [], qualification: null,
      groupTeams: [{ id: 'bye', registrationId: null, teamId: null, teamName: null, teamLogoUrl: null, sortOrder: 0, isBye: true,
        byeTarget: { fixtureId: 'quarter', side } }] }]} />);
  const label = `부전승 → 5번 경기 ${side === 'HOME' ? '홈' : '어웨이'}`;
  const path = Array.from(container.querySelectorAll('svg path')).find(path => path.querySelector('title')?.textContent === label);
  expect(path).toBeDefined();
  expect(path?.getAttribute('d')).toMatch(/^M /);
  expect(screen.getByRole('region', { name: '12강 부전승' })).toHaveTextContent('미정');
});
