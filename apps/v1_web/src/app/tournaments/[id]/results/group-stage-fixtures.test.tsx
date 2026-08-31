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
    liveStatus: 'ended',
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
    kind: 'regular_tournament',
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
    yellowAccumulationLimit: null,
    redCardSuspensionMatches: null,
    refundPolicyText: null,
    confirmedCount: 4,
    participantTeams: [],
    pendingPaymentCount: 0,
    groups: [],
    fixtures: [],
    announcements: [],
    sponsors: [],
    reviews: [],
    reviewsTotalCount: 0,
    awards: [],
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
        // 상태 칩은 `liveStatus` 로 판정하므로 픽스처 두 필드를 함께 맞춰 둔다 —
        // 한쪽만 바꾸면 서버가 만들지 않는 조합이 되어 테스트가 현실과 어긋난다.
        liveStatus: 'scheduled',
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
          fixtures: tournament.fixtures.map((f) => ({
            ...f,
            status: 'scheduled',
            liveStatus: 'scheduled' as const,
            result: null,
          })),
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
      '/tournaments/tournament-1/bracket',
    );
  });
});

/**
 * 단계 분류 회귀 — 라운드 라벨이 아니라 편성 phase 로 가른다.
 *
 * 이 describe 가 존재하는 이유: 위 테스트들이 전부 `round: 'group'`(= 옛 상수에 들어
 * 있던 값)만 써서, 실제 alpha 데이터의 라벨로는 화면이 비어도 전부 통과했다.
 * 2026-08-13 alpha 실측 분포는 'group' 12건 · '조별 1/2/3라운드' 22건이었고
 * 옛 상수에 적힌 '조별리그'는 0건이었다 — 즉 조별 경기의 3분의 2가 최종결과
 * 화면에서 "0경기"로 사라져 있었다. 아래 케이스는 옛 구현에서 반드시 실패한다.
 */
describe('최종결과 — 조별/결선 분류는 편성 phase 기준', () => {
  const alphaLikeTournament = () =>
    makeTournament({
      groups: [
        makeGroup({ id: 'group-a', name: 'A조', phase: 'group', sortOrder: 0 }),
        makeGroup({ id: 'group-b', name: 'B조', phase: 'group', sortOrder: 1 }),
        // alpha 실제 데이터의 결선 편성은 이름이 '준결승1' 인데 phase 는 'final' 이다.
        makeGroup({ id: 'group-f', name: '준결승1', phase: 'final', sortOrder: 2 }),
      ],
      fixtures: [
        makeFixture({
          id: 'fx-a1', groupId: 'group-a', round: '조별 1라운드', fixtureNumber: 1,
          homeTeamName: '볼케이노Fc', awayTeamName: 'SOUL FC', result: makeResult(0, 2),
        }),
        makeFixture({
          id: 'fx-b1', groupId: 'group-b', round: '조별 2라운드', fixtureNumber: 2,
          homeTeamName: '팀밋fs', awayTeamName: 'VORTEX FS', result: makeResult(1, 0),
        }),
        makeFixture({
          id: 'fx-b2', groupId: 'group-b', round: '조별 3라운드', fixtureNumber: 3,
          homeTeamName: '팀밋fs', awayTeamName: 'VORTEX FS', result: makeResult(0, 2),
        }),
        makeFixture({
          id: 'fx-final', groupId: 'group-f', round: '결승', fixtureNumber: 4,
          homeTeamName: '볼케이노Fc', awayTeamName: 'SOUL FC', result: makeResult(3, 3),
        }),
      ],
    });

  it("'조별 N라운드' 라벨의 경기도 조별리그 경기로 집계한다", () => {
    render(<ResultsPageContent tournament={alphaLikeTournament()} />);

    // 옛 구현: 라벨이 GROUP_ROUNDS 에 없어 "조별리그 경기 0경기" + EmptyState 였다.
    expect(screen.getByRole('button', { name: /조별리그 경기 3경기/ })).toBeInTheDocument();

    expandGroupBlock();
    expect(screen.queryByText('조별리그 경기가 아직 등록되지 않았어요.')).toBeNull();
    expect(screen.getByText('A조 · 1경기')).toBeInTheDocument();
    expect(screen.getByText('B조 · 2경기')).toBeInTheDocument();
  });

  it('결선 편성(phase=final)의 경기는 조별 목록에 섞이지 않고 결선 경기로 남는다', () => {
    render(<ResultsPageContent tournament={alphaLikeTournament()} />);

    expect(screen.getByRole('heading', { name: '결선 경기' })).toBeInTheDocument();
    // 결선 경기는 조별 목록(3경기)에 포함되지 않는다.
    expect(screen.getByRole('button', { name: /조별리그 경기 3경기/ })).toBeInTheDocument();
    // 편성 이름이 '준결승1' 이어도 phase 가 final 이므로 결승 카드로 그린다.
    expect(screen.getByText('결승')).toBeInTheDocument();
  });

  it('편성 phase 가 라운드 라벨을 이긴다 — 라벨이 결선이어도 group 편성이면 조별이다', () => {
    render(
      <ResultsPageContent
        tournament={makeTournament({
          groups: [makeGroup({ id: 'group-a', name: 'A조', phase: 'group' })],
          fixtures: [
            makeFixture({
              id: 'fx-mislabeled', groupId: 'group-a', round: '결승',
              homeTeamName: '성수 FC', awayTeamName: '망원 FC', result: makeResult(1, 0),
            }),
          ],
        })}
      />,
    );

    expect(screen.getByRole('button', { name: /조별리그 경기 1경기/ })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '결선 경기' })).toBeNull();
  });

  it('편성에 붙지 못한 경기(groupId=null)는 라운드 라벨로 폴백 분류한다', () => {
    render(
      <ResultsPageContent
        tournament={makeTournament({
          groups: [],
          fixtures: [
            makeFixture({
              id: 'fx-orphan-group', groupId: null, round: '조별 1라운드',
              homeTeamName: '성수 FC', awayTeamName: '망원 FC', result: makeResult(2, 0),
            }),
            makeFixture({
              id: 'fx-orphan-final', groupId: null, round: 'final', fixtureNumber: 9,
              homeTeamName: '서울 유나이티드', awayTeamName: '부산 FC', result: makeResult(2, 1),
            }),
          ],
        })}
      />,
    );

    expect(screen.getByRole('button', { name: /조별리그 경기 1경기/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '결선 경기' })).toBeInTheDocument();

    expandGroupBlock();
    expect(screen.getByText('성수 FC')).toBeInTheDocument();
  });
});
