import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Providers } from '@/app/providers';
import {
  useV1ActivePopup,
  useV1AuthMe,
  useV1LeagueClaimableFixtures,
  useV1LeagueMatch,
  useV1LeagueMatchPlayerRecords,
  useV1LeagueMatchStandings,
  useV1MyLeagues,
  useV1MyTeams,
  useV1RecordConsent,
} from '@/hooks/use-v1-api';
import { clearStoredV1Session, saveStoredV1Session } from '@/lib/session-storage';
import { queryImageBySrc } from '@/test/next-image';
import LeagueMatchStandingsClient from './league-match-standings-client';

vi.mock('@/components/auth/pending-social-signup-gate', () => ({
  PendingSocialSignupGate: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1ActivePopup: vi.fn(),
  useV1LeagueMatch: vi.fn(),
  useV1LeagueMatchStandings: vi.fn(),
  useV1LeagueMatchPlayerRecords: vi.fn(),
  // F8 배너 경로. 기본값은 "로그인 안 됨 + 연결할 대진 없음" — 기존 테스트가 배너를
  // 만나지 않고 그대로 돌아간다.
  useV1AuthMe: vi.fn(() => ({ data: undefined })),
  useV1LeagueClaimableFixtures: vi.fn(() => ({ data: undefined })),
  // R5 동의 안내 경로. 기본값은 "이 리그 참가자가 아님 + 동의 응답 없음" — 기존 테스트는
  // 두 카드 어느 쪽도 만나지 않는다.
  useV1MyTeams: vi.fn(() => ({ data: undefined })),
  useV1RecordConsent: vi.fn(() => ({ data: undefined })),
  // 이 화면은 **비로그인도 열리는 공개 순위표**라 여기서 호출하면 안 되는 무거운 조회.
  // 아래 "공개 화면에서 무거운 조회를 붙이지 않는다" 테스트가 이 mock 이 한 번도 불리지
  // 않는지 검사한다.
  useV1MyLeagues: vi.fn(() => ({ data: undefined })),
  // Providers 안의 ThemeProvider가 전역으로 호출한다 — 이 테스트가 <Providers>로 렌더하는 한 필요.
  useV1Settings: vi.fn(() => ({ data: undefined, isError: false, refetch: vi.fn() })),
  useV1UpdateSettings: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

const useV1ActivePopupMock = vi.mocked(useV1ActivePopup, { partial: true });
const useV1LeagueMatchMock = vi.mocked(useV1LeagueMatch, { partial: true });
const useV1LeagueMatchStandingsMock = vi.mocked(useV1LeagueMatchStandings, { partial: true });
const useV1LeagueMatchPlayerRecordsMock = vi.mocked(useV1LeagueMatchPlayerRecords, { partial: true });
const useV1AuthMeMock = vi.mocked(useV1AuthMe, { partial: true });
const useV1LeagueClaimableFixturesMock = vi.mocked(useV1LeagueClaimableFixtures, { partial: true });
const useV1MyLeaguesMock = vi.mocked(useV1MyLeagues, { partial: true });
const useV1MyTeamsMock = vi.mocked(useV1MyTeams, { partial: true });
const useV1RecordConsentMock = vi.mocked(useV1RecordConsent, { partial: true });

describe('LeagueMatchStandingsClient', () => {
  // 이 파일의 픽스처는 킥오프 시각을 **문자열로 고정**해 두고 "아직 안 지났다"를 전제한다
  // (예: tm-10 은 2026-09-01T20:00Z 이고 라벨이 '예정' 이기를 기대한다). 라벨을 정하는
  // lib/league-fixture-meta.ts 는 `kickoffPassed` 를 현재 시각과 비교해서 계산하므로,
  // 시계를 얼려 두지 않으면 그 시각이 지나는 날부터 테스트가 영구히 깨진다 —
  // 실제로 2026-09-02 에 '예정' → '결과 대기' 로 바뀌며 터졌다. 컴포넌트는 옳았다
  // (킥오프가 지난 matched 는 '결과 대기' 가 맞다. league-fixture-card.tsx 주석 참조).
  //
  // Date 만 얼린다 — setTimeout 까지 얼리면 Testing Library 의 waitFor 가 진행하지 못한다.
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-01T12:00:00.000Z')); // 리그 시작 후 · tm-10 킥오프 전
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  // D3(2026-08-24 사용자 확정): 리그 안에서 팀으로 나가는 통로. 그전까지 순위표의 팀
  // 이름은 누를 수 없는 글자였다. 목적지는 팀 전적이 아니라 **팀 상세**로 못 박는다 —
  // 앱의 다른 화면과 같은 곳으로 가야 같은 단어가 화면마다 다른 데로 가지 않는다.
  it('순위표의 팀 이름은 팀 상세로 가는 링크다', async () => {
    useV1LeagueMatchMock.mockReturnValue({
      data: { leagueId: 'league-1', title: '가을 리그', state: 'active', startsOn: '2026-09-01T00:00:00.000Z', endsOn: '2026-10-20T00:00:00.000Z', teamIds: ['t1'], fixtures: [] },
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

    render(<LeagueMatchStandingsClient leagueId="league-1" />);

    const link = await screen.findByRole('link', { name: /성수 FC/ });
    expect(link).toHaveAttribute('href', '/teams/t1');
  });

  // 한 경기도 안 치른 리그는 순위표 대신 참가팀 목록을 보여준다 — 거기서도 팀으로 갈 수
  // 있어야 한다. 시즌 시작 전이 오히려 "어떤 팀이 나오지?"를 가장 많이 누르는 시점이다.
  it('참가팀 목록의 팀 이름도 팀 상세로 간다', async () => {
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
        pendingFixtures: [],
      },
    } as never);
    useV1LeagueMatchPlayerRecordsMock.mockReturnValue({ data: { leagueId: 'league-1', goals: [], assists: [] } } as never);

    render(<LeagueMatchStandingsClient leagueId="league-1" />);

    expect(await screen.findByRole('link', { name: /망원 FC/ })).toHaveAttribute('href', '/teams/t2');
  });

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

    // next/image 전환(U15) 이후 실제 DOM src는 `/_next/image?url=...`로 재작성된다.
    await waitFor(() => expect(queryImageBySrc(container, '/uploads/teams/seongsu.png')).not.toBeNull());
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
    const scheduled = container.querySelector('a[href="/league-matches/league-1/fixtures/tm-10"]');
    expect(scheduled).toBeInTheDocument();
    expect(scheduled?.textContent).toContain('성수 FC');
    expect(scheduled?.textContent).toContain('망원 FC');
    expect(scheduled?.textContent).toContain('예정');

    const scored = container.querySelector('a[href="/league-matches/league-1/fixtures/tm-11"]');
    expect(scored?.textContent).toContain('3 : 1');

    // 스코어 필드가 undefined(레인 C 병행 작업 중)여도 깨지지 않고 안전한 폴백을 보여준다.
    const pendingResult = container.querySelector('a[href="/league-matches/league-1/fixtures/tm-12"]');
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

  it('미확정 경기 목록의 각 항목이 리그 경기 상세 링크로 연결된다', async () => {
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
    const pendingLink = container.querySelector('a[href="/league-matches/league-1/fixtures/tm-1"]');
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
        .find((link) => link.getAttribute('href') === `/league-matches/league-1/fixtures/${teamMatchId}`);
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
    // 390px 미만에서 승강 열이 잘리는 결함 수정 후: 같은 승강 정보가 sm 이상 전용 열과
    // sm 미만 전용 팀명-하단 인라인 표기 두 곳에 함께 렌더된다(실제 표시 여부는 CSS가
    // 가르지만 jsdom은 CSS를 계산하지 않으므로 DOM에는 항상 둘 다 존재) — 그래서
    // getByText 단일 매치 대신 정확히 2곳(열 + 인라인)임을 확인한다.
    expect(screen.getAllByText('강등')).toHaveLength(2);
    // 이동할 티어는 승격·강등에만 붙는다(잔류에는 붙지 않는다).
    expect(screen.getAllByText('(2부)')).toHaveLength(2);
    expect(screen.getAllByText('잔류')).toHaveLength(2);
  });

  it('득점·도움이 동률이면 공동 순위(1,1,3)로 표시하고 배열 인덱스로 매기지 않는다', async () => {
    // 배열 인덱스+1을 등수로 쓰면 5골 동률 두 명이 "1위/2위"로 갈려 공동 1위가 뒤처진
    // 것처럼 보인다. 표준 경쟁 순위는 동점을 같은 등수로 묶고, 다음 등수는 동점자 수만큼
    // 건너뛴다(1,1,3) — 순위표(standings)가 서버 `position`을 그대로 쓰는 것과 대비해서
    // 득점·도움은 서버가 등수를 안 주므로 클라이언트가 계산한다.
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1LeagueMatchMock.mockReturnValue({
      data: { leagueId: 'league-1', title: '가을 리그', state: 'active', startsOn: '2026-09-01T00:00:00.000Z', endsOn: '2026-10-20T00:00:00.000Z', teamIds: ['t1'], fixtures: [] },
    } as never);
    useV1LeagueMatchStandingsMock.mockReturnValue({
      data: { leagueId: 'league-1', tieBreakOrder: ['points'], standings: [], pendingFixtures: [] },
    } as never);
    useV1LeagueMatchPlayerRecordsMock.mockReturnValue({
      data: {
        leagueId: 'league-1',
        // 내림차순 전제(서버 계약) — 5골 동률 2명 다음 3골 1명 → 1, 1, 3위.
        goals: [
          { userId: 'u1', nickname: '김철수', goals: 5, assists: 0 },
          { userId: 'u2', nickname: '이영희', goals: 5, assists: 0 },
          { userId: 'u3', nickname: '박민수', goals: 3, assists: 0 },
        ],
        // 도움도 동일 패턴으로 별도 검증(득점 로직과 독립적으로 계산돼야 한다).
        assists: [
          { userId: 'u4', nickname: '정다은', goals: 0, assists: 4 },
          { userId: 'u5', nickname: '최유진', goals: 0, assists: 4 },
          { userId: 'u6', nickname: '한소희', goals: 0, assists: 4 },
          { userId: 'u7', nickname: '오지훈', goals: 0, assists: 1 },
        ],
      },
    } as never);

    render(
      <Providers>
        <LeagueMatchStandingsClient leagueId="league-1" />
      </Providers>,
    );

    expect(await screen.findByText('1. 김철수')).toBeInTheDocument();
    expect(screen.getByText('1. 이영희')).toBeInTheDocument();
    expect(screen.getByText('3. 박민수')).toBeInTheDocument();

    // 3명 동률(1,1,1) 다음은 4위로 건너뛴다.
    expect(screen.getByText('1. 정다은')).toBeInTheDocument();
    expect(screen.getByText('1. 최유진')).toBeInTheDocument();
    expect(screen.getByText('1. 한소희')).toBeInTheDocument();
    expect(screen.getByText('4. 오지훈')).toBeInTheDocument();
  });

  it('감사 H-2: 확정 전에도 예상 승강을 보여주되 확정 표기와 문구·스타일로 구분한다', async () => {
    // 시즌 중(promotionDecided=false)에도 expectedPromotionKind/promotionForecast 로
    // "지금 순위대로면" 승강 경계가 보여야 한다 — 확정 표기('승격'/'강등')와 똑같이
    // 읽히면 아직 안 정해진 걸 정해진 것처럼 오해하므로 "예상" 접두어로 구분한다.
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1LeagueMatchMock.mockReturnValue({
      data: {
        leagueId: 'league-1', title: '가을 리그 2부', state: 'active',
        startsOn: '2026-09-01T00:00:00.000Z', endsOn: '2026-10-20T00:00:00.000Z',
        teamIds: ['t1', 't2'], fixtures: [], tier: 2, tierLabel: '2부', seasonNo: 1, seriesTitle: '강남 풋살 리그',
      },
    } as never);
    useV1LeagueMatchStandingsMock.mockReturnValue({
      data: {
        leagueId: 'league-1', tieBreakOrder: ['points'],
        standings: [
          {
            teamId: 't1', teamName: '성수 FC', teamLogoUrl: null, position: 1, played: 3, wins: 3, draws: 0, losses: 0,
            goalsFor: 9, goalsAgainst: 1, points: 9, promotionKind: null, promotionToTier: null, promotionToTierLabel: null,
            expectedPromotionKind: 'promoted', expectedPromotionToTier: 1, expectedPromotionToTierLabel: '1부',
          },
          {
            teamId: 't2', teamName: '망원 FC', teamLogoUrl: null, position: 2, played: 3, wins: 1, draws: 0, losses: 2,
            goalsFor: 2, goalsAgainst: 5, points: 3, promotionKind: null, promotionToTier: null, promotionToTierLabel: null,
            expectedPromotionKind: 'stayed', expectedPromotionToTier: null, expectedPromotionToTierLabel: null,
          },
        ],
        pendingFixtures: [],
        promotionDecided: false,
        promotionForecast: { promoteSlots: 1, relegateSlots: 1, skippedByMajorityGuard: false },
        tieBreakGroups: [],
      },
    } as never);
    useV1LeagueMatchPlayerRecordsMock.mockReturnValue({ data: { leagueId: 'league-1', goals: [], assists: [] } } as never);

    render(
      <Providers>
        <LeagueMatchStandingsClient leagueId="league-1" />
      </Providers>,
    );

    // 확정 뱃지 문구('승강')가 아니라 예상 전용 헤더('예상 승강')가 붙는다.
    expect(await screen.findByRole('columnheader', { name: '예상 승강' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: '승강' })).not.toBeInTheDocument();
    // "예상 승격" 문구 자체가 확정 뱃지('승격')와 구분되는 별도 텍스트다 — 열 + sm 미만
    // 인라인 두 곳에 렌더되므로 2곳 존재를 확인한다(다른 승강 테스트와 동일한 패턴).
    expect(screen.getAllByText(/예상 승격/)).toHaveLength(2);
    // 슬롯 규칙 요약도 함께 보인다.
    expect(screen.getByText(/상위 1팀 승격 \/ 하위 1팀 강등/)).toBeInTheDocument();
  });

  it('감사 H-2: skippedByMajorityGuard 면 이번 시즌 승강이 없다고 알려준다', async () => {
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1LeagueMatchMock.mockReturnValue({
      data: {
        leagueId: 'league-1', title: '가을 리그 2부', state: 'active',
        startsOn: '2026-09-01T00:00:00.000Z', endsOn: '2026-10-20T00:00:00.000Z',
        teamIds: ['t1', 't2'], fixtures: [], tier: 2, tierLabel: '2부',
      },
    } as never);
    useV1LeagueMatchStandingsMock.mockReturnValue({
      data: {
        leagueId: 'league-1', tieBreakOrder: ['points'],
        standings: [
          {
            teamId: 't1', teamName: '성수 FC', teamLogoUrl: null, position: 1, played: 1, wins: 1, draws: 0, losses: 0,
            goalsFor: 2, goalsAgainst: 0, points: 3, promotionKind: null, promotionToTier: null, promotionToTierLabel: null,
            expectedPromotionKind: 'stayed', expectedPromotionToTier: null, expectedPromotionToTierLabel: null,
          },
        ],
        pendingFixtures: [],
        promotionDecided: false,
        promotionForecast: { promoteSlots: 0, relegateSlots: 0, skippedByMajorityGuard: true },
        tieBreakGroups: [],
      },
    } as never);
    useV1LeagueMatchPlayerRecordsMock.mockReturnValue({ data: { leagueId: 'league-1', goals: [], assists: [] } } as never);

    render(
      <Providers>
        <LeagueMatchStandingsClient leagueId="league-1" />
      </Providers>,
    );

    expect(await screen.findByText('이번 시즌은 참가 팀 수가 적어 승강이 적용되지 않아요.')).toBeInTheDocument();
  });

  it('감사 H-5: tie-break 를 전부 소진한 팀 그룹은 임의 배정 안내가 뜨고, 빈 배열이면 안 뜬다', async () => {
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1LeagueMatchMock.mockReturnValue({
      data: { leagueId: 'league-1', title: '가을 리그', state: 'active', startsOn: '2026-09-01T00:00:00.000Z', endsOn: '2026-10-20T00:00:00.000Z', teamIds: ['t1', 't2'], fixtures: [] },
    } as never);
    useV1LeagueMatchStandingsMock.mockReturnValue({
      data: {
        leagueId: 'league-1', tieBreakOrder: ['points'],
        standings: [
          { teamId: 't1', teamName: '성수 FC', teamLogoUrl: null, position: 1, played: 1, wins: 0, draws: 1, losses: 0, goalsFor: 1, goalsAgainst: 1, points: 1 },
          { teamId: 't2', teamName: '망원 FC', teamLogoUrl: null, position: 2, played: 1, wins: 0, draws: 1, losses: 0, goalsFor: 1, goalsAgainst: 1, points: 1 },
        ],
        pendingFixtures: [],
        tieBreakGroups: [{ teamIds: ['t1', 't2'], teamNames: ['성수 FC', '망원 FC'] }],
      },
    } as never);
    useV1LeagueMatchPlayerRecordsMock.mockReturnValue({ data: { leagueId: 'league-1', goals: [], assists: [] } } as never);

    render(
      <Providers>
        <LeagueMatchStandingsClient leagueId="league-1" />
      </Providers>,
    );

    expect(await screen.findByText('모든 순위 기준이 같아 팀 순서가 임의로 정해진 팀이 있어요.')).toBeInTheDocument();
    expect(screen.getByText('성수 FC, 망원 FC')).toBeInTheDocument();
  });

  it('감사 H-5: 대부분의 시즌처럼 tieBreakGroups 가 빈 배열이면 안내가 뜨지 않는다', async () => {
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1LeagueMatchMock.mockReturnValue({
      data: { leagueId: 'league-1', title: '가을 리그', state: 'active', startsOn: '2026-09-01T00:00:00.000Z', endsOn: '2026-10-20T00:00:00.000Z', teamIds: ['t1'], fixtures: [] },
    } as never);
    useV1LeagueMatchStandingsMock.mockReturnValue({
      data: {
        leagueId: 'league-1', tieBreakOrder: ['points'],
        standings: [{ teamId: 't1', teamName: '성수 FC', teamLogoUrl: null, position: 1, played: 1, wins: 1, draws: 0, losses: 0, goalsFor: 2, goalsAgainst: 0, points: 3 }],
        pendingFixtures: [],
        tieBreakGroups: [],
      },
    } as never);
    useV1LeagueMatchPlayerRecordsMock.mockReturnValue({ data: { leagueId: 'league-1', goals: [], assists: [] } } as never);

    render(
      <Providers>
        <LeagueMatchStandingsClient leagueId="league-1" />
      </Providers>,
    );

    await screen.findByText('성수 FC');
    expect(screen.queryByText(/임의로 정해진/)).not.toBeInTheDocument();
  });

  it('이슈 4: 아직 한 경기도 안 치르고 예정 대진도 없으면 0-0-0 순위표 대신 참가 팀 목록을 보여준다', async () => {
    // played 합계 0 + pendingFixtures 도 비어 있어야만 발동한다(대진은 잡혔는데 결과만
    // 미확정인 정상 상태는 기존 "0경기 순위표+확인 중 배너" 테스트로 이미 보장돼 있다).
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1LeagueMatchMock.mockReturnValue({
      data: { leagueId: 'league-1', title: '가을 리그', state: 'draft', startsOn: '2026-09-01T00:00:00.000Z', endsOn: '2026-10-20T00:00:00.000Z', teamIds: ['t1', 't2'], fixtures: [] },
    } as never);
    useV1LeagueMatchStandingsMock.mockReturnValue({
      data: {
        leagueId: 'league-1', tieBreakOrder: ['points'],
        standings: [
          { teamId: 't1', teamName: '성수 FC', teamLogoUrl: null, position: 1, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, points: 0 },
          { teamId: 't2', teamName: '망원 FC', teamLogoUrl: null, position: 2, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, points: 0 },
        ],
        pendingFixtures: [],
      },
    } as never);
    useV1LeagueMatchPlayerRecordsMock.mockReturnValue({ data: { leagueId: 'league-1', goals: [], assists: [] } } as never);

    render(
      <Providers>
        <LeagueMatchStandingsClient leagueId="league-1" />
      </Providers>,
    );

    expect(await screen.findByText('참가 팀')).toBeInTheDocument();
    expect(screen.queryByText('순위표')).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByText('성수 FC')).toBeInTheDocument();
    expect(screen.getByText('망원 FC')).toBeInTheDocument();
    // 0점/0전 같은 의미 없는 숫자는 더는 렌더되지 않는다.
    expect(screen.queryByText('0-0-0')).not.toBeInTheDocument();
  });

  it('이슈 3: "예정만 보기"를 누르면 이미 끝난 경기가 걷히고 다음 경기에 뱃지가 붙는다', async () => {
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1LeagueMatchMock.mockReturnValue({
      data: {
        leagueId: 'league-1', title: '가을 리그', state: 'active',
        startsOn: '2026-09-01T00:00:00.000Z', endsOn: '2026-10-20T00:00:00.000Z',
        teamIds: ['t1', 't2'],
        fixtures: [
          { teamMatchId: 'tm-past', title: '1라운드', homeTeamId: 't1', awayTeamId: 't2', startAt: '2026-09-01T20:00:00.000Z', placeName: '성수 풋살장', status: 'completed', homeScore: 3, awayScore: 1 },
          { teamMatchId: 'tm-next', title: '2라운드', homeTeamId: 't2', awayTeamId: 't1', startAt: '2026-09-08T20:00:00.000Z', placeName: '망원 풋살장', status: 'matched' },
        ],
      },
    } as never);
    useV1LeagueMatchStandingsMock.mockReturnValue({
      data: {
        leagueId: 'league-1', tieBreakOrder: ['points'],
        standings: [
          { teamId: 't1', teamName: '성수 FC', teamLogoUrl: null, position: 1, played: 1, wins: 1, draws: 0, losses: 0, goalsFor: 3, goalsAgainst: 1, points: 3 },
          { teamId: 't2', teamName: '망원 FC', teamLogoUrl: null, position: 2, played: 1, wins: 0, draws: 0, losses: 1, goalsFor: 1, goalsAgainst: 3, points: 0 },
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

    // 필터를 켜지 않아도 다음 경기 행에는 뱃지가 붙는다.
    await waitFor(() => expect(container.querySelector('a[href="/league-matches/league-1/fixtures/tm-next"]')).toBeInTheDocument());
    const nextLink = container.querySelector('a[href="/league-matches/league-1/fixtures/tm-next"]');
    expect(nextLink?.textContent).toContain('다음 경기');
    const pastLinkBefore = container.querySelector('a[href="/league-matches/league-1/fixtures/tm-past"]');
    expect(pastLinkBefore).toBeInTheDocument();

    // "예정만" 필터를 누르면 이미 끝난 경기가 화면에서 사라진다.
    fireEvent.click(screen.getByRole('button', { name: '예정만' }));
    await waitFor(() => expect(container.querySelector('a[href="/league-matches/league-1/fixtures/tm-past"]')).not.toBeInTheDocument());
    expect(container.querySelector('a[href="/league-matches/league-1/fixtures/tm-next"]')).toBeInTheDocument();
  });
  /**
   * 재검토에서 잡힌 판정 불일치 — isUpcomingFixture 가 "취소 아님 + 스코어 없음"만 보던 시절엔
   * 이미 치렀지만 공식 결과가 안 붙은 대진(status='completed' + 스코어 null, 행에는 '결과 대기'가
   * 찍힌다)까지 '예정'으로 세어, "예정만 보기"에 '결과 대기' 행이 섞여 나오고 "다음 경기" 뱃지도
   * 지난 경기에 붙었다. 판정을 fixtureResultLabel 과 같은 기준으로 맞춘 뒤의 동작을 고정한다.
   */
  it('이슈 3 회귀: 결과 대기(치른 뒤 미확정) 경기는 예정으로 세지 않는다', async () => {
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1LeagueMatchMock.mockReturnValue({
      data: {
        leagueId: 'league-1', title: '가을 리그', state: 'active',
        startsOn: '2026-09-01T00:00:00.000Z', endsOn: '2026-10-20T00:00:00.000Z',
        teamIds: ['t1', 't2'],
        fixtures: [
          // 이미 치렀지만 공식 결과 미확정 → 행에는 '결과 대기'가 찍힌다.
          { teamMatchId: 'tm-awaiting', title: '1라운드', homeTeamId: 't1', awayTeamId: 't2', startAt: '2026-09-01T20:00:00.000Z', placeName: '성수 풋살장', status: 'completed' },
          // 진짜 예정 경기.
          { teamMatchId: 'tm-upcoming', title: '2라운드', homeTeamId: 't2', awayTeamId: 't1', startAt: '2026-09-08T20:00:00.000Z', placeName: '망원 풋살장', status: 'matched' },
        ],
      },
    } as never);
    useV1LeagueMatchStandingsMock.mockReturnValue({
      data: {
        leagueId: 'league-1', tieBreakOrder: ['points'],
        standings: [
          { teamId: 't1', teamName: '성수 FC', teamLogoUrl: null, position: 1, played: 1, wins: 1, draws: 0, losses: 0, goalsFor: 3, goalsAgainst: 1, points: 3 },
          { teamId: 't2', teamName: '망원 FC', teamLogoUrl: null, position: 2, played: 1, wins: 0, draws: 0, losses: 1, goalsFor: 1, goalsAgainst: 3, points: 0 },
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

    // "다음 경기" 뱃지는 결과 대기 행이 아니라 진짜 예정 경기에 붙어야 한다.
    await waitFor(() => expect(container.querySelector('a[href="/league-matches/league-1/fixtures/tm-upcoming"]')).toBeInTheDocument());
    expect(container.querySelector('a[href="/league-matches/league-1/fixtures/tm-upcoming"]')?.textContent).toContain('다음 경기');
    expect(container.querySelector('a[href="/league-matches/league-1/fixtures/tm-awaiting"]')?.textContent).not.toContain('다음 경기');

    // "예정만"을 켜면 결과 대기 행도 함께 걷힌다 — 화면에 찍힌 문구와 필터 기준이 일치해야 한다.
    fireEvent.click(screen.getByRole('button', { name: '예정만' }));
    await waitFor(() => expect(container.querySelector('a[href="/league-matches/league-1/fixtures/tm-awaiting"]')).not.toBeInTheDocument());
    expect(container.querySelector('a[href="/league-matches/league-1/fixtures/tm-upcoming"]')).toBeInTheDocument();
  });

  it('이슈 1: 같은 시리즈의 다른 시즌·티어로 가는 링크를 보여준다', async () => {
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1LeagueMatchMock.mockReturnValue({
      data: {
        leagueId: 'league-1', title: '가을 리그 1부', state: 'active',
        startsOn: '2026-09-01T00:00:00.000Z', endsOn: '2026-10-20T00:00:00.000Z',
        teamIds: ['t1'], fixtures: [], seriesId: 'series-1', tier: 1, tierLabel: '1부', seasonNo: 2,
        seriesSiblings: [
          { leagueId: 'league-2', tier: 2, tierLabel: '2부', seasonNo: 2, state: 'active' },
          { leagueId: 'league-3', tier: 1, tierLabel: '1부', seasonNo: 1, state: 'completed' },
        ],
      },
    } as never);
    useV1LeagueMatchStandingsMock.mockReturnValue({
      data: {
        leagueId: 'league-1', tieBreakOrder: ['points'],
        standings: [{ teamId: 't1', teamName: '성수 FC', teamLogoUrl: null, position: 1, played: 1, wins: 1, draws: 0, losses: 0, goalsFor: 2, goalsAgainst: 0, points: 3 }],
        pendingFixtures: [],
      },
    } as never);
    useV1LeagueMatchPlayerRecordsMock.mockReturnValue({ data: { leagueId: 'league-1', goals: [], assists: [] } } as never);

    const { container } = render(
      <Providers>
        <LeagueMatchStandingsClient leagueId="league-1" />
      </Providers>,
    );

    await waitFor(() => expect(screen.getByRole('navigation', { name: '같은 시리즈의 다른 리그' })).toBeInTheDocument());
    const siblingLink = container.querySelector('a[href="/league-matches/league-2"]');
    expect(siblingLink?.textContent).toContain('2시즌');
    expect(siblingLink?.textContent).toContain('2부');
    expect(container.querySelector('a[href="/league-matches/league-3"]')).toBeInTheDocument();
    // 지금 보고 있는 리그 자기 자신으로 가는 링크는 없다.
    expect(container.querySelector('a[href="/league-matches/league-1"]')).not.toBeInTheDocument();
  });

  it('이슈 1: 단발 리그(seriesSiblings 빈 배열)는 탐색 링크를 그리지 않는다', async () => {
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1LeagueMatchMock.mockReturnValue({
      data: {
        leagueId: 'league-1', title: '단발 리그', state: 'active',
        startsOn: '2026-09-01T00:00:00.000Z', endsOn: '2026-10-20T00:00:00.000Z',
        teamIds: ['t1'], fixtures: [], seriesId: null, seriesSiblings: [],
      },
    } as never);
    useV1LeagueMatchStandingsMock.mockReturnValue({
      data: {
        leagueId: 'league-1', tieBreakOrder: ['points'],
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

    await screen.findByText('성수 FC');
    expect(screen.queryByRole('navigation', { name: '같은 시리즈의 다른 리그' })).not.toBeInTheDocument();
  });

  it('이슈 2: 몰수 스코어 옆에는 "관례 스코어" 안내가 붙고 실제 결과에는 붙지 않는다', async () => {
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

    const { container } = render(
      <Providers>
        <LeagueMatchStandingsClient leagueId="league-1" />
      </Providers>,
    );

    await waitFor(() => expect(screen.getAllByText('1 : 0')).toHaveLength(2));
    expect(screen.getByText('(관례 스코어)')).toBeInTheDocument();

    const forfeitRow = container.querySelector('a[href="/league-matches/league-1/fixtures/tm-1"]');
    const realRow = container.querySelector('a[href="/league-matches/league-1/fixtures/tm-2"]');
    expect(forfeitRow?.textContent).toContain('관례 스코어');
    expect(realRow?.textContent).not.toContain('관례 스코어');
  });

  it('이슈 3: 취소된 대진이 있으면 순위표에 제외 안내가 붙고, 없으면 붙지 않는다', async () => {
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1LeagueMatchMock.mockReturnValue({
      data: {
        leagueId: 'league-1', title: '가을 리그', state: 'completed',
        startsOn: '2026-09-01T00:00:00.000Z', endsOn: '2026-10-20T00:00:00.000Z',
        teamIds: ['t1'], fixtures: [],
      },
    } as never);
    useV1LeagueMatchStandingsMock.mockReturnValue({
      data: {
        leagueId: 'league-1', tieBreakOrder: ['points'],
        standings: [{ teamId: 't1', teamName: '성수 FC', teamLogoUrl: null, position: 1, played: 3, wins: 3, draws: 0, losses: 0, goalsFor: 6, goalsAgainst: 0, points: 9 }],
        pendingFixtures: [],
        cancelledFixtureCount: 1,
      },
    } as never);
    useV1LeagueMatchPlayerRecordsMock.mockReturnValue({ data: { leagueId: 'league-1', goals: [], assists: [] } } as never);

    render(
      <Providers>
        <LeagueMatchStandingsClient leagueId="league-1" />
      </Providers>,
    );

    expect(await screen.findByText(/취소된 1경기는 집계에서 제외됐어요/)).toBeInTheDocument();
  });

  it('이슈 3: 취소된 대진이 0건이면 제외 안내가 뜨지 않는다', async () => {
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1LeagueMatchMock.mockReturnValue({
      data: {
        leagueId: 'league-1', title: '가을 리그', state: 'completed',
        startsOn: '2026-09-01T00:00:00.000Z', endsOn: '2026-10-20T00:00:00.000Z',
        teamIds: ['t1'], fixtures: [],
      },
    } as never);
    useV1LeagueMatchStandingsMock.mockReturnValue({
      data: {
        leagueId: 'league-1', tieBreakOrder: ['points'],
        standings: [{ teamId: 't1', teamName: '성수 FC', teamLogoUrl: null, position: 1, played: 3, wins: 3, draws: 0, losses: 0, goalsFor: 6, goalsAgainst: 0, points: 9 }],
        pendingFixtures: [],
        cancelledFixtureCount: 0,
      },
    } as never);
    useV1LeagueMatchPlayerRecordsMock.mockReturnValue({ data: { leagueId: 'league-1', goals: [], assists: [] } } as never);

    render(
      <Providers>
        <LeagueMatchStandingsClient leagueId="league-1" />
      </Providers>,
    );

    await screen.findByText('성수 FC');
    expect(screen.queryByText(/집계에서 제외됐어요/)).not.toBeInTheDocument();
  });

  it('그룹 C: 진행 중인 리그는 시즌 요약 카드가 뜨지 않는다', async () => {
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1LeagueMatchMock.mockReturnValue({
      data: {
        leagueId: 'league-1', title: '가을 리그', state: 'active',
        startsOn: '2026-09-01T00:00:00.000Z', endsOn: '2026-10-20T00:00:00.000Z',
        teamIds: ['t1'], fixtures: [],
      },
    } as never);
    useV1LeagueMatchStandingsMock.mockReturnValue({
      data: {
        leagueId: 'league-1', tieBreakOrder: ['points'],
        standings: [{ teamId: 't1', teamName: '성수 FC', teamLogoUrl: null, position: 1, played: 1, wins: 1, draws: 0, losses: 0, goalsFor: 2, goalsAgainst: 0, points: 3 }],
        pendingFixtures: [],
        champions: [],
      },
    } as never);
    useV1LeagueMatchPlayerRecordsMock.mockReturnValue({ data: { leagueId: 'league-1', goals: [], assists: [] } } as never);

    render(
      <Providers>
        <LeagueMatchStandingsClient leagueId="league-1" />
      </Providers>,
    );

    await screen.findByText('성수 FC');
    // 종료 전 리그는 "우승" 개념이 아직 성립하지 않는다 — 카드 자체가 렌더되지 않는다.
    expect(screen.queryByText('이번 시즌 요약')).not.toBeInTheDocument();
  });

  it('그룹 C: 종료된 리그는 공동 우승·승강 결과·득점왕을 담은 시즌 요약 카드를 보여주고 시상 화면으로 이어진다', async () => {
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1LeagueMatchMock.mockReturnValue({
      data: {
        leagueId: 'league-1', title: '가을 리그', state: 'completed',
        startsOn: '2026-09-01T00:00:00.000Z', endsOn: '2026-10-20T00:00:00.000Z',
        teamIds: ['t1', 't2', 't3'], fixtures: [],
      },
    } as never);
    useV1LeagueMatchStandingsMock.mockReturnValue({
      data: {
        leagueId: 'league-1', tieBreakOrder: ['points'],
        standings: [
          { teamId: 't1', teamName: '성수 FC', teamLogoUrl: null, position: 1, played: 3, wins: 3, draws: 0, losses: 0, goalsFor: 9, goalsAgainst: 0, points: 9, promotionKind: 'promoted', promotionToTierLabel: '1부' },
          { teamId: 't2', teamName: '망원 FC', teamLogoUrl: null, position: 1, played: 3, wins: 3, draws: 0, losses: 0, goalsFor: 9, goalsAgainst: 0, points: 9, promotionKind: 'promoted', promotionToTierLabel: '1부' },
          { teamId: 't3', teamName: '연남 FC', teamLogoUrl: null, position: 3, played: 3, wins: 0, draws: 0, losses: 3, goalsFor: 0, goalsAgainst: 9, points: 0, promotionKind: 'relegated', promotionToTierLabel: '3부' },
        ],
        pendingFixtures: [],
        // 공동 우승(승점·득실·다득점 전부 동률) — resolveLeagueChampions가 tieGroups에서
        // 1위 팀이 속한 그룹 전원을 champions로 내려준다는 서버 계약을 그대로 흉내낸다.
        champions: [
          { teamId: 't1', teamName: '성수 FC', teamLogoUrl: null },
          { teamId: 't2', teamName: '망원 FC', teamLogoUrl: null },
        ],
        promotionDecided: true,
      },
    } as never);
    useV1LeagueMatchPlayerRecordsMock.mockReturnValue({
      data: {
        leagueId: 'league-1',
        // 5골 동점 공동 득점왕 두 명 — competitionRanks가 둘 다 1위로 매겨야 한다.
        goals: [
          { userId: 'u1', nickname: '김민준', goals: 5 },
          { userId: 'u2', nickname: '이서준', goals: 5 },
          { userId: 'u3', nickname: '박도윤', goals: 2 },
        ],
        assists: [],
      },
    } as never);

    render(
      <Providers>
        <LeagueMatchStandingsClient leagueId="league-1" />
      </Providers>,
    );

    expect(await screen.findByText('이번 시즌 요약')).toBeInTheDocument();
    expect(screen.getByText('공동 우승')).toBeInTheDocument();
    // 두 우승팀 이름이 모두 카드에 보인다 (공동 우승이면 한 팀만 보이는 사고를 막는다).
    expect(screen.getByText(/성수 FC.*망원 FC/)).toBeInTheDocument();
    expect(screen.getByText(/승격 2팀 · 강등 1팀/)).toBeInTheDocument();
    expect(screen.getByText('공동 득점왕')).toBeInTheDocument();
    expect(screen.getByText(/김민준.*이서준/)).toBeInTheDocument();

    const link = screen.getByRole('link', { name: /시즌 결산 자세히 보기/ });
    expect(link).toHaveAttribute('href', '/league-matches/league-1/awards');
  });
  /**
   * Wave 4 재검토 — SeasonSummaryCard 가 로딩을 에러보다 먼저 검사하면, 호출부가 loading 을
   * `standings === undefined` 로 넘기는 탓에 **실패한 요청이 영원히 스켈레톤으로 남는다**
   * (에러 분기에 도달하지 못해 사용자는 계속 로딩 중으로 오해한다). 분기 순서를 고정한다.
   */
  it('그룹 C 회귀: 순위표 조회가 실패하면 시즌 요약이 스켈레톤이 아니라 에러 문구를 보여준다', async () => {
    useV1ActivePopupMock.mockReturnValue({ data: undefined, isPending: false } as never);
    useV1LeagueMatchMock.mockReturnValue({
      data: {
        leagueId: 'league-1', title: '가을 리그', state: 'completed',
        startsOn: '2026-09-01T00:00:00.000Z', endsOn: '2026-10-20T00:00:00.000Z',
        teamIds: ['t1', 't2'], fixtures: [],
      },
    } as never);
    // 실패한 쿼리: data 는 undefined 이고 isError 가 true 다.
    useV1LeagueMatchStandingsMock.mockReturnValue({ data: undefined, isError: true } as never);
    useV1LeagueMatchPlayerRecordsMock.mockReturnValue({ data: { leagueId: 'league-1', goals: [], assists: [] } } as never);

    render(
      <Providers>
        <LeagueMatchStandingsClient leagueId="league-1" />
      </Providers>,
    );

    expect(await screen.findByText('이번 시즌 요약')).toBeInTheDocument();
    expect(await screen.findByText('시즌 요약을 불러오지 못했어요')).toBeInTheDocument();
  });

  // 기록이 입력됐지만 신원 연동·동의가 없어 집계에서 빠진 경우, "결과가 쌓이면
  // 나타나요"는 거짓 안내가 된다 — hiddenByEligibility 가 문구를 갈라야 한다.
  it('hiddenByEligibility 면 빈 상태 문구가 동의 안내로 바뀐다', async () => {
    useV1LeagueMatchMock.mockReturnValue({
      data: { leagueId: 'league-1', title: '가을 리그', state: 'active', startsOn: '2026-09-01T00:00:00.000Z', endsOn: '2026-10-20T00:00:00.000Z', teamIds: ['t1'], fixtures: [] },
    } as never);
    useV1LeagueMatchStandingsMock.mockReturnValue({
      data: { leagueId: 'league-1', tieBreakOrder: ['points'], standings: [], pendingFixtures: [] },
    } as never);
    useV1LeagueMatchPlayerRecordsMock.mockReturnValue({
      data: { leagueId: 'league-1', goals: [], assists: [], hiddenByEligibility: true },
    } as never);

    render(<LeagueMatchStandingsClient leagueId="league-1" />);

    expect(
      await screen.findByText('득점 기록은 있지만, 선수가 신원 연동과 경기 기록 공개에 동의하면 순위가 공개돼요.'),
    ).toBeInTheDocument();
    expect(
      await screen.findByText('도움 기록은 있지만, 선수가 신원 연동과 경기 기록 공개에 동의하면 순위가 공개돼요.'),
    ).toBeInTheDocument();
  });

  /* ── F8: 빈 상태에서 신원 연동으로 가는 길 ────────────────────────────────
   * 빈 상태는 "신원 연동과 기록 공개에 동의하면 순위가 공개돼요"라고 이유를 말하는데
   * 정작 이 화면에는 연동을 시작할 수단이 없었다(alpha 실측). 아래 테스트들은 그 길이
   * **필요한 사람에게만** 열리는지를 본다 — 아무에게나 쓸모없는 버튼을 남기면 그건
   * 고친 게 아니라 옮긴 것이다.
   * ────────────────────────────────────────────────────────────────────── */
  afterEach(() => {
    clearStoredV1Session();
    useV1AuthMeMock.mockReturnValue({ data: undefined } as never);
    useV1LeagueClaimableFixturesMock.mockReturnValue({ data: undefined } as never);
    useV1MyLeaguesMock.mockClear();
    useV1MyTeamsMock.mockReturnValue({ data: undefined } as never);
    useV1RecordConsentMock.mockReturnValue({ data: undefined } as never);
  });

  /**
   * 이 리그의 참가팀. 순위표 응답이 곧 참가팀 목록이라(서버가 `league.teams` 로 행을 만든다)
   * 참가자 판정이 이 값을 그대로 쓴다 — 그래서 배너 테스트도 여기서 참가팀을 정한다.
   */
  const LEAGUE_TEAM_ID = 't1';

  function mockLeague(
    records: {
      goals: { userId: string; nickname: string | null; goals: number }[];
      assists: { userId: string; nickname: string | null; assists: number }[];
      hiddenByEligibility: boolean;
    },
    leagueTeamIds: string[] = [LEAGUE_TEAM_ID],
  ) {
    useV1LeagueMatchMock.mockReturnValue({
      data: { leagueId: 'league-1', title: '가을 리그', state: 'active', startsOn: '2026-09-01T00:00:00.000Z', endsOn: '2026-10-20T00:00:00.000Z', teamIds: ['t1'], fixtures: [] },
    } as never);
    useV1LeagueMatchStandingsMock.mockReturnValue({
      data: {
        leagueId: 'league-1',
        tieBreakOrder: ['points'],
        standings: leagueTeamIds.map((teamId, index) => ({
          teamId,
          teamName: `${teamId} 팀`,
          teamLogoUrl: null,
          position: index + 1,
          played: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          goalsFor: 0,
          goalsAgainst: 0,
          points: 0,
        })),
        pendingFixtures: [],
      },
    } as never);
    useV1LeagueMatchPlayerRecordsMock.mockReturnValue({ data: { leagueId: 'league-1', ...records } } as never);
  }

  /**
   * 훅 mock 이 `enabled` 를 실제로 지킨다 — 그래야 "조회를 보내지 않는다"는 게이트가
   * 호출 인자 대조가 아니라 **화면에 배너가 없다**로 검증된다.
   */
  function mockClaimableFixtures(
    fixtures: { teamMatchId: string; title: string; startAt: string; claimableCount: number }[],
  ) {
    useV1LeagueClaimableFixturesMock.mockImplementation(
      ((_leagueId: string, options?: { enabled?: boolean }) =>
        (options?.enabled ?? true)
          ? { data: { leagueId: 'league-1', fixtures } }
          : { data: undefined }) as never,
    );
  }

  const oneFixture = [
    { teamMatchId: 'tm-1', title: '가을 리그 1주차 1경기', startAt: '2026-08-01T10:00:00.000Z', claimableCount: 2 },
  ];

  /**
   * "내 팀" 도 `enabled` 를 지킨다 — 비로그인 관전자에게 조회가 나가지 않는다는 것을
   * 호출 인자가 아니라 **화면에 안내가 없다**로 검증하기 위해서다.
   */
  function mockMyTeams(teamIds: string[]) {
    useV1MyTeamsMock.mockImplementation(
      ((_filters?: unknown, options?: { enabled?: boolean }) =>
        (options?.enabled ?? true)
          ? { data: { items: teamIds.map((teamId) => ({ teamId })) } }
          : { data: undefined }) as never,
    );
  }

  /**
   * React Query 는 `enabled: false` 여도 **캐시에 남아 있는 데이터는 그대로 돌려준다.**
   * "내 팀"은 앱 전역이 공유하는 쿼리 키라, 사용자가 팀·대회 화면을 먼저 다녀왔다면 이
   * 리그 화면에서 조회가 꺼져 있어도 data 가 채워진 채로 들어온다 — `enabled` 만 믿고
   * 게이트를 세우면 그 경로로 샌다.
   */
  function mockMyTeamsFromWarmCache(teamIds: string[]) {
    useV1MyTeamsMock.mockReturnValue({
      data: { items: teamIds.map((teamId) => ({ teamId })) },
    } as never);
  }

  function mockRecordConsent(
    consent: { granted: boolean; hasResponded: boolean; pendingRecordCount: number } | undefined,
  ) {
    useV1RecordConsentMock.mockReturnValue({ data: consent } as never);
  }

  /** 아직 동의를 한 번도 묻지 않은 사람 — 안내 대상. */
  const NEVER_ASKED = { granted: false, hasResponded: false, pendingRecordCount: 3 };

  const CONSENT_CARD_TITLE = '내 경기 기록이 아직 비공개예요';

  it('공개 자격 때문에 순위가 비면, 연결할 대진이 있는 사람에게 연동 배너를 보여준다', async () => {
    saveStoredV1Session({ userId: 'me' });
    useV1AuthMeMock.mockReturnValue({ data: { id: 'me' } } as never);
    mockLeague({ goals: [], assists: [], hiddenByEligibility: true });
    mockClaimableFixtures(oneFixture);

    render(<LeagueMatchStandingsClient leagueId="league-1" />);

    expect(await screen.findByText('이 리그에서 뛰었는데 내 기록이 없나요?')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /가을 리그 1주차 1경기 경기 상세로 이동/ });
    expect(link).toHaveAttribute('href', '/league-matches/league-1/fixtures/tm-1');
    expect(link).toHaveTextContent('연결 안 된 참가자 2명');
  });

  it('연결할 대진이 0건이면 배너를 아예 띄우지 않는다', async () => {
    saveStoredV1Session({ userId: 'me' });
    useV1AuthMeMock.mockReturnValue({ data: { id: 'me' } } as never);
    mockLeague({ goals: [], assists: [], hiddenByEligibility: true });
    mockClaimableFixtures([]);

    render(<LeagueMatchStandingsClient leagueId="league-1" />);

    // 화면 자체는 그려졌다(빈 상태 문구 존재) — 배너만 없다.
    expect(
      await screen.findByText('득점 기록은 있지만, 선수가 신원 연동과 경기 기록 공개에 동의하면 순위가 공개돼요.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('이 리그에서 뛰었는데 내 기록이 없나요?')).not.toBeInTheDocument();
  });

  it('비로그인 관전자에게는 배너를 띄우지도, 목록을 조회하지도 않는다', async () => {
    // 세션 힌트 없음. 서버가 대진을 준다 해도 조회 자체가 꺼져 있어야 한다.
    mockLeague({ goals: [], assists: [], hiddenByEligibility: true });
    mockClaimableFixtures(oneFixture);

    render(<LeagueMatchStandingsClient leagueId="league-1" />);

    expect(
      await screen.findByText('득점 기록은 있지만, 선수가 신원 연동과 경기 기록 공개에 동의하면 순위가 공개돼요.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('이 리그에서 뛰었는데 내 기록이 없나요?')).not.toBeInTheDocument();
  });

  it('공개 자격과 무관하게 비어 있는 순위에는 배너를 붙이지 않는다', async () => {
    saveStoredV1Session({ userId: 'me' });
    useV1AuthMeMock.mockReturnValue({ data: { id: 'me' } } as never);
    // 아직 확정된 결과가 없어서 빈 것 — 연동도 동의도 이 상태의 처방이 아니다.
    mockLeague({ goals: [], assists: [], hiddenByEligibility: false });
    mockClaimableFixtures(oneFixture);
    mockMyTeams([LEAGUE_TEAM_ID]);
    mockRecordConsent(NEVER_ASKED);

    render(<LeagueMatchStandingsClient leagueId="league-1" />);

    expect(await screen.findByText('확정된 경기 결과가 쌓이면 득점 순위가 나타나요.')).toBeInTheDocument();
    expect(screen.queryByText('이 리그에서 뛰었는데 내 기록이 없나요?')).not.toBeInTheDocument();
    expect(screen.queryByText(CONSENT_CARD_TITLE)).not.toBeInTheDocument();
  });

  it('연결할 대진이 많으면 앞 3건만 펼치고 나머지는 건수로 알린다', async () => {
    saveStoredV1Session({ userId: 'me' });
    useV1AuthMeMock.mockReturnValue({ data: { id: 'me' } } as never);
    mockLeague({ goals: [], assists: [], hiddenByEligibility: true });
    mockClaimableFixtures(
      [1, 2, 3, 4, 5].map((week) => ({
        teamMatchId: `tm-${week}`,
        title: `가을 리그 ${week}주차 1경기`,
        startAt: `2026-08-0${week}T10:00:00.000Z`,
        claimableCount: 1,
      })),
    );

    render(<LeagueMatchStandingsClient leagueId="league-1" />);

    expect(await screen.findByText('이 리그에서 뛰었는데 내 기록이 없나요?')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /경기 상세로 이동/ })).toHaveLength(3);
    expect(screen.getByText(/그 밖에 2경기가 더 있어요/)).toBeInTheDocument();
  });

  /* ── R5: 빈 상태가 요구하는 두 번째 조건 — 기록 공개 동의 ────────────────────
   * 빈 상태는 신원 연동 **과** 기록 공개 동의를 함께 요구하는데 위 배너는 앞쪽만
   * 안내했다. 게다가 서버 목록이 이미 연결된 대진을 빼므로, 리그에서 가장 흔한 조합인
   * "연동은 끝났고 동의만 안 켠 사람"에게는 배너 자체가 뜨지 않아 **순위를 막고 있는
   * 당사자가 아무 안내도 못 받았다.** 아래 테스트들은 그 길이 열리되, 열려선 안 되는
   * 사람(구경꾼·이미 동의한 사람·켜도 바뀔 게 없는 사람)에게는 닫혀 있는지를 본다.
   * ────────────────────────────────────────────────────────────────────────── */
  it('연동을 마치고 동의만 남은 참가자에게 기록 공개 설정으로 가는 길을 준다', async () => {
    saveStoredV1Session({ userId: 'me' });
    useV1AuthMeMock.mockReturnValue({ data: { id: 'me' } } as never);
    mockLeague({ goals: [], assists: [], hiddenByEligibility: true });
    // 연결할 대진 0건 — 팀장이 라인업을 저장하며 내 자리는 이미 전부 연결됐다.
    mockClaimableFixtures([]);
    mockMyTeams([LEAGUE_TEAM_ID]);
    mockRecordConsent(NEVER_ASKED);

    const { container } = render(<LeagueMatchStandingsClient leagueId="league-1" />);

    expect(await screen.findByText(CONSENT_CARD_TITLE)).toBeInTheDocument();
    // 연동 카드는 뜨지 않는다 — 이 사람에게 남은 일은 동의뿐이다.
    expect(screen.queryByText('이 리그에서 뛰었는데 내 기록이 없나요?')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /기록 공개 설정 열기/ })).toHaveAttribute(
      'href',
      '/my/settings/record-consent',
    );
    // 켜면 무엇이 달라지는지를 숫자로 말한다 — "설정에 가 보세요"로 끝내지 않는다.
    expect(screen.getByText(/경기 3건의 기록이 공개돼요/)).toBeInTheDocument();
    // Wave 5 — 인라인 마크업 대신 공용 EmptyState(illustration)를 쓴다.
    expect(queryImageBySrc(container, '/illustrations/auth-welcome-640.webp')).not.toBeNull();
  });

  it('연결할 대진과 동의가 모두 남았으면 두 안내를 함께 보여준다', async () => {
    saveStoredV1Session({ userId: 'me' });
    useV1AuthMeMock.mockReturnValue({ data: { id: 'me' } } as never);
    mockLeague({ goals: [], assists: [], hiddenByEligibility: true });
    mockClaimableFixtures(oneFixture);
    mockMyTeams([LEAGUE_TEAM_ID]);
    mockRecordConsent({ ...NEVER_ASKED, pendingRecordCount: 2 });

    render(<LeagueMatchStandingsClient leagueId="league-1" />);

    expect(await screen.findByText('이 리그에서 뛰었는데 내 기록이 없나요?')).toBeInTheDocument();
    expect(screen.getByText(CONSENT_CARD_TITLE)).toBeInTheDocument();
  });

  it('이미 동의한 사람에게는 동의 안내를 띄우지 않는다', async () => {
    saveStoredV1Session({ userId: 'me' });
    useV1AuthMeMock.mockReturnValue({ data: { id: 'me' } } as never);
    mockLeague({ goals: [], assists: [], hiddenByEligibility: true });
    mockClaimableFixtures([]);
    mockMyTeams([LEAGUE_TEAM_ID]);
    mockRecordConsent({ granted: true, hasResponded: true, pendingRecordCount: 0 });

    render(<LeagueMatchStandingsClient leagueId="league-1" />);

    expect(
      await screen.findByText('득점 기록은 있지만, 선수가 신원 연동과 경기 기록 공개에 동의하면 순위가 공개돼요.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(CONSENT_CARD_TITLE)).not.toBeInTheDocument();
  });

  // 켜도 공개될 게 없는 사람에게 권하면, 켜고 나서 화면이 그대로라 신뢰만 잃는다.
  it('동의를 켜도 공개될 기록이 없으면 동의 안내를 띄우지 않는다', async () => {
    saveStoredV1Session({ userId: 'me' });
    useV1AuthMeMock.mockReturnValue({ data: { id: 'me' } } as never);
    mockLeague({ goals: [], assists: [], hiddenByEligibility: true });
    mockClaimableFixtures([]);
    mockMyTeams([LEAGUE_TEAM_ID]);
    mockRecordConsent({ ...NEVER_ASKED, pendingRecordCount: 0 });

    render(<LeagueMatchStandingsClient leagueId="league-1" />);

    expect(
      await screen.findByText('득점 기록은 있지만, 선수가 신원 연동과 경기 기록 공개에 동의하면 순위가 공개돼요.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(CONSENT_CARD_TITLE)).not.toBeInTheDocument();
  });

  // 다른 데(대회·다른 리그)에 가려진 기록이 있다고 해서, 구경만 하는 리그에서 동의를
  // 권할 이유는 없다 — 이 화면의 빈 순위는 그 사람 탓이 아니다.
  it('이 리그 참가자가 아니면 동의 안내를 띄우지 않는다', async () => {
    saveStoredV1Session({ userId: 'me' });
    useV1AuthMeMock.mockReturnValue({ data: { id: 'me' } } as never);
    mockLeague({ goals: [], assists: [], hiddenByEligibility: true });
    mockClaimableFixtures([]);
    mockMyTeams(['t9']);
    mockRecordConsent({ ...NEVER_ASKED, pendingRecordCount: 5 });

    render(<LeagueMatchStandingsClient leagueId="league-1" />);

    expect(
      await screen.findByText('득점 기록은 있지만, 선수가 신원 연동과 경기 기록 공개에 동의하면 순위가 공개돼요.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(CONSENT_CARD_TITLE)).not.toBeInTheDocument();
  });

  it('순위가 공개 자격과 무관하게 비어 있으면, "내 팀" 캐시가 이미 있어도 동의 안내를 띄우지 않는다', async () => {
    saveStoredV1Session({ userId: 'me' });
    useV1AuthMeMock.mockReturnValue({ data: { id: 'me' } } as never);
    // 아직 확정된 결과가 없어서 빈 순위 — 동의는 이 상태의 처방이 아니다.
    mockLeague({ goals: [], assists: [], hiddenByEligibility: false });
    mockClaimableFixtures([]);
    mockMyTeamsFromWarmCache([LEAGUE_TEAM_ID]);
    mockRecordConsent(NEVER_ASKED);

    render(<LeagueMatchStandingsClient leagueId="league-1" />);

    expect(await screen.findByText('확정된 경기 결과가 쌓이면 득점 순위가 나타나요.')).toBeInTheDocument();
    expect(screen.queryByText(CONSENT_CARD_TITLE)).not.toBeInTheDocument();
  });

  // 연동 목록도 같은 함정이 있다 — `enabled` 는 요청을 막을 뿐 렌더를 막지 않으므로,
  // 로그아웃 직후 캐시가 남아 있으면 관전자 화면에 남의 대진 목록이 그대로 뜬다.
  it('비로그인 관전자는 연동 목록 캐시가 남아 있어도 배너를 보지 않는다', async () => {
    mockLeague({ goals: [], assists: [], hiddenByEligibility: true });
    // enabled 를 무시하는 mock = 로그아웃 직전 세션이 남긴 캐시.
    useV1LeagueClaimableFixturesMock.mockReturnValue({
      data: { leagueId: 'league-1', fixtures: oneFixture },
    } as never);
    mockMyTeams([]);
    mockRecordConsent(undefined);

    render(<LeagueMatchStandingsClient leagueId="league-1" />);

    expect(
      await screen.findByText('득점 기록은 있지만, 선수가 신원 연동과 경기 기록 공개에 동의하면 순위가 공개돼요.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('이 리그에서 뛰었는데 내 기록이 없나요?')).not.toBeInTheDocument();
  });

  it('비로그인 관전자는 "내 팀" 캐시가 남아 있어도 동의 안내를 보지 않는다', async () => {
    // 세션 힌트 없음(로그아웃 직후) + 이전 세션이 남긴 캐시.
    mockLeague({ goals: [], assists: [], hiddenByEligibility: true });
    mockClaimableFixtures([]);
    mockMyTeamsFromWarmCache([LEAGUE_TEAM_ID]);
    mockRecordConsent(NEVER_ASKED);

    render(<LeagueMatchStandingsClient leagueId="league-1" />);

    expect(
      await screen.findByText('득점 기록은 있지만, 선수가 신원 연동과 경기 기록 공개에 동의하면 순위가 공개돼요.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(CONSENT_CARD_TITLE)).not.toBeInTheDocument();
  });

  it('비로그인 관전자에게는 동의 안내도, 참가 여부 조회도 하지 않는다', async () => {
    // 세션 힌트 없음. 서버가 무엇을 준다 해도 두 카드 모두 뜨지 않아야 한다 —
    // mockMyTeams 가 enabled 를 지키므로 카드 부재가 곧 조회 부재다.
    mockLeague({ goals: [], assists: [], hiddenByEligibility: true });
    mockClaimableFixtures(oneFixture);
    mockMyTeams([LEAGUE_TEAM_ID]);
    mockRecordConsent(NEVER_ASKED);

    render(<LeagueMatchStandingsClient leagueId="league-1" />);

    expect(
      await screen.findByText('득점 기록은 있지만, 선수가 신원 연동과 경기 기록 공개에 동의하면 순위가 공개돼요.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('이 리그에서 뛰었는데 내 기록이 없나요?')).not.toBeInTheDocument();
    expect(screen.queryByText(CONSENT_CARD_TITLE)).not.toBeInTheDocument();
  });

  /* ── R6: 한 번 거부한 사람 · 공개 화면의 조회 비용 ─────────────────────────
   * 위 안내들이 "필요한 사람에게만" 열리는지에 더해, 두 가지를 더 못박는다.
   * ① 기록 공개를 **의식적으로 끈** 사람에게 같은 권유를 다시 하지 않는다 — 홈 넛지가
   *    이미 세운 규칙이고, 리그는 참가 리그 수만큼 이 화면이 있어 반복이 더 심하다.
   * ② 이 화면은 비로그인도 열리는 **공개 순위표**라, 안내 하나를 위해 무거운 조회를
   *    붙이면 안 된다.
   * ────────────────────────────────────────────────────────────────────── */
  it('기록 공개를 스스로 껐던 사람에게는 동의 안내를 다시 띄우지 않는다', async () => {
    saveStoredV1Session({ userId: 'me' });
    useV1AuthMeMock.mockReturnValue({ data: { id: 'me' } } as never);
    mockLeague({ goals: [], assists: [], hiddenByEligibility: true });
    mockClaimableFixtures([]);
    mockMyTeams([LEAGUE_TEAM_ID]);
    // 설정에서 직접 껐다(REVOKED). 서버는 껐어도 "지금 켜면 공개될 경기 수"를 계속
    // 내려주므로, 그 숫자만 보고 띄우면 이 사람은 리그를 열 때마다 같은 권유를 받는다.
    mockRecordConsent({ granted: false, hasResponded: true, pendingRecordCount: 3 });

    render(<LeagueMatchStandingsClient leagueId="league-1" />);

    expect(
      await screen.findByText('득점 기록은 있지만, 선수가 신원 연동과 경기 기록 공개에 동의하면 순위가 공개돼요.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(CONSENT_CARD_TITLE)).not.toBeInTheDocument();
  });

  it('참가자 판정에 순위표의 참가팀을 쓴다 — 공개 화면에서 "내 리그"를 조회하지 않는다', async () => {
    saveStoredV1Session({ userId: 'me' });
    useV1AuthMeMock.mockReturnValue({ data: { id: 'me' } } as never);
    mockLeague({ goals: [], assists: [], hiddenByEligibility: true });
    mockClaimableFixtures([]);
    mockMyTeams([LEAGUE_TEAM_ID]);
    mockRecordConsent(NEVER_ASKED);

    render(<LeagueMatchStandingsClient leagueId="league-1" />);

    // 참가자로 인정돼 안내는 그대로 뜬다.
    expect(await screen.findByText(CONSENT_CARD_TITLE)).toBeInTheDocument();
    // 그러면서도 `/league-matches/me` 는 건드리지 않는다. 이 조회는 내가 속한 리그마다
    // 순위표를 통째로 계산해서 돌려주는데(listMine → 리그별 standings), 여기서 필요한 건
    // "내 팀이 이 리그에 있나" 하나뿐이다.
    expect(useV1MyLeaguesMock).not.toHaveBeenCalled();
  });
});
