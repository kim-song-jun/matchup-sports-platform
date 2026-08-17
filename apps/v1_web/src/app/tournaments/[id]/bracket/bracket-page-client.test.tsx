import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderBracketPage, renderBracketStandingsTab } from './bracket-test-utils';
import type { V1TournamentDetail, V1TournamentFixture, V1TournamentGroup } from '@/types/api';

/**
 * 조별/리그 순위표에서 팀명을 누르면 **그 자리에서** 그 팀의 경기 상세가 펼쳐져야
 * 한다 — 오너 요청("순위·브래킷에서 팀을 눌렀을 때 히스토리가 안 나옴")의
 * 핵심 리그레션 지점. 이전엔 <span>plain text>였다.
 */
function makeTournament(overrides: Partial<V1TournamentDetail> & Pick<V1TournamentDetail, 'id' | 'status' | 'format'>): V1TournamentDetail {
  return {
    sportId: 'sport-futsal',
    sport: { code: 'futsal', name: '풋살' },
    title: '테스트 대회',
    registrationDeadlineAt: null,
    rosterDeadlineAt: null,
    bracketPublishedAt: '2026-01-01T00:00:00.000Z',
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
    confirmedCount: 0,
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

function makeGroup(overrides: Partial<V1TournamentGroup> & Pick<V1TournamentGroup, 'id' | 'phase'>): V1TournamentGroup {
  return {
    name: overrides.phase,
    sortOrder: 0,
    advanceCount: null,
    groupTeams: [],
    standings: [],
    ...overrides,
  };
}

function makeFixture(
  overrides: Partial<V1TournamentFixture> & Pick<V1TournamentFixture, 'id' | 'status'>,
): V1TournamentFixture {
  return {
    groupId: null,
    round: 'group',
    fixtureNumber: 1,
    legNumber: 1,
    scheduledAt: null,
    venue: null,
    liveStatus: 'scheduled',
    homeRegistrationId: null,
    homeTeamId: 'team-home',
    homeTeamName: '홈팀',
    homeTeamLogoUrl: null,
    awayRegistrationId: null,
    awayTeamId: 'team-away',
    awayTeamName: '원정팀',
    awayTeamLogoUrl: null,
    result: null,
    videos: [],
    ...overrides,
  };
}

/**
 * 오너 지시 — 이 화면에 들어오면 "경기 일정"이 먼저 보여야 한다(순위·대진표는 결과가
 * 쌓인 뒤에 보는 정보). 기본 탭이 순위·대진표로 되돌아가거나 세그먼트 탭 나열 순서가
 * 뒤집히면 이 테스트가 깨진다.
 */
describe('BracketPageContent — 기본 탭', () => {
  it('처음 렌더하면 경기 일정 탭이 첫 번째이자 선택된 탭이고, 순위표는 아직 안 보인다', () => {
    const tournament = makeTournament({
      id: 'tour-default-tab',
      status: 'in_progress',
      format: 'group_knockout',
      groups: [
        makeGroup({
          id: 'group-a',
          phase: 'group',
          name: 'A조',
          standings: [
            {
              registrationId: 'reg-1',
              teamId: 'team-1',
              teamName: '성수 FC',
              teamLogoUrl: null,
              position: 1,
              points: 3,
              wins: 1,
              draws: 0,
              losses: 0,
              goalsFor: 2,
              goalsAgainst: 0,
              recalculatedAt: null,
            },
          ],
        }),
      ],
    });

    renderBracketPage(tournament);

    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['경기 일정', '순위 · 대진표']);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[1]).toHaveAttribute('aria-selected', 'false');
    expect(screen.queryByRole('table', { name: 'A조 순위표' })).not.toBeInTheDocument();
  });
});

