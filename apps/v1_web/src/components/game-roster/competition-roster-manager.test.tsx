import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createV1GameRosterMswHandlers, GAME_ROSTER_MSW } from '@/test/msw/game-roster-handlers';
import { CompetitionRosterManager } from './competition-roster-manager';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/teams/team-1/games/roster-game-1/roster',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));
const { teamId, tournamentId, registrationId, games, players } = GAME_ROSTER_MSW;
let mock: ReturnType<typeof createV1GameRosterMswHandlers>;
let server: ReturnType<typeof setupServer>;
let kind: 'regular_league' | 'regular_tournament';
let role: 'owner' | 'member';
let locked: boolean;
const ok = (data: unknown) => HttpResponse.json({ status: 'success', data });
beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1');
  mock = createV1GameRosterMswHandlers(); kind = 'regular_league'; role = 'owner'; locked = false;
  mock.setCompetitionKind('LEAGUE');
  server = setupServer(...mock.handlers,
    http.get('*/api/v1/tournaments/:id', () => ok({ id: tournamentId, title: '수요일 리그', kind, status: 'in_progress',
      minPlayers: 1, maxPlayers: null, registrationDeadlineAt: null, rosterDeadlineAt: null,
      scheduledAt: '2099-01-01T00:00:00Z', scheduledEndAt: '2099-12-31T00:00:00Z' })),
    http.get('*/api/v1/tournaments/:id/registrations/:reg', () => ok({ id: registrationId, tournamentId, teamId,
      status: 'confirmed', rosterLockedAt: locked ? '2026-10-01T00:00:00Z' : null, rosterDeadlineOverrideAt: null })),
    http.get('*/api/v1/teams/:id', () => ok({ teamId, name: '이게팀이야', viewer: { role } })),
    http.get('*/api/v1/teams/:id/upcoming-games', () => ok({ items: games.map(g => ({
      gameId: g.gameId, tournamentId, scheduledAt: g.startAt, opponentName: g.opponentName,
    })) })),
    http.get('*/api/v1/tournaments/:id/registrations/:reg/players', () => ok({ belowMinimum: false,
      players: mock.readRoster().base.map(p => ({ id: p.participantId, userId: p.userId,
        displayName: p.displayName, nickname: p.displayName, jerseyNumber: p.jerseyNumber, goalkeeper: p.goalkeeper,
        realName: role === 'owner' ? '등록 실명' : null, personalInfoVisible: role === 'owner',
        birthDateSnapshot: role === 'owner' ? '2000-01-01' : null, eligibilityStatus: 'non_pro' })) })),
    http.patch('*/api/v1/tournaments/:id/registrations/:reg/players/:player/roster-settings', async ({ params, request }) => {
      if (locked) return HttpResponse.json({ message: '선수 명단이 마감됐어요.', code: 'ROSTER_LOCKED' }, { status: 409 });
      const p = players.find(p => p.participantId === params.player)!;
      const body = await request.json() as { jerseyNumber?: number | null; goalkeeper?: boolean };
      if (body.jerseyNumber !== undefined) mock.setJersey(p.userId, body.jerseyNumber);
      if (body.goalkeeper !== undefined) mock.setGoalkeeper(p.userId, body.goalkeeper);
      return ok({ id: p.participantId, ...body });
    }),
    http.post('*/api/v1/logs/client-error', () => new HttpResponse(null, { status: 204 })),
  ); server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => { server.close(); vi.unstubAllEnvs(); });
function open(entry: 'match' | 'registration' = 'match') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{entry === 'match'
    ? <CompetitionRosterManager teamId={teamId} gameId={games[0].gameId} />
    : <CompetitionRosterManager competitionId={tournamentId} registrationId={registrationId} />}</QueryClientProvider>);
}
const tab = (name: string) => screen.getByRole('tab', { name });
const checkbox = (name = '김민재') => screen.getByRole('checkbox', { name: `${name} 이번 경기 출전` });

