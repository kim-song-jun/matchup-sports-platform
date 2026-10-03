import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveRouteChrome } from '@/lib/route-chrome';
import { TournamentRosterPageClient } from './tournament-roster-client';

const state = vi.hoisted(() => ({
  tournament: { id: 'competition-1', title: '합성 QA 정규 리그', kind: 'regular_league', status: 'in_progress',
    registrationDeadlineAt: null, rosterDeadlineAt: null, minPlayers: 6, maxPlayers: 10,
    scheduledAt: '2099-01-01T00:00:00.000Z', scheduledEndAt: '2099-12-31T00:00:00.000Z' },
  registration: { id: 'registration-c', tournamentId: 'competition-1', teamId: 'team-c',
    teamName: null, status: 'confirmed', rosterLockedAt: null as string | null, rosterDeadlineOverrideAt: null },
  team: { teamId: 'team-c', name: '합성 QA C팀', viewer: { role: 'owner' } },
  teamPending: false, teamError: false, teamPlaceholder: false,
  rosterLoading: false, rosterError: false,
  refetchTeam: vi.fn(), refetchRoster: vi.fn(), teamHook: vi.fn(), mutate: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams({ from: '/my/leagues' }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
vi.mock('@/hooks/use-v1-api', () => ({
  useV1Tournament: () => ({ data: state.tournament }),
  useV1Registration: () => ({ data: state.registration }),
  useV1TeamDetail: (id: string) => {
    state.teamHook(id);
    return { data: state.team, isPending: state.teamPending, isError: state.teamError,
      isPlaceholderData: state.teamPlaceholder, refetch: state.refetchTeam };
  },
  useV1TournamentPlayers: () => ({
    data: { players: [], belowMinimum: false }, isLoading: state.rosterLoading,
    isError: state.rosterError, error: new Error('합성 명단 조회 실패'), refetch: state.refetchRoster,
  }),
  useV1AddPlayer: () => ({ mutateAsync: state.mutate, isPending: false }),
  useV1UpdatePlayer: () => ({ mutateAsync: state.mutate, isPending: false }),
  useV1UpdatePlayerJersey: () => ({ mutateAsync: state.mutate, isPending: false }),
  useV1RemovePlayer: () => ({ mutateAsync: state.mutate, isPending: false }),
}));

function client(registrationId = 'registration-c', tournamentId = 'competition-1') {
  return <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <TournamentRosterPageClient tournamentId={tournamentId} registrationId={registrationId} />
  </QueryClientProvider>;
}
beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(state.tournament, { id: 'competition-1', title: '합성 QA 정규 리그',
    kind: 'regular_league', status: 'in_progress' });
  Object.assign(state.registration, { id: 'registration-c', tournamentId: 'competition-1',
    teamId: 'team-c', status: 'confirmed', rosterLockedAt: null });
  Object.assign(state.team, { teamId: 'team-c', name: '합성 QA C팀', viewer: { role: 'owner' } });
  Object.assign(state, { teamPending: false, teamError: false, teamPlaceholder: false,
    rosterLoading: false, rosterError: false });
});

// 실제 roster client와 기간/상태 Card를 사용한다. query hooks는 경계 fixture이며
// 실명/명단 쓰기 API나 실제 alpha 화면/반응형 픽셀 검증을 실행하지 않는다.
describe('#1549 참가 명단의 선택 팀·대회/리그 문맥', () => {
  it.each(['regular_league', 'regular_tournament'])('%s의 실제 이름과 기존 기간·인원·Back을 유지한다', (kind) => {
    state.tournament.kind = kind;
    state.tournament.status = kind === 'regular_league' ? 'in_progress' : 'open';
    render(client());
    const context = screen.getByRole('group', { name: '명단 대상' });
    expect(within(context).getByText('합성 QA C팀')).toBeInTheDocument();
    expect(within(context).getByText(`${kind === 'regular_league' ? '리그' : '대회'} · 합성 QA 정규 리그`)).toBeInTheDocument();
    expect(state.teamHook).toHaveBeenCalledWith('team-c');
    expect(screen.getByText(kind === 'regular_league' ? '리그 기간' : '대회 신청 마감')).toBeInTheDocument();
    expect(screen.getByText('최소 6명 · 최대 10명')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '선수 추가' })).toBeInTheDocument();
    const back = new URL(screen.getByRole('link', { name: /내 신청으로 돌아가기/ }).getAttribute('href')!, 'https://example.test');
    expect(back.pathname).toBe('/tournaments/competition-1/my');
    expect(back.searchParams.get('reg')).toBe('registration-c');
    expect(back.searchParams.get('from')).toBe('/my/leagues');
    expect(state.mutate).not.toHaveBeenCalled();
  });

  it('B/C 등록 전환 중 이전 이름은 숨기고 현재 등록의 이름만 표시한다', () => {
    state.registration.id = 'registration-b'; state.registration.teamId = 'team-b';
    state.team.teamId = 'team-b'; state.team.name = '합성 QA B팀';
    const { rerender } = render(client('registration-b'));
    expect(screen.getByRole('group', { name: '명단 대상' })).toHaveTextContent('합성 QA B팀');
    rerender(client('registration-c'));
    expect(screen.queryByRole('group', { name: '명단 대상' })).not.toBeInTheDocument();
    state.registration.id = 'registration-c'; state.registration.teamId = 'team-c';
    rerender(client('registration-c'));
    expect(screen.queryByText('합성 QA B팀')).not.toBeInTheDocument();
    state.team.teamId = 'team-c'; state.team.name = '합성 QA C팀';
    rerender(client('registration-c'));
    expect(screen.getByRole('group', { name: '명단 대상' })).toHaveTextContent('합성 QA C팀');
    expect(screen.queryByText('합성 QA B팀')).not.toBeInTheDocument();
  });

  it.each(['tournament', 'registration-tournament', 'team'])('%s ID가 현재 등록과 다르면 이름을 섞지 않는다', (mismatch) => {
    if (mismatch === 'tournament') state.tournament.id = 'other-competition';
    if (mismatch === 'registration-tournament') state.registration.tournamentId = 'other-competition';
    if (mismatch === 'team') state.team.teamId = 'other-team';
    render(client());
    expect(screen.queryByRole('group', { name: '명단 대상' })).not.toBeInTheDocument();
  });

  it.each(['teamPending', 'teamPlaceholder'] as const)('%s 중 cached 이름과 편집 제어를 노출하지 않는다', (flag) => {
    state[flag] = true;
    render(client());
    expect(screen.queryByRole('group', { name: '명단 대상' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '선수 추가' })).not.toBeInTheDocument();
    expect(screen.queryByText('팀장 또는 매니저에게 요청')).not.toBeInTheDocument();
  });

  it('팀 조회 오류는 기존 실제 실패와 재시도를 유지한다', () => {
    state.teamError = true;
    render(client());
    expect(screen.queryByRole('group', { name: '명단 대상' })).not.toBeInTheDocument();
    expect(screen.getByText(/팀 정보를 불러오지 못해 수정 권한/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(state.refetchTeam).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: '선수 추가' })).not.toBeInTheDocument();
  });

  it.each(['owner', 'manager', 'member'])('%s는 문맥을 읽되 기존 편집 역할 계약을 유지한다', (role) => {
    state.team.viewer.role = role;
    render(client());
    expect(screen.getByRole('group', { name: '명단 대상' })).toHaveTextContent('합성 QA C팀');
    expect(Boolean(screen.queryByRole('button', { name: '선수 추가' }))).toBe(role !== 'member');
  });

  it.each(['completed', 'locked', 'cancelled'])('%s 명단의 문맥은 유지하고 추가 차단을 유지한다', (reason) => {
    if (reason === 'completed') state.tournament.status = 'completed';
    if (reason === 'locked') state.registration.rosterLockedAt = '2026-10-01T00:00:00.000Z';
    if (reason === 'cancelled') state.registration.status = 'cancelled';
    render(client());
    expect(screen.getByRole('group', { name: '명단 대상' })).toHaveTextContent('합성 QA C팀');
    expect(screen.queryByRole('button', { name: '선수 추가' })).not.toBeInTheDocument();
  });

  it('명단 초기 로딩은 기존 skeleton과 busy 상태만 보여준다', () => {
    state.rosterLoading = true;
    render(client());
    expect(screen.getByLabelText('명단 불러오는 중')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByRole('group', { name: '명단 대상' })).not.toBeInTheDocument();
  });

  it('명단 오류는 실제 오류·재시도를 유지하고 이름으로 성공을 꾸미지 않는다', () => {
    state.rosterError = true;
    render(client());
    expect(screen.getByRole('alert')).toHaveTextContent('합성 명단 조회 실패');
    expect(screen.queryByRole('group', { name: '명단 대상' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다시 시도하기' }));
    expect(state.refetchRoster).toHaveBeenCalledOnce();
  });

  it('긴 이름 전체를 wrap하며 셸 제목/본문 heading을 추가하지 않는다', () => {
    state.team.name = '매우긴팀이름'.repeat(40);
    state.tournament.title = '매우긴리그이름'.repeat(40);
    render(client());
    const contexts = screen.getAllByRole('group', { name: '명단 대상' });
    expect(contexts).toHaveLength(1);
    expect(contexts[0]).toHaveStyle({ overflowWrap: 'anywhere' });
    expect(within(contexts[0]).getByText(state.team.name)).toBeInTheDocument();
    expect(within(contexts[0]).getByText(`리그 · ${state.tournament.title}`)).toBeInTheDocument();
    expect(contexts[0].querySelector('h1,h2')).toBeNull();
    expect(resolveRouteChrome('/tournaments/competition-1/registrations/registration-c/roster')?.chrome.title).toBe('선수 명단');
  });
});