describe('BracketPageContent — 순위표 팀 링크', () => {
  it('경기가 하나도 없어도 편성된 팀 전체와 0 기록을 보여준다', () => {
    const tournament = makeTournament({
      id: 'tour-no-results',
      status: 'closed',
      format: 'group_knockout',
      groups: [
        makeGroup({
          id: 'group-a',
          phase: 'group',
          name: 'A조',
          groupTeams: [
            { id: 'gt-1', registrationId: 'reg-1', teamId: 'team-1', teamName: '성수 FC', teamLogoUrl: null, sortOrder: 0 },
            { id: 'gt-2', registrationId: 'reg-2', teamId: 'team-2', teamName: '마포 FC', teamLogoUrl: null, sortOrder: 1 },
          ],
          standings: [],
        }),
      ],
    });

    renderBracketStandingsTab(tournament);

    expect(screen.getByRole('button', { name: /성수 FC/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /마포 FC/ })).toBeInTheDocument();
    expect(screen.getAllByRole('cell', { name: '0승 0무 0패' })).toHaveLength(2);
    expect(screen.getAllByText('0점')).toHaveLength(2);
    expect(screen.getByText('아직 경기 기록이 없어요. 첫 결과가 등록되면 순위가 매겨져요.')).toBeInTheDocument();
  });

  it('일부 순위 행만 도착해도 경기 기록과 편성된 팀 전체를 함께 보여준다', () => {
    const tournament = makeTournament({
      id: 'tour-partial-standings',
      status: 'in_progress',
      format: 'group_knockout',
      groups: [
        makeGroup({
          id: 'group-a',
          phase: 'group',
          name: 'A조',
          groupTeams: [
            { id: 'gt-1', registrationId: 'reg-1', teamId: 'team-1', teamName: '성수 FC', teamLogoUrl: null, sortOrder: 0 },
            { id: 'gt-2', registrationId: 'reg-2', teamId: 'team-2', teamName: '마포 FC', teamLogoUrl: null, sortOrder: 1 },
            { id: 'gt-3', registrationId: 'reg-3', teamId: 'team-3', teamName: '한강 FC', teamLogoUrl: null, sortOrder: 2 },
          ],
          standings: [
            {
              registrationId: 'reg-1', teamId: 'team-1', teamName: '성수 FC', teamLogoUrl: null,
              position: 1, points: 3, wins: 1, draws: 0, losses: 0,
              goalsFor: 4, goalsAgainst: 2, recalculatedAt: '2026-08-14T00:00:00.000Z',
            },
            {
              registrationId: 'reg-2', teamId: 'team-2', teamName: '마포 FC', teamLogoUrl: null,
              position: 2, points: 0, wins: 0, draws: 0, losses: 1,
              goalsFor: 2, goalsAgainst: 4, recalculatedAt: '2026-08-14T00:00:00.000Z',
            },
          ],
        }),
      ],
    });

    renderBracketStandingsTab(tournament);

    expect(screen.getByRole('button', { name: /성수 FC/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /마포 FC/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /한강 FC/ })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '1승 0무 0패' })).toHaveTextContent('1-0-0');
    expect(screen.getByText('3점')).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '0승 0무 1패' })).toHaveTextContent('0-0-1');
    expect(screen.getAllByText('0점')).toHaveLength(2);
  });

  it('리그 포맷: 순위표의 팀명을 누르면 /teams/:teamId/records 로 이동한다', () => {
    const tournament = makeTournament({
      id: 'tour-1',
      status: 'open',
      format: 'league',
      groups: [
        makeGroup({
          id: 'group-1',
          phase: 'league',
          standings: [
            {
              registrationId: 'reg-1',
              teamId: 'team-42',
              teamName: '성수 FC',
              teamLogoUrl: null,
              position: 1,
              points: 9,
              wins: 3,
              draws: 0,
              losses: 0,
              goalsFor: 10,
              goalsAgainst: 2,
              recalculatedAt: null,
            },
          ],
        }),
      ],
    });

    renderBracketStandingsTab(tournament);

    const link = screen.getByRole('link', { name: /성수 FC/ });
    expect(link).toHaveAttribute('href', '/teams/team-42/records');
  });

  it('조별리그 포맷: 조별 순위표의 팀명을 누르면 /teams/:teamId/records 로 이동한다', () => {
    const tournament = makeTournament({
      id: 'tour-2',
      status: 'open',
      format: 'group_knockout',
      groups: [
        makeGroup({
          id: 'group-a',
          phase: 'group',
          name: 'A조',
          advanceCount: 2,
          standings: [
            {
              registrationId: 'reg-2',
              teamId: 'team-99',
              teamName: '한강 유나이티드',
              teamLogoUrl: null,
              position: 1,
              points: 6,
              wins: 2,
              draws: 0,
              losses: 0,
              goalsFor: 5,
              goalsAgainst: 1,
              recalculatedAt: null,
            },
          ],
        }),
      ],
    });

    renderBracketStandingsTab(tournament);

    // 예전엔 이 자리가 `/teams/:teamId/records` 링크였다. 오너 지시로 바뀌었다:
    // "각 클릭했을 때 그 팀의 경기 상세 페이지로 넘어가는 것보다 하단에 그 내용
    // 상세를 보여주는 게 더 좋을 것 같고". 화면을 통째로 갈아치우면 방금 보던 순위
    // 맥락을 잃기 때문이다. 그래서 팀 셀은 링크가 아니라 펼침 토글이어야 한다.
    expect(screen.queryByRole('link', { name: /한강 유나이티드/ })).toBeNull();
    const toggle = screen.getByRole('button', { name: /한강 유나이티드/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('조별 순위표의 팀을 누르면 그 자리에서 그 팀의 경기 상세가 펼쳐진다', async () => {
    const tournament = makeTournament({
      id: 'tour-2b',
      status: 'in_progress',
      format: 'group_knockout',
      fixtures: [
        makeFixture({
          id: 'fx-1',
          groupId: 'group-a',
          round: 'group',
          status: 'completed',
          homeTeamId: 'team-99',
          homeTeamName: '한강 유나이티드',
          awayTeamId: 'team-77',
          awayTeamName: '마포 FC',
          result: {
            homeScore: 3,
            awayScore: 1,
            hasPenalty: false,
            homePenaltyScore: null,
            awayPenaltyScore: null,
            note: null,
            recordedAt: '2026-07-16T00:00:00.000Z',
            goals: [],
          },
        }),
      ],
      groups: [
        makeGroup({
          id: 'group-a',
          phase: 'group',
          name: 'A조',
          advanceCount: 2,
          standings: [
            {
              registrationId: 'reg-2',
              teamId: 'team-99',
              teamName: '한강 유나이티드',
              teamLogoUrl: null,
              position: 1,
              points: 3,
              wins: 1,
              draws: 0,
              losses: 0,
              goalsFor: 3,
              goalsAgainst: 1,
              recalculatedAt: null,
            },
          ],
        }),
      ],
    });

    renderBracketStandingsTab(tournament);

    // 펼치기 전에는 상대팀이 어디에도 없다.
    expect(screen.queryByText('마포 FC')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: /한강 유나이티드/ }));

    // 펼치면 그 팀 관점(홈/원정·상대·결과)으로 경기가 나온다.
    expect(screen.getByRole('button', { name: /한강 유나이티드/ })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('마포 FC')).toBeInTheDocument();
    expect(screen.getByText(/승 3-1/)).toBeInTheDocument();
  });

  /* #381 — 조별 순위 영역의 펼침 상세는 "그 조에서 치른 경기"만 보여야 한다.
     예전엔 대회 전체 픽스처를 팀 id 로만 걸러서, 같은 팀의 결선(4강·결승) 경기와
     스코어가 조별 경기와 한 목록에 섞여 나왔다. 결선은 오른쪽 "토너먼트 대진"
     영역이 담당한다. */
  it('조별 순위 펼침에는 그 조 경기만 나오고 결선 경기는 섞이지 않는다', async () => {
    const tournament = makeTournament({
      id: 'tour-381',
      status: 'in_progress',
      format: 'group_knockout',
      fixtures: [
        makeFixture({
          id: 'fx-group',
          groupId: 'group-a',
          round: 'group',
          status: 'completed',
          homeTeamId: 'team-99',
          homeTeamName: '한강 유나이티드',
          awayTeamId: 'team-77',
          awayTeamName: '마포 FC',
          result: {
            homeScore: 3, awayScore: 1, hasPenalty: false,
            homePenaltyScore: null, awayPenaltyScore: null,
            note: null, recordedAt: '2026-07-16T00:00:00.000Z', goals: [],
          },
        }),
        // 같은 팀의 결선 경기 — 조별 영역에 나오면 안 된다.
        makeFixture({
          id: 'fx-semi',
          groupId: 'group-semi',
          round: '4강',
          status: 'completed',
          homeTeamId: 'team-99',
          homeTeamName: '한강 유나이티드',
          awayTeamId: 'team-55',
          awayTeamName: '성수 스타즈',
          result: {
            homeScore: 2, awayScore: 0, hasPenalty: false,
            homePenaltyScore: null, awayPenaltyScore: null,
            note: null, recordedAt: '2026-07-20T00:00:00.000Z', goals: [],
          },
        }),
      ],
      groups: [
        makeGroup({
          id: 'group-a',
          phase: 'group',
          name: 'A조',
          advanceCount: 2,
          standings: [
            {
              registrationId: 'reg-381', teamId: 'team-99', teamName: '한강 유나이티드',
              teamLogoUrl: null, position: 1, points: 3, wins: 1, draws: 0, losses: 0,
              goalsFor: 3, goalsAgainst: 1, recalculatedAt: null,
            },
          ],
        }),
      ],
    });

    renderBracketStandingsTab(tournament);

    await userEvent.click(screen.getByRole('button', { name: /한강 유나이티드/ }));

    // 그 조 경기는 나온다
    expect(screen.getByText('마포 FC')).toBeInTheDocument();
    // 결선 상대는 조별 순위 영역에 나오면 안 된다
    expect(screen.queryByText('성수 스타즈')).toBeNull();
  });
});

