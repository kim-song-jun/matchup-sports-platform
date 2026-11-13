import { MemberBracketIdentityProvider } from '@/components/tournaments/member-bracket-identity';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveStoredV1Session } from '@/lib/session-storage';
import { BracketScheduleTab } from './bracket-page-client';
import type { V1TournamentFixture, V1TournamentGroup } from '@/types/api';

function makeGroup(overrides: Pick<V1TournamentGroup, 'id' | 'phase' | 'name'>): V1TournamentGroup {
  return { sortOrder: 0, advanceCount: null, groupTeams: [], standings: [], qualification: null, ...overrides };
}

function makeFixture(overrides: Pick<V1TournamentFixture, 'id' | 'status' | 'groupId' | 'round'>): V1TournamentFixture {
  return { fixtureNumber: 1, legNumber: 1, scheduledAt: null, venue: null, liveStatus: 'scheduled',
    homeRegistrationId: null, homeTeamId: null, homeTeamName: null, homeTeamLogoUrl: null,
    awayRegistrationId: null, awayTeamId: null, awayTeamName: null, awayTeamLogoUrl: null,
    homeSlotLabel: null, awaySlotLabel: null, result: null, videos: [], ...overrides };
}

const scheduleMock = vi.fn();
const myFixturesMock = vi.fn();
const myTeamsMock = vi.fn();
const playerRecordsMock = vi.fn();

vi.mock('@/components/public-game-records/use-public-game-records', () => ({
  usePublicTournamentSchedule: (...args: unknown[]) => scheduleMock(...args),
  usePublicTournamentPlayerRecords: (...args: unknown[]) => playerRecordsMock(...args),
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1MyTournamentFixtures: (...args: unknown[]) => myFixturesMock(...args),
  useV1MyTeams: (...args: unknown[]) => myTeamsMock(...args),
  useV1Tournament: vi.fn(),
}));