describe('공통 명단 관리의 실제 탭·저장 흐름', () => {
  it.each(['match','registration'] as const)('%s 진입은 같은 두 탭을 사용하고 기본 탭만 다르다', async entry => {
    open(entry);
    await screen.findByRole('tab', { name: '참가 선수' });
    expect(tab(entry === 'match' ? '경기 출전' : '참가 선수')).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(tab(entry === 'match' ? '참가 선수' : '경기 출전'));
    await waitFor(() => expect(tab(entry === 'match' ? '참가 선수' : '경기 출전')).toHaveAttribute('aria-selected', 'true'));
  });
  it('출전 제외를 저장하고 참가 탭으로 이동한 뒤 돌아와도 선택 경기와 제외가 남는다', async () => {
    open(); await screen.findByRole('checkbox', { name: '김민재 이번 경기 출전' });
    fireEvent.click(checkbox()); fireEvent.click(tab('참가 선수'));
    const dialog = await screen.findByRole('dialog', { name: '변경사항을 저장할까요?' });
    fireEvent.click(within(dialog).getByRole('button', { name: '저장하고 이동' }));
    await screen.findByText('참가 선수 3명');
    expect(mock.readRoster().excluded.map(p => p.userId)).toEqual(['player-1']);
    fireEvent.click(tab('경기 출전'));
    await waitFor(() => expect(checkbox()).not.toBeChecked());
    expect(screen.getByLabelText('출전을 관리할 경기')).toHaveValue(games[0].gameId);
    expect(screen.queryByRole('button', { name: /골키퍼로 지정/ })).not.toBeInTheDocument();
  });
  it('번호 0·GK 공통 설정을 저장하면 다른 경기에도 보이며 제외 상태와는 독립적이다', async () => {
    open('registration');
    fireEvent.click(await screen.findByRole('button', { name: '김민재 등번호 7번 바꾸기' }));
    fireEvent.change(screen.getByLabelText('등번호'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: '적용' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: '김민재 GK 지정' }));
    fireEvent.click(screen.getByRole('button', { name: '변경사항 저장' }));
    await screen.findByText('참가 선수의 공통 설정을 저장했어요.');
    expect(mock.readRoster(games[1].gameId).participants[0]).toMatchObject({ jerseyNumber: 0, goalkeeper: true });
    fireEvent.click(tab('경기 출전'));
    await screen.findByRole('checkbox', { name: '김민재 이번 경기 출전' });
    await screen.findByRole('option', { name: /강남 유나이티드/ });
    fireEvent.change(screen.getByLabelText('출전을 관리할 경기'), { target: { value: games[1].gameId } });
    await waitFor(() => expect(screen.getByLabelText('출전을 관리할 경기')).toHaveValue(games[1].gameId));
    expect(await screen.findByRole('checkbox', { name: '김민재 이번 경기 출전' })).toBeChecked();
    expect(screen.queryByRole('button', { name: /등번호.*바꾸기/ })).not.toBeInTheDocument();
  });
  it('저장 실패 시 이동하지 않고 초안과 오류를 남긴다', async () => {
    server.use(http.post('*/api/v1/teams/:id/game-rosters/batch', () => HttpResponse.json({ message: '저장 실패' }, { status: 503 })));
    open(); await screen.findByRole('checkbox', { name: '김민재 이번 경기 출전' });
    fireEvent.click(checkbox()); fireEvent.click(tab('참가 선수'));
    fireEvent.click(await screen.findByRole('button', { name: '저장하고 이동' }));
    await screen.findByText('저장 실패');
    expect(tab('경기 출전')).toHaveAttribute('aria-selected', 'true');
    expect(checkbox()).not.toBeChecked();
    expect(mock.readRoster().excluded).toHaveLength(0);
  });
  it('변경을 버리고 경기를 전환하면 다른 경기에는 적용되지 않는다', async () => {
    open(); await screen.findByRole('checkbox', { name: '김민재 이번 경기 출전' });
    await screen.findByRole('option', { name: /강남 유나이티드/ });
    fireEvent.click(checkbox());
    fireEvent.change(screen.getByLabelText('출전을 관리할 경기'), { target: { value: games[1].gameId } });
    fireEvent.click(await screen.findByRole('button', { name: '저장하지 않고 이동' }));
    await waitFor(() => expect(screen.getByLabelText('출전을 관리할 경기')).toHaveValue(games[1].gameId));
    expect(await screen.findByRole('checkbox', { name: '김민재 이번 경기 출전' })).toBeChecked(); expect(mock.readRoster().excluded).toHaveLength(0);
  });
  it('경기가 시작돼도 참가 탭은 미래 경기용으로 열리고 그 경기 체크는 잠긴다', async () => {
    mock.setGameState(games[0].gameId, 'LIVE');
    open(); await screen.findByRole('checkbox', { name: '김민재 이번 경기 출전' });
    expect(checkbox()).toBeDisabled();
    fireEvent.click(tab('참가 선수'));
    expect(await screen.findByRole('button', { name: '김민재 GK 지정' })).toBeEnabled();
  });
  it('참가 설정 저장 실패는 초안을 유지하고 다른 탭으로 이동하지 않는다', async () => {
    open('registration');
    fireEvent.click(await screen.findByRole('button', { name: '김민재 GK 지정' }));
    locked = true;
    fireEvent.click(tab('경기 출전'));
    fireEvent.click(await screen.findByRole('button', { name: '저장하고 이동' }));
    await screen.findByText('선수 명단이 마감됐어요.');
    expect(tab('참가 선수')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: '김민재 GK 지정' })).toHaveAttribute('aria-pressed', 'true');
    expect(mock.readRoster().participants[0].goalkeeper).toBe(false);
  });
  it('두 선수의 등번호를 맞바꿔도 한 번에 저장된다', async () => {
    // 서버처럼 지금 다른 선수가 단 번호면 409 를 준다.
    server.use(http.patch('*/api/v1/tournaments/:id/registrations/:reg/players/:player/roster-settings', async ({ params, request }) => {
      const p = players.find(p => p.participantId === params.player)!;
      const body = await request.json() as { jerseyNumber?: number | null };
      if (body.jerseyNumber != null && mock.readRoster().base.some(other => other.userId !== p.userId && other.jerseyNumber === body.jerseyNumber)) {
        return HttpResponse.json({ message: '이미 사용 중인 등번호예요.', code: 'ROSTER_DUPLICATE_JERSEY_NUMBER' }, { status: 409 });
      }
      if (body.jerseyNumber !== undefined) mock.setJersey(p.userId, body.jerseyNumber);
      return ok({ id: p.participantId, ...body });
    }));
    open('registration');
    const setNumber = async (button: string, value: string) => {
      fireEvent.click(await screen.findByRole('button', { name: button }));
      fireEvent.change(screen.getByLabelText('등번호'), { target: { value } });
      fireEvent.click(screen.getByRole('button', { name: '적용' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    };
    await setNumber('김민재 등번호 7번 바꾸기', '');
    await setNumber('박서준 등번호 10번 바꾸기', '7');
    await setNumber('김민재 등번호 넣기', '10');
    fireEvent.click(screen.getByRole('button', { name: '변경사항 저장' }));
    await screen.findByText('참가 선수의 공통 설정을 저장했어요.');
    expect(mock.readRoster().base.map(p => [p.userId, p.jerseyNumber])).toEqual(expect.arrayContaining([['player-1', 10], ['player-2', 7]]));
  });
  it('일부 선수 저장 뒤 실패하면 성공한 인원과 남은 초안을 구분해 재시도한다', async () => {
    let failing = true;
    server.use(http.patch('*/api/v1/tournaments/:id/registrations/:reg/players/:player/roster-settings', ({ params }) => {
      if (params.player === players[1].participantId && failing) return HttpResponse.json({ message: '일시 저장 실패' }, { status: 503 });
    }));
    open('registration');
    fireEvent.click(await screen.findByRole('button', { name: '김민재 GK 지정' }));
    fireEvent.click(screen.getByRole('button', { name: '박서준 GK 지정' }));
    fireEvent.click(screen.getByRole('button', { name: '변경사항 저장' }));
    await screen.findByText('1명은 저장됐어요. 나머지 변경을 다시 저장해 주세요. 일시 저장 실패');
    expect(mock.readRoster().participants.filter(p => p.goalkeeper).map(p => p.userId)).toEqual(['player-1']);
    failing = false;
    fireEvent.click(screen.getByRole('button', { name: '변경사항 저장' }));
    await screen.findByText('참가 선수의 공통 설정을 저장했어요.');
    expect(mock.readRoster(games[1].gameId).participants.filter(p => p.goalkeeper)).toHaveLength(2);
  });
  it('대회 명단 잠금과 일반 팀원의 편집 제한을 유지한다', async () => {
    kind = 'regular_tournament'; role = 'member'; locked = true; mock.setViewerRole('TEAM_MEMBER');
    open('registration'); await screen.findByText('참가 선수 3명');
    expect(screen.queryByRole('button', { name: '김민재 GK 지정' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '선수 추가' })).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: '김민재 선수 정보' }));
    expect(screen.queryByText(/등록 이름/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('선출 여부')).toBeDisabled();
  });
  it('홈·경기에서 들어온 일반 팀원도 참가 명단을 읽고 편집 제어는 받지 않는다', async () => {
    role = 'member'; mock.setViewerRole('TEAM_MEMBER');
    open(); await screen.findByRole('tab', { name: '참가 선수' });
    fireEvent.click(tab('참가 선수'));
    await screen.findByText('참가 선수 3명');
    expect(screen.queryByRole('button', { name: '김민재 GK 지정' })).not.toBeInTheDocument();
    expect(screen.queryByText(/참가 명단 관리 권한이 없어요/)).not.toBeInTheDocument();
  });
});