/**
 * §B-7 — "진출" 배지·강조는 그 조의 조별리그(phase==='group') 픽스처가 전부
 * completed/cancelled일 때만 뜬다. 예전엔 group.advanceCount만 있으면 1경기만
 * 끝나도 확정처럼 보였다(오너 지적의 핵심 리그레션).
 */
describe('BracketPageContent — 진출 배지는 조별리그 완료 후에만', () => {
  it('조별리그가 아직 안 끝났으면 "상위 N팀 진출" 배지를 렌더하지 않고 정직한 안내를 보여준다', () => {
    const tournament = makeTournament({
      id: 'tour-3',
      status: 'in_progress',
      format: 'group_knockout',
      fixtures: [
        makeFixture({ id: 'fx-1', groupId: 'group-a', round: 'group', status: 'completed' }),
        makeFixture({ id: 'fx-2', groupId: 'group-a', round: 'group', status: 'scheduled' }),
      ],
      groups: [
        makeGroup({
          id: 'group-a',
          phase: 'group',
          name: 'A조',
          advanceCount: 2,
          standings: [
            {
              registrationId: 'reg-1',
              teamId: 'team-1',
              teamName: '성수 FC',
              teamLogoUrl: null,
              position: 1,
              points: 3,
              wins: 1,
              draws: 0,
              losses: 0,
              goalsFor: 2,
              goalsAgainst: 0,
              recalculatedAt: null,
            },
          ],
        }),
      ],
    });

    renderBracketStandingsTab(tournament);

    expect(screen.queryByText(/상위 2팀 진출/)).not.toBeInTheDocument();
    expect(screen.getByText('조별리그가 끝나면 진출 팀이 정해져요')).toBeInTheDocument();
  });

  it('조별리그의 모든 픽스처가 completed/cancelled면 "상위 N팀 진출" 배지를 렌더한다', () => {
    const tournament = makeTournament({
      id: 'tour-4',
      status: 'in_progress',
      format: 'group_knockout',
      fixtures: [
        makeFixture({ id: 'fx-1', groupId: 'group-a', round: 'group', status: 'completed' }),
        makeFixture({ id: 'fx-2', groupId: 'group-a', round: 'group', status: 'cancelled' }),
      ],
      groups: [
        makeGroup({
          id: 'group-a',
          phase: 'group',
          name: 'A조',
          advanceCount: 2,
          standings: [
            {
              registrationId: 'reg-1',
              teamId: 'team-1',
              teamName: '성수 FC',
              teamLogoUrl: null,
              position: 1,
              points: 3,
              wins: 1,
              draws: 0,
              losses: 0,
              goalsFor: 2,
              goalsAgainst: 0,
              recalculatedAt: null,
            },
          ],
        }),
      ],
    });

    renderBracketStandingsTab(tournament);

    expect(screen.getByText(/상위 2팀 진출/)).toBeInTheDocument();
    expect(screen.queryByText('조별리그가 끝나면 진출 팀이 정해져요')).not.toBeInTheDocument();
  });
});

