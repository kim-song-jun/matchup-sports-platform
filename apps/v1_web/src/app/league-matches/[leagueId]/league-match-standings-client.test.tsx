import { render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Providers } from '@/app/providers';
import { useV1ActivePopup, useV1LeagueMatch, useV1LeagueMatchPlayerRecords, useV1LeagueMatchStandings } from '@/hooks/use-v1-api';
import LeagueMatchStandingsClient from './league-match-standings-client';

vi.mock('@/components/auth/pending-social-signup-gate', () => ({
  PendingSocialSignupGate: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1ActivePopup: vi.fn(),
  useV1LeagueMatch: vi.fn(),
  useV1LeagueMatchStandings: vi.fn(),
  useV1LeagueMatchPlayerRecords: vi.fn(),
  // Providers 안의 ThemeProvider가 전역으로 호출한다 — 이 테스트가 <Providers>로 렌더하는 한 필요.
  useV1Settings: vi.fn(() => ({ data: undefined, isError: false, refetch: vi.fn() })),
  useV1UpdateSettings: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

const useV1ActivePopupMock = vi.mocked(useV1ActivePopup, { partial: true });
const useV1LeagueMatchMock = vi.mocked(useV1LeagueMatch, { partial: true });
const useV1LeagueMatchStandingsMock = vi.mocked(useV1LeagueMatchStandings, { partial: true });
const useV1LeagueMatchPlayerRecordsMock = vi.mocked(useV1LeagueMatchPlayerRecords, { partial: true });

describe('LeagueMatchStandingsClient', () => {
  it('순위표에서 저장된 팀 로고를 표시한다', async () => {
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1LeagueMatchMock.mockReturnValue({
      data: { leagueId: 'league-1', title: '가을 리그', state: 'active', startsOn: '2026-09-01T00:00:00.000Z', endsOn: '2026-10-20T00:00:00.000Z', teamIds: ['t1'], fixtures: [] },
    } as never);
    useV1LeagueMatchStandingsMock.mockReturnValue({
      data: {
        leagueId: 'league-1',
        tieBreakOrder: ['points'],
        standings: [{ teamId: 't1', teamName: '성수 FC', teamLogoUrl: '/uploads/teams/seongsu.png', position: 1, played: 1, wins: 1, draws: 0, losses: 0, goalsFor: 2, goalsAgainst: 0, points: 3 }],
        pendingFixtures: [],
      },
    } as never);
    useV1LeagueMatchPlayerRecordsMock.mockReturnValue({ data: { leagueId: 'league-1', goals: [], assists: [] } } as never);

    const { container } = render(
      <Providers>
        <LeagueMatchStandingsClient leagueId="league-1" />
      </Providers>,
    );

    await waitFor(() => expect(container.querySelector('img[src="/uploads/teams/seongsu.png"]')).toBeInTheDocument());
  });

  it('미확정 경기가 있으면 0경기 순위표와 확인 중 배너가 함께 보인다', async () => {
    // 실계약: 서버는 결과 확정 전에도 팀당 1행(played=0)을 항상 반환한다 —
    // "standings 빈 배열 + pendingFixtures 존재"는 서버가 만들 수 없는 상태.
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1LeagueMatchMock.mockReturnValue({
      data: { leagueId: 'league-1', title: '가을 리그', state: 'active', startsOn: '2026-09-01T00:00:00.000Z', endsOn: '2026-10-20T00:00:00.000Z', teamIds: ['t1', 't2'], fixtures: [] },
    } as never);
    useV1LeagueMatchStandingsMock.mockReturnValue({
      data: {
        leagueId: 'league-1',
        tieBreakOrder: ['points'],
        standings: [
          { teamId: 't1', teamName: '성수 FC', teamLogoUrl: null, position: 1, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, points: 0 },
          { teamId: 't2', teamName: '망원 FC', teamLogoUrl: null, position: 2, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, points: 0 },
        ],
        pendingFixtures: [{ teamMatchId: 'tm-1', homeTeamId: 't1', awayTeamId: 't2', startAt: '2026-09-01T20:00:00.000Z' }],
      },
    } as never);
    useV1LeagueMatchPlayerRecordsMock.mockReturnValue({ data: { leagueId: 'league-1', goals: [], assists: [] } } as never);

    render(
      <Providers>
        <LeagueMatchStandingsClient leagueId="league-1" />
      </Providers>,
    );

    await waitFor(() => expect(screen.getByText('확인 중')).toBeInTheDocument());
    // 팀 이름은 이제 순위표와 미확정 경기 목록 양쪽에 나온다 -- 이 테스트가 확인하려는 건
    // "순위표에 0경기 행이 뜬다"이므로 표 안으로 범위를 좁힌다(다중 매치로 깨지지 않게).
    const standingsTable = within(screen.getByRole('table'));
    expect(standingsTable.getByText('성수 FC')).toBeInTheDocument();
    expect(standingsTable.getByText('망원 FC')).toBeInTheDocument();
    expect(screen.getByText('— 1경기가 아직 결과 확정 전이에요')).toBeInTheDocument();
  });

  it('리그 조회가 실패하면 에러 상태와 재시도 버튼을 보여준다', async () => {
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    const refetch = vi.fn();
    useV1LeagueMatchMock.mockReturnValue({ data: undefined, isError: true, error: new Error('boom'), refetch } as never);
    useV1LeagueMatchStandingsMock.mockReturnValue({ data: undefined, isError: true, error: new Error('boom'), refetch } as never);
    useV1LeagueMatchPlayerRecordsMock.mockReturnValue({ data: undefined, isError: true, error: new Error('boom'), refetch } as never);

    render(
      <Providers>
        <LeagueMatchStandingsClient leagueId="bad-id" />
      </Providers>,
    );

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    screen.getByRole('button', { name: '다시 시도하기' }).click();
    await waitFor(() => expect(refetch).toHaveBeenCalled());
  });

  it('순위표 조회만 실패하면 빈 문구가 아니라 에러 상태를 보여준다', async () => {
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1LeagueMatchMock.mockReturnValue({
      data: { leagueId: 'league-1', title: '가을 리그', state: 'active', startsOn: '2026-09-01T00:00:00.000Z', endsOn: '2026-10-20T00:00:00.000Z', teamIds: ['t1'], fixtures: [] },
    } as never);
    useV1LeagueMatchStandingsMock.mockReturnValue({ data: undefined, isError: true, error: new Error('순위표 서버 오류'), refetch: vi.fn() } as never);
    useV1LeagueMatchPlayerRecordsMock.mockReturnValue({ data: { leagueId: 'league-1', goals: [], assists: [] } } as never);

    render(
      <Providers>
        <LeagueMatchStandingsClient leagueId="league-1" />
      </Providers>,
    );

    await waitFor(() => expect(screen.getByText('순위표 서버 오류')).toBeInTheDocument());
    expect(screen.queryByText('아직 확정된 결과가 없어요')).not.toBeInTheDocument();
  });

  it('경기 일정·순위표 전적·리그 상태 배지를 함께 렌더한다', async () => {
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1LeagueMatchMock.mockReturnValue({
      data: {
        leagueId: 'league-1',
        title: '가을 리그',
        state: 'active',
        startsOn: '2026-09-01T00:00:00.000Z',
        endsOn: '2026-10-20T00:00:00.000Z',
        teamIds: ['t1', 't2'],
        fixtures: [
          // homeScore/awayScore 없음 + status 'matched' → "예정"
          { teamMatchId: 'tm-10', title: '1라운드', homeTeamId: 't1', awayTeamId: 't2', startAt: '2026-09-01T20:00:00.000Z', placeName: '성수 풋살장', status: 'matched' },
          // 스코어 있음 → "3 : 1"
          { teamMatchId: 'tm-11', title: '2라운드', homeTeamId: 't2', awayTeamId: 't1', startAt: '2026-09-08T20:00:00.000Z', placeName: '망원 풋살장', status: 'completed', homeScore: 3, awayScore: 1 },
          // status 'completed' 인데 스코어 없음(레인 C 병행 작업 중) → "결과 대기" + 상대팀/장소 미정 폴백
          { teamMatchId: 'tm-12', title: '3라운드', homeTeamId: 't1', awayTeamId: null, startAt: '2026-09-15T20:00:00.000Z', placeName: '', status: 'completed' },
        ],
      },
    } as never);
    useV1LeagueMatchStandingsMock.mockReturnValue({
      data: {
        leagueId: 'league-1',
        tieBreakOrder: ['points'],
        standings: [
          { teamId: 't1', teamName: '성수 FC', teamLogoUrl: null, position: 1, played: 1, wins: 1, draws: 0, losses: 0, goalsFor: 2, goalsAgainst: 0, points: 3 },
          { teamId: 't2', teamName: '망원 FC', teamLogoUrl: null, position: 2, played: 1, wins: 0, draws: 0, losses: 1, goalsFor: 0, goalsAgainst: 2, points: 0 },
        ],
        pendingFixtures: [],
      },
    } as never);
    useV1LeagueMatchPlayerRecordsMock.mockReturnValue({ data: { leagueId: 'league-1', goals: [], assists: [] } } as never);

    const { container } = render(
      <Providers>
        <LeagueMatchStandingsClient leagueId="league-1" />
      </Providers>,
    );

    // R7: 리그 상태 배지
    await waitFor(() => expect(screen.getByText('진행 중')).toBeInTheDocument());

    // R1: 경기 일정 행 — 팀 이름은 standings 매핑으로 채워지고, 행 전체가 team-matches 링크다.
    const scheduled = container.querySelector('a[href="/team-matches/tm-10"]');
    expect(scheduled).toBeInTheDocument();
    expect(scheduled?.textContent).toContain('성수 FC');
    expect(scheduled?.textContent).toContain('망원 FC');
    expect(scheduled?.textContent).toContain('예정');

    const scored = container.querySelector('a[href="/team-matches/tm-11"]');
    expect(scored?.textContent).toContain('3 : 1');

    // 스코어 필드가 undefined(레인 C 병행 작업 중)여도 깨지지 않고 안전한 폴백을 보여준다.
    const pendingResult = container.querySelector('a[href="/team-matches/tm-12"]');
    expect(pendingResult?.textContent).toContain('결과 대기');
    expect(pendingResult?.textContent).toContain('상대팀 미정');
    expect(pendingResult?.textContent).toContain('장소 미정');

    // R9: 순위표 전적(승-무-패) 컬럼 — 압축 표기 + aria-label + scope 속성
    expect(screen.getByText('1-0-0')).toBeInTheDocument();
    expect(container.querySelector('td[aria-label="1승 0무 0패"]')).toBeInTheDocument();
    expect(container.querySelectorAll('th[scope="col"]')).toHaveLength(5);
    const teamRowHeader = container.querySelector('th[scope="row"]');
    expect(teamRowHeader?.textContent).toContain('성수 FC');
  });

  it('종료된 리그는 순위표에 최종 순위 표시가 붙는다', async () => {
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1LeagueMatchMock.mockReturnValue({
      data: { leagueId: 'league-1', title: '가을 리그', state: 'completed', startsOn: '2026-09-01T00:00:00.000Z', endsOn: '2026-10-20T00:00:00.000Z', teamIds: ['t1'], fixtures: [] },
    } as never);
    useV1LeagueMatchStandingsMock.mockReturnValue({
      data: {
        leagueId: 'league-1',
        tieBreakOrder: ['points'],
        standings: [{ teamId: 't1', teamName: '성수 FC', teamLogoUrl: null, position: 1, played: 1, wins: 1, draws: 0, losses: 0, goalsFor: 2, goalsAgainst: 0, points: 3 }],
        pendingFixtures: [],
      },
    } as never);
    useV1LeagueMatchPlayerRecordsMock.mockReturnValue({ data: { leagueId: 'league-1', goals: [], assists: [] } } as never);

    render(
      <Providers>
        <LeagueMatchStandingsClient leagueId="league-1" />
      </Providers>,
    );

    await waitFor(() => expect(screen.getByText('종료')).toBeInTheDocument());
    expect(screen.getByText('최종 순위')).toBeInTheDocument();
  });

  it('미확정 경기 목록의 각 항목이 team-matches 상세 링크로 연결된다', async () => {
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1LeagueMatchMock.mockReturnValue({
      data: { leagueId: 'league-1', title: '가을 리그', state: 'active', startsOn: '2026-09-01T00:00:00.000Z', endsOn: '2026-10-20T00:00:00.000Z', teamIds: ['t1', 't2'], fixtures: [] },
    } as never);
    useV1LeagueMatchStandingsMock.mockReturnValue({
      data: {
        leagueId: 'league-1',
        tieBreakOrder: ['points'],
        standings: [
          { teamId: 't1', teamName: '성수 FC', teamLogoUrl: null, position: 1, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, points: 0 },
          { teamId: 't2', teamName: '망원 FC', teamLogoUrl: null, position: 2, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, points: 0 },
        ],
        pendingFixtures: [{ teamMatchId: 'tm-1', homeTeamId: 't1', awayTeamId: 't2', startAt: '2026-09-01T20:00:00.000Z' }],
      },
    } as never);
    useV1LeagueMatchPlayerRecordsMock.mockReturnValue({ data: { leagueId: 'league-1', goals: [], assists: [] } } as never);

    const { container } = render(
      <Providers>
        <LeagueMatchStandingsClient leagueId="league-1" />
      </Providers>,
    );

    await waitFor(() => expect(screen.getByText('확인 중')).toBeInTheDocument());
    const pendingLink = container.querySelector('a[href="/team-matches/tm-1"]');
    expect(pendingLink).toBeInTheDocument();
    expect(pendingLink?.textContent).toContain('성수 FC');
    expect(pendingLink?.textContent).toContain('망원 FC');
  });

  it('취소된 대진은 점수 대신 "집계 제외"로 표시한다', async () => {
    // 순위표는 취소 대진을 완전히 제외하는데(R8) 일정에만 "취소됨 1 : 0"이 굵게 남으면
    // 존재하는 점수가 왜 순위에 반영되지 않는지 알 수 없다. 두 집계가 같은 말을 해야 한다.
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1LeagueMatchMock.mockReturnValue({
      data: {
        leagueId: 'league-1', title: '가을 리그', state: 'active',
        startsOn: '2026-09-01T00:00:00.000Z', endsOn: '2026-10-20T00:00:00.000Z',
        teamIds: ['t1', 't2'],
        fixtures: [{
          teamMatchId: 'tm-1', title: '1주차', homeTeamId: 't1', awayTeamId: 't2',
          startAt: '2026-09-01T20:00:00.000Z', placeName: '성수 풋살장',
          status: 'cancelled', homeScore: 1, awayScore: 0,
        }],
      },
    } as never);
    useV1LeagueMatchStandingsMock.mockReturnValue({
      data: {
        leagueId: 'league-1', tieBreakOrder: ['points'],
        standings: [{ teamId: 't1', teamName: '성수 FC', teamLogoUrl: null, position: 1, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, points: 0 }],
        pendingFixtures: [],
      },
    } as never);
    useV1LeagueMatchPlayerRecordsMock.mockReturnValue({ data: { leagueId: 'league-1', goals: [], assists: [] } } as never);

    render(
      <Providers>
        <LeagueMatchStandingsClient leagueId="league-1" />
      </Providers>,
    );

    expect(await screen.findByText('집계 제외')).toBeInTheDocument();
    expect(screen.queryByText('1 : 0')).not.toBeInTheDocument();
    // 취소 대진에 "예정"이 붙던 문제도 같이 사라져야 한다.
    expect(screen.queryByText('예정')).not.toBeInTheDocument();
  });

  it('몰수 결과는 점수 옆에 "몰수" 뱃지로 실제 승리와 구분한다', async () => {
    // 몰수는 1:0으로 기록된다 — 뱃지가 없으면 실제로 치러진 1:0 승리와 화면에서 완전히
    // 같아 보여서, 관전자가 "이 팀이 이겼다"와 "상대가 안 나왔다"를 구분할 수 없다.
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1LeagueMatchMock.mockReturnValue({
      data: {
        leagueId: 'league-1', title: '가을 리그', state: 'active',
        startsOn: '2026-09-01T00:00:00.000Z', endsOn: '2026-10-20T00:00:00.000Z',
        teamIds: ['t1', 't2'],
        fixtures: [
          {
            teamMatchId: 'tm-1', title: '1주차', homeTeamId: 't1', awayTeamId: 't2',
            startAt: '2026-09-01T20:00:00.000Z', placeName: '성수 풋살장',
            status: 'completed', homeScore: 1, awayScore: 0, isForfeit: true,
          },
          {
            teamMatchId: 'tm-2', title: '2주차', homeTeamId: 't2', awayTeamId: 't1',
            startAt: '2026-09-08T20:00:00.000Z', placeName: '성수 풋살장',
            status: 'completed', homeScore: 1, awayScore: 0, isForfeit: false,
          },
        ],
      },
    } as never);
    useV1LeagueMatchStandingsMock.mockReturnValue({
      data: {
        leagueId: 'league-1', tieBreakOrder: ['points'],
        standings: [{ teamId: 't1', teamName: '성수 FC', teamLogoUrl: null, position: 1, played: 2, wins: 1, draws: 0, losses: 1, goalsFor: 1, goalsAgainst: 1, points: 3 }],
        pendingFixtures: [],
      },
    } as never);
    useV1LeagueMatchPlayerRecordsMock.mockReturnValue({ data: { leagueId: 'league-1', goals: [], assists: [] } } as never);

    render(
      <Providers>
        <LeagueMatchStandingsClient leagueId="league-1" />
      </Providers>,
    );

    // 두 경기 모두 1:0 이지만 뱃지는 몰수 쪽에만 붙는다 — 개수로 고정해야 "전부 몰수로
    // 표시" 같은 반대 방향 버그도 잡힌다.
    await waitFor(() => expect(screen.getAllByText('1 : 0')).toHaveLength(2));
    expect(screen.getAllByText('몰수')).toHaveLength(1);

    // 경기 행 링크의 접근성 이름에는 경기 제목이 없다(팀명·일시·장소·상태·점수만) —
    // 어느 행인지는 href 로 특정한다.
    const rowByHref = (teamMatchId: string) => {
      const row = screen
        .getAllByRole('link')
        .find((link) => link.getAttribute('href') === `/team-matches/${teamMatchId}`);
      if (!row) throw new Error(`fixture row not found: ${teamMatchId}`);
      return row;
    };
    expect(rowByHref('tm-1').textContent).toContain('몰수');
    expect(rowByHref('tm-2').textContent).not.toContain('몰수');
  });

  it('몰수 사유 원문은 공개 화면에 실리지 않는다', async () => {
    // 서버는 isForfeit(boolean)만 내려준다. 어드민이 쓴 사유가 응답에 섞여 들어오더라도
    // 화면이 그걸 렌더하면 내부 메모가 새어 나간다 — 렌더 경로에 사유가 없어야 한다.
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1LeagueMatchMock.mockReturnValue({
      data: {
        leagueId: 'league-1', title: '가을 리그', state: 'active',
        startsOn: '2026-09-01T00:00:00.000Z', endsOn: '2026-10-20T00:00:00.000Z',
        teamIds: ['t1', 't2'],
        fixtures: [{
          teamMatchId: 'tm-1', title: '1주차', homeTeamId: 't1', awayTeamId: 't2',
          startAt: '2026-09-01T20:00:00.000Z', placeName: '성수 풋살장',
          status: 'completed', homeScore: 1, awayScore: 0, isForfeit: true,
          reason: '[LEAGUE_FORFEIT] 원정팀 감독이 전화로 기권 통보',
        }],
      },
    } as never);
    useV1LeagueMatchStandingsMock.mockReturnValue({
      data: { leagueId: 'league-1', tieBreakOrder: ['points'], standings: [], pendingFixtures: [] },
    } as never);
    useV1LeagueMatchPlayerRecordsMock.mockReturnValue({ data: { leagueId: 'league-1', goals: [], assists: [] } } as never);

    render(
      <Providers>
        <LeagueMatchStandingsClient leagueId="league-1" />
      </Providers>,
    );

    expect(await screen.findByText('몰수')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('기권 통보');
    expect(document.body.textContent).not.toContain('LEAGUE_FORFEIT');
  });

  it('승강이 확정되면 순위표에 승격·강등 열이 붙고, 확정 전에는 열 자체가 없다', async () => {
    // Task 153 시나리오 4. 확정 전에 빈 열을 만들면 "아직 안 정해졌다"가 안 읽힌다.
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1LeagueMatchMock.mockReturnValue({
      data: {
        leagueId: 'league-1', title: '가을 리그 1부', state: 'completed',
        startsOn: '2026-09-01T00:00:00.000Z', endsOn: '2026-10-20T00:00:00.000Z',
        teamIds: ['t1', 't2'], fixtures: [], tier: 1, tierLabel: '1부', seasonNo: 1, seriesTitle: '강남 풋살 리그',
      },
    } as never);
    useV1LeagueMatchPlayerRecordsMock.mockReturnValue({ data: { leagueId: 'league-1', goals: [], assists: [] } } as never);

    const rows = [
      { teamId: 't1', teamName: '성수 FC', teamLogoUrl: null, position: 1, played: 1, wins: 1, draws: 0, losses: 0, goalsFor: 2, goalsAgainst: 0, points: 3 },
      { teamId: 't2', teamName: '망원 FC', teamLogoUrl: null, position: 2, played: 1, wins: 0, draws: 0, losses: 1, goalsFor: 0, goalsAgainst: 2, points: 0 },
    ];

    // 확정 전
    useV1LeagueMatchStandingsMock.mockReturnValue({
      data: {
        leagueId: 'league-1', tieBreakOrder: ['points'],
        standings: rows.map((r) => ({ ...r, promotionKind: null, promotionToTier: null, promotionToTierLabel: null })),
        pendingFixtures: [], promotionDecided: false,
      },
    } as never);
    const before = render(
      <Providers>
        <LeagueMatchStandingsClient leagueId="league-1" />
      </Providers>,
    );
    await screen.findByText('성수 FC');
    expect(screen.queryByRole('columnheader', { name: '승강' })).not.toBeInTheDocument();
    before.unmount();

    // 확정 후
    useV1LeagueMatchStandingsMock.mockReturnValue({
      data: {
        leagueId: 'league-1', tieBreakOrder: ['points'],
        standings: [
          { ...rows[0], promotionKind: 'stayed', promotionToTier: 1, promotionToTierLabel: '1부' },
          { ...rows[1], promotionKind: 'relegated', promotionToTier: 2, promotionToTierLabel: '2부' },
        ],
        pendingFixtures: [], promotionDecided: true,
      },
    } as never);
    render(
      <Providers>
        <LeagueMatchStandingsClient leagueId="league-1" />
      </Providers>,
    );

    expect(await screen.findByRole('columnheader', { name: '승강' })).toBeInTheDocument();
    expect(screen.getByText('강등')).toBeInTheDocument();
    // 이동할 티어는 승격·강등에만 붙는다(잔류에는 붙지 않는다).
    expect(screen.getByText('(2부)')).toBeInTheDocument();
    expect(screen.getByText('잔류')).toBeInTheDocument();
  });
});
