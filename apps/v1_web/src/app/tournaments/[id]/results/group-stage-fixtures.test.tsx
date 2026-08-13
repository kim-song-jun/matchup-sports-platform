import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type {
  V1TournamentDetail,
  V1TournamentFixture,
  V1TournamentGroup,
} from '@/types/api';
import { ResultsPageContent } from './results-page-client';

/**
 * 최종결과 화면의 조별리그 블록 회귀 테스트.
 *
 * 이 블록은 원래 "완료 + 결과 등록"된 조별 경기만 담는 접힘 목록이었고, 그래서
 * 결과가 하나도 없는 대회에서는 통째로 사라졌다. 아래 테스트는 승격된 계약을 못박는다:
 * 조별로 묶여 렌더된다 / 각 경기가 경기 상세로 이어진다 / 결과가 없어도 목록에서
 * 빠지지 않는다 / 같은 화면에 목록이 두 벌 생기지 않는다.
 */

function makeGroup(overrides: Partial<V1TournamentGroup> & Pick<V1TournamentGroup, 'id' | 'name'>): V1TournamentGroup {
  return {
    phase: 'group',
    sortOrder: 0,
    advanceCount: 2,
    groupTeams: [],
    standings: [],
    ...overrides,
  };
}

function makeFixture(
  overrides: Partial<V1TournamentFixture> & Pick<V1TournamentFixture, 'id'>,
): V1TournamentFixture {
  return {
    groupId: null,
    round: 'group',
    fixtureNumber: 1,
    legNumber: 1,
    scheduledAt: null,
    venue: null,
    status: 'completed',
    homeRegistrationId: 'registration-home',
    homeTeamId: 'team-home',
    homeTeamName: '홈 팀',
    homeTeamLogoUrl: null,
    awayRegistrationId: 'registration-away',
    awayTeamId: 'team-away',
    awayTeamName: '원정 팀',
    awayTeamLogoUrl: null,
    result: null,
    videos: [],
    ...overrides,
  };
}

function makeResult(homeScore: number, awayScore: number): V1TournamentFixture['result'] {
  return {
    homeScore,
    awayScore,
    hasPenalty: false,
    homePenaltyScore: null,
    awayPenaltyScore: null,
    note: null,
    recordedAt: '2026-07-16T00:00:00.000Z',
    goals: [],
  };
}