describe('BracketPageContent — 생성된 결선 fixture는 조별리그 중에도 공개', () => {
  it('group_knockout: 조별리그 미완료여도 미배정 결선 슬롯을 미정으로 보여준다', () => {
    const tournament = makeTournament({
      id: 'tour-5',
      status: 'in_progress',
      format: 'group_knockout',
      fixtures: [
        makeFixture({ id: 'fx-group', groupId: 'group-a', round: 'group', status: 'scheduled' }),
        makeFixture({
          id: 'fx-final',
          groupId: null,
          round: 'final',
          status: 'scheduled',
          homeTeamName: 'TBD',
          awayTeamName: 'TBD',
        }),
      ],
      groups: [makeGroup({ id: 'group-a', phase: 'group', name: 'A조', advanceCount: 1 })],
    });

    renderBracketStandingsTab(tournament);

    expect(screen.queryByText(/대진표는 조별리그가 끝난 후/)).not.toBeInTheDocument();
    expect(screen.getAllByText('미정')).toHaveLength(3);
  });

  it('group_knockout: 조별리그가 모두 끝나면 결선 대진표를 보여준다', () => {
    const tournament = makeTournament({
      id: 'tour-6',
      status: 'in_progress',
      format: 'group_knockout',
      fixtures: [
        makeFixture({ id: 'fx-group', groupId: 'group-a', round: 'group', status: 'completed' }),
        makeFixture({
          id: 'fx-final',
          groupId: null,
          round: 'final',
          status: 'scheduled',
          homeTeamName: '결승 홈팀',
          awayTeamName: '결승 원정팀',
        }),
      ],
      groups: [makeGroup({ id: 'group-a', phase: 'group', name: 'A조', advanceCount: 1 })],
    });

    renderBracketStandingsTab(tournament);

    expect(screen.queryByText(/대진표는 조별리그가 끝난 후/)).not.toBeInTheDocument();
    expect(screen.getByText('결승 홈팀')).toBeInTheDocument();
  });

  it('knockout 포맷은 조별리그 자체가 없으므로 처음부터 대진표를 보여준다', () => {
    const tournament = makeTournament({
      id: 'tour-7',
      status: 'in_progress',
      format: 'knockout',
      groups: [],
      fixtures: [
        makeFixture({
          id: 'fx-final',
          groupId: null,
          round: 'final',
          status: 'scheduled',
          homeTeamName: '결승 홈팀',
          awayTeamName: '결승 원정팀',
        }),
      ],
    });

    renderBracketStandingsTab(tournament);

    expect(screen.getByText('결승 홈팀')).toBeInTheDocument();
  });
});