describe('BracketScheduleTab — 내 팀 경기와 라인업 권한', () => {
  afterEach(() => {
    window.localStorage.clear();
  });
  beforeEach(() => {
    myTeamsMock.mockReset();
    myTeamsMock.mockReturnValue({ data: undefined });
    playerRecordsMock.mockClear();
    playerRecordsMock.mockReturnValue({
      data: {
        tournamentId: 'tour-1',
        goals: [{ userId: 'user-1', nickname: '득점선수', profileHref: '/users/user-1', goals: 3, assists: 0 }],
        assists: [],
        hiddenByEligibility: false,
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    scheduleMock.mockReturnValue({
      data: {
        pages: [{
          tournamentId: 'tour-1',
          tournamentTitle: '테스트 대회',
          bracketPublished: true,
          items: [{
            fixtureId: 'fixture-1',
            round: '조별리그',
            fixtureNumber: 1,
            legNumber: 1,
            groupId: null,
            groupName: null,
            scheduledAt: '2026-08-15T10:00:00.000Z',
            venue: '테스트 구장',
            fieldName: null,
            home: { registrationId: 'reg-home', teamId: 'team-home', teamName: '우리 팀' },
            away: { registrationId: 'reg-away', teamId: 'team-away', teamName: '상대 팀' },
            visibilityMode: 'live',
            status: 'scheduled',
            resultState: null,
            scoreStatus: 'unavailable',
            score: null,
            clock: null,
            periodBreak: null,
            scorers: [],
            hasVideo: false,
          }],
          unscheduled: [],
          standings: [],
          nextCursor: null,
        }],
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
    });
    myFixturesMock.mockReturnValue({
      data: {
        teams: [{
          registrationId: 'reg-home',
          teamId: 'team-home',
          teamName: '우리 팀',
          fixtures: [{
            fixtureId: 'fixture-1',
            gameId: 'game-1',
            sideId: 'side-home',
            round: '조별리그',
            legNumber: 1,
            groupName: null,
            scheduledAt: '2026-08-15T10:00:00.000Z',
            status: 'scheduled',
            isHome: true,
            opponentTeamName: '상대 팀',
          }],
        }],
      },
    });
  });

  it('bracket 일정 탭에서 내 팀 경기를 강조하되, 대회엔 라인업 상태를 붙이지 않는다', () => {
    const { container } = render(<BracketScheduleTab tournamentId="tour-1" />);

    // [P1-d] 라인업 링크 단언은 뺐다(경기별 라인업 화면 제거). **강조 계약은 남긴다** --
    // 이 탭에서 내 팀 경기가 눈에 띄어야 한다는 것은 링크와 별개의 계약이다.
    // 강조는 행 카드가 `tm-schedule-card-mine` 을 다는 것으로 확인한다 — 이 픽스처의
    // 팀 이름이 하필 '우리 팀'이라 문구로 찾으면 뱃지인지 팀 이름인지 갈리지 않는다.
    const myCard = container.querySelector('.tm-schedule-card-mine');
    expect(myCard).not.toBeNull();
    expect(screen.queryByRole('link', { name: '라인업 짜기' })).not.toBeInTheDocument();
    // 대회 축엔 라인업 제출 단계가 없다 — 여기 뱃지가 뜨면 팀장에게 할 수 없는 일을
    // 안 했다고 말하는 것이고, 끝난 경기 위에도 남았다(alpha 실측).
    expect(within(myCard as HTMLElement).queryByText('라인업 미작성')).not.toBeInTheDocument();
  });

  it('관리자 미리보기는 관리자 팀을 요청하지 않고 대상 팀 경기의 구장·시간·상대를 그대로 표시한다', () => {
    myFixturesMock.mockReturnValue({ data: { teams: [] } });
    myTeamsMock.mockReturnValue({ data: { items: [{ teamId: 'operator-team' }] } });
    const { container } = render(<MemberBracketIdentityProvider value={{ teamIds: ['team-home'], myFixtures: { teams: [] } }}>
      <BracketScheduleTab tournamentId="tour-1" />
    </MemberBracketIdentityProvider>);
    const card = container.querySelector('.tm-schedule-card-mine') as HTMLElement;
    expect(card).not.toBeNull();
    expect(within(card).getByText('테스트 구장')).toBeInTheDocument();
    expect(within(card).getByText('상대 팀')).toBeInTheDocument();
    expect(within(card).getByText(/8\/15.*19:00/)).toBeInTheDocument();
    expect(myTeamsMock).toHaveBeenLastCalledWith(undefined, { enabled: false });
    expect(myFixturesMock).toHaveBeenLastCalledWith('tour-1', { enabled: false });
  });
  it('공개 순위·브래킷 일정 탭에서는 개인 득점 순위를 조회하거나 표시하지 않는다', () => {
    render(<BracketScheduleTab tournamentId="tour-1" />);

    expect(playerRecordsMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: '득점 순위' })).not.toBeInTheDocument();
    expect(screen.queryByText('득점선수')).not.toBeInTheDocument();
  });

  it('추가 페이지와 시간 미정 경기에도 대진표의 결선 조 이름과 라운드를 적용한다', () => {
    const existing = scheduleMock();
    const page = existing.data.pages[0];
    const entry = page.items[0];
    scheduleMock.mockReturnValue({ ...existing, data: { pages: [
      { ...page, items: [{ ...entry, fixtureId: 'semi', round: '3팀 첫 라운드', groupId: 'semi-group', groupName: '4강', cards: [] }],
        unscheduled: [{ ...entry, fixtureId: 'final', round: '결승', groupId: 'semi-group', groupName: '4강', scheduledAt: null, cards: [] }] },
      { ...page, items: [{ ...entry, fixtureId: 'group', groupId: 'group-a', groupName: '1경기', round: '예선', cards: [] }], unscheduled: [] },
    ] } });
    const tournament: NonNullable<Parameters<typeof BracketScheduleTab>[0]['tournament']> = { format: 'group_knockout',
      groups: [makeGroup({ id: 'semi-group', phase: 'semi', name: '준결승' }), makeGroup({ id: 'group-a', phase: 'group', name: '1경기' })],
      fixtures: [
        makeFixture({ id: 'semi', status: 'scheduled', groupId: 'semi-group', round: '3팀 첫 라운드' }),
        makeFixture({ id: 'final', status: 'scheduled', groupId: 'semi-group', round: '결승' }),
        makeFixture({ id: 'group', status: 'scheduled', groupId: 'group-a', round: '예선' }),
      ],
    };
    render(<BracketScheduleTab tournamentId="tour-1" tournament={tournament} />);
    fireEvent.click(screen.getByRole('tab', { name: '조별리그' }));
    fireEvent.click(within(screen.getByRole('navigation', { name: '일정 조 선택' })).getByRole('button', { name: '1경기' }));
    expect(screen.getAllByRole('link')).toHaveLength(1);
    fireEvent.click(screen.getByRole('tab', { name: '결선' }));
    const rounds = screen.getByRole('navigation', { name: '일정 결선 단계 선택' });
    expect(within(rounds).queryByRole('button', { name: '4강' })).not.toBeInTheDocument();
    fireEvent.click(within(rounds).getByRole('button', { name: '준결승' }));
    expect(screen.getByRole('link')).toHaveAttribute('href', '/tournaments/tour-1/matches/semi');
    fireEvent.click(within(rounds).getByRole('button', { name: '결승' }));
    expect(screen.getByRole('link')).toHaveAttribute('href', '/tournaments/tour-1/matches/final');
  });
});

describe('BracketScheduleTab — 팀원도 내 팀 일정을 걸러 본다', () => {
  const entry = (fixtureId: string, home: string, away: string, status = 'scheduled') => ({
    fixtureId, round: '조별리그', fixtureNumber: 1, legNumber: 1, groupId: null, groupName: null,
    scheduledAt: '2026-08-15T10:00:00.000Z', venue: null, fieldId: null, fieldName: null,
    home: { registrationId: `reg-${home}`, teamId: home, teamName: home },
    away: { registrationId: `reg-${away}`, teamId: away, teamName: away },
    homeSlotLabel: null, awaySlotLabel: null, visibilityMode: 'live', status, resultState: 'pending',
    scoreStatus: 'unavailable', score: null, clock: null, periodBreak: null, scorers: [], cards: [], outcome: null, hasVideo: false,
  });

  beforeEach(() => {
    myFixturesMock.mockReturnValue({ data: undefined });
    scheduleMock.mockReturnValue({
      data: { pages: [{ tournamentId: 'tour-1', tournamentTitle: '테스트 대회', bracketPublished: true,
        items: [entry('mine', 'member-team', 'rival-a'), entry('others', 'rival-a', 'rival-b')],
        unscheduled: [], standings: [], nextCursor: null }] },
      isPending: false, isError: false, error: null, refetch: vi.fn(),
      hasNextPage: false, isFetching: false, isFetchingNextPage: false, fetchNextPage: vi.fn(),
    });
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  it('팀장이 아닌 팀원(my-fixtures 비어 있음)도 소속 팀으로 스위치와 우리 팀 카드를 받고, 켜면 우리 팀 경기만 남는다', async () => {
    saveStoredV1Session({ userId: 'member-1' });
    myTeamsMock.mockReturnValue({ data: { items: [{ teamId: 'member-team', role: 'member' }] } });
    const { container } = render(<BracketScheduleTab tournamentId="tour-1" />);

    const toggle = await screen.findByRole('switch', { name: '내 팀만' });
    expect(container.querySelectorAll('.tm-schedule-card-mine')).toHaveLength(1);
    expect(screen.getAllByRole('link')).toHaveLength(2);
    fireEvent.click(toggle);
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/tournaments/tour-1/matches/mine');
  });

  it('로그인하지 않았으면 소속 팀 응답이 있어도(캐시 잔여) 스위치와 우리 팀 표시를 만들지 않는다', async () => {
    myTeamsMock.mockReturnValue({ data: { items: [{ teamId: 'member-team', role: 'member' }] } });
    const { container } = render(<BracketScheduleTab tournamentId="tour-1" />);

    await waitFor(() => expect(screen.getAllByRole('link')).toHaveLength(2));
    expect(screen.queryByRole('switch', { name: '내 팀만' })).not.toBeInTheDocument();
    expect(container.querySelector('.tm-schedule-card-mine')).toBeNull();
  });

  it('끝난 대회(status=completed)에서만 최종 결과 안내를 보여 준다', () => {
    const tournament = { format: 'group_knockout' as const, groups: [], fixtures: [] };
    const { rerender } = render(<BracketScheduleTab tournamentId="tour-1" tournament={{ ...tournament, status: 'completed' }} />);
    expect(screen.getByRole('link', { name: /최종 결과 보기/ })).toHaveAttribute('href', '/tournaments/tour-1/results');
    rerender(<BracketScheduleTab tournamentId="tour-1" tournament={{ ...tournament, status: 'in_progress' }} />);
    expect(screen.queryByRole('link', { name: /최종 결과 보기/ })).not.toBeInTheDocument();
  });
});