function makeTournament(overrides: Partial<V1TournamentDetail> = {}): V1TournamentDetail {
  return {
    id: 'tournament-1',
    sportId: 'sport-futsal',
    sport: { code: 'futsal', name: '풋살' },
    title: '테스트 대회',
    status: 'completed',
    format: 'group_knockout',
    registrationDeadlineAt: null,
    rosterDeadlineAt: null,
    bracketPublishedAt: '2026-07-01T00:00:00.000Z',
    bracketPublishScheduledAt: null,
    scheduledAt: null,
    scheduledEndAt: null,
    venue: null,
    latitude: null,
    longitude: null,
    coverImageUrl: null,
    teamCount: 8,
    minPlayers: 5,
    maxPlayers: 10,
    genderCategory: null,
    genderMinMale: null,
    genderMaxMale: null,
    genderMinFemale: null,
    genderMaxFemale: null,
    entryFee: 0,
    prizePool: null,
    prizeSummary: null,
    prizeBreakdown: null,
    promoHomeEnabled: false,
    promoHomeTitle: null,
    promoHomeSubtitle: null,
    promoHomeImageUrl: null,
    promoHomeBadgeText: null,
    promoHomeDateText: null,
    promoHomeTeamsText: null,
    promoHomeLocationText: null,
    promoHomePrizeText: null,
    promoHomePriority: 0,
    promoListEnabled: false,
    promoListTitle: null,
    promoListSubtitle: null,
    promoListImageUrl: null,
    promoListBadgeText: null,
    promoListDateText: null,
    promoListTeamsText: null,
    promoListLocationText: null,
    promoListPrizeText: null,
    promoListPriority: 0,
    campaignSlug: null,
    rulesText: null,
    refundPolicyText: null,
    confirmedCount: 4,
    participantTeams: [],
    pendingPaymentCount: 0,
    groups: [],
    fixtures: [],
    announcements: [],
    sponsors: [],
    reviews: [],
    awards: [],
    popup: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const twoGroupTournament = () =>
  makeTournament({
    groups: [
      makeGroup({ id: 'group-a', name: 'A조', sortOrder: 0 }),
      makeGroup({ id: 'group-b', name: 'B조', sortOrder: 1 }),
    ],
    fixtures: [
      makeFixture({
        id: 'fixture-a1',
        groupId: 'group-a',
        fixtureNumber: 1,
        homeTeamName: '성수 FC',
        awayTeamName: '왕십리 유나이티드',
        scheduledAt: '2026-07-15T10:00:00.000Z',
        result: makeResult(3, 1),
      }),
      makeFixture({
        id: 'fixture-b1',
        groupId: 'group-b',
        fixtureNumber: 2,
        homeTeamName: '연남 스포츠',
        awayTeamName: '망원 FC',
        status: 'scheduled',
      }),
    ],
  });

function expandGroupBlock() {
  const toggle = screen.getByRole('button', { name: /조별리그 경기/ });
  fireEvent.click(toggle);
  return toggle;
}

describe('최종결과 — 조별리그 경기 블록', () => {
  it('조별로 묶어서 렌더하고, 각 조 아래에 그 조의 경기만 둔다', () => {
    render(<ResultsPageContent tournament={twoGroupTournament()} />);
    expandGroupBlock();

    const groupALabel = screen.getByText(/A조/);
    const groupBLabel = screen.getByText(/B조/);
    const groupABlock = groupALabel.parentElement as HTMLElement;
    const groupBBlock = groupBLabel.parentElement as HTMLElement;

    expect(within(groupABlock).getByText('성수 FC')).toBeInTheDocument();
    expect(within(groupABlock).queryByText('연남 스포츠')).toBeNull();
    expect(within(groupBBlock).getByText('연남 스포츠')).toBeInTheDocument();
    expect(within(groupBBlock).queryByText('성수 FC')).toBeNull();
  });

  it('각 경기가 공개 경기 상세 라우트로 연결된다', () => {
    render(<ResultsPageContent tournament={twoGroupTournament()} />);
    expandGroupBlock();

    const link = screen.getByRole('link', { name: /성수 FC 3 대 1 왕십리 유나이티드/ });
    expect(link).toHaveAttribute('href', '/tournaments/tournament-1/matches/fixture-a1');
  });

  it('같은 화면에 조별 경기 목록이 두 벌 생기지 않는다', () => {
    render(<ResultsPageContent tournament={twoGroupTournament()} />);
    expandGroupBlock();

    expect(screen.getAllByRole('button', { name: /조별리그 경기/ })).toHaveLength(1);
    expect(
      screen.getAllByRole('link', { name: /성수 FC .* 왕십리 유나이티드/ }),
    ).toHaveLength(1);
    expect(screen.getAllByText('성수 FC')).toHaveLength(1);
  });

  it('접기 상태에서는 경기 목록을 렌더하지 않는다', () => {
    render(<ResultsPageContent tournament={twoGroupTournament()} />);

    const toggle = screen.getByRole('button', { name: /조별리그 경기/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('성수 FC')).toBeNull();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('성수 FC')).toBeInTheDocument();
  });

  it('결과가 아직 없는 경기도 목록에 남기고 상태를 텍스트로 알린다', () => {
    render(<ResultsPageContent tournament={twoGroupTournament()} />);
    expandGroupBlock();

    expect(screen.getByRole('link', { name: /연남 스포츠 경기 결과 미정 망원 FC/ })).toHaveAttribute(
      'href',
      '/tournaments/tournament-1/matches/fixture-b1',
    );
    expect(screen.getByText('경기 예정')).toBeInTheDocument();
  });

  it('결과가 한 건도 없어도 블록이 사라지지 않는다', () => {
    const tournament = twoGroupTournament();
    render(
      <ResultsPageContent
        tournament={makeTournament({
          groups: tournament.groups,
          fixtures: tournament.fixtures.map((f) => ({ ...f, status: 'scheduled', result: null })),
        })}
      />,
    );

    expect(screen.getByRole('button', { name: /조별리그 경기 2경기/ })).toBeInTheDocument();
    expandGroupBlock();
    expect(screen.getByText('성수 FC')).toBeInTheDocument();
  });

  it('조 편성만 있고 대진이 아직 없으면 EmptyState를 보여준다', () => {
    render(
      <ResultsPageContent
        tournament={makeTournament({
          groups: [makeGroup({ id: 'group-a', name: 'A조' })],
          fixtures: [],
        })}
      />,
    );
    expandGroupBlock();

    expect(screen.getByText('조별리그 경기가 아직 등록되지 않았어요.')).toBeInTheDocument();
  });

  it('조별리그가 없는 순수 토너먼트에서는 블록을 내지 않는다', () => {
    render(
      <ResultsPageContent
        tournament={makeTournament({
          format: 'knockout',
          groups: [],
          fixtures: [
            makeFixture({
              id: 'final-1',
              round: 'final',
              homeTeamName: '서울 유나이티드',
              awayTeamName: '부산 FC',
              result: makeResult(2, 1),
            }),
          ],
        })}
      />,
    );

    expect(screen.queryByRole('button', { name: /조별리그 경기/ })).toBeNull();
  });

  it('진행 중 대회에서는 블록 대신 경기 일정 화면으로 안내한다', () => {
    render(<ResultsPageContent tournament={makeTournament({ ...twoGroupTournament(), status: 'in_progress' })} />);

    expect(screen.queryByRole('button', { name: /조별리그 경기/ })).toBeNull();
    expect(screen.getByRole('link', { name: /조별리그 경기 일정 보기/ })).toHaveAttribute(
      'href',
      '/tournaments/tournament-1/schedule',
    );
  });
});