/**
 * §데스크탑 폭 배분 — 대진표에 넓은 칼럼(0.72:1.28)을 주는 기본 배분은 라운드가 여러
 * 개일 때의 전제다. 결승 하나뿐인 대회에서는 그 폭을 커넥터만 가로지르고 순위표는
 * 366px로 눌렸다(1440 실측). 폭 배분을 뒤집는 근거가 "결선 라운드 수"라는 데이터이므로,
 * CSS가 아니라 이 판정 로직을 테스트한다 — 라운드가 3개 이상인 대회까지 좁은 대진표로
 * 바뀌면 8강 대진이 잘린다.
 */
describe('BracketPageContent — 결선 라운드 수에 따른 칼럼 배분 클래스', () => {
  const groupsDone = [makeGroup({ id: 'group-a', phase: 'group', name: 'A조', advanceCount: 2 })];
  const groupFixture = makeFixture({ id: 'fx-group', groupId: 'group-a', round: 'group', status: 'completed' });

  it('결선이 결승뿐이면 순위표 쪽을 넓히는 클래스를 붙인다', () => {
    const { container } = renderBracketStandingsTab(
      makeTournament({
        id: 'tour-slim',
        status: 'in_progress',
        format: 'group_knockout',
        groups: groupsDone,
        fixtures: [groupFixture, makeFixture({ id: 'fx-final', groupId: null, round: 'final', status: 'scheduled' })],
      }),
    );

    expect(container.querySelector('.tm-bracket-page-grid-slim-bracket')).toBeInTheDocument();
  });

  // 4강+결승은 대진표 최소 폭이 2×216+120 = 552px라 좁힌 칼럼(460px)에 안 들어간다.
  it('4강+결승이면 대진표 폭을 그대로 둔다', () => {
    const { container } = renderBracketStandingsTab(
      makeTournament({
        id: 'tour-wide',
        status: 'in_progress',
        format: 'group_knockout',
        groups: groupsDone,
        fixtures: [
          groupFixture,
          makeFixture({ id: 'fx-semi', groupId: null, round: 'semi', status: 'scheduled' }),
          makeFixture({ id: 'fx-final', groupId: null, round: 'final', status: 'scheduled' }),
        ],
      }),
    );

    expect(container.querySelector('.tm-bracket-page-grid-slim-bracket')).not.toBeInTheDocument();
  });
});
