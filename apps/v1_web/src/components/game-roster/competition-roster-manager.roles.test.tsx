import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
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

const { teamId, tournamentId, registrationId, games } = GAME_ROSTER_MSW;
let roster: ReturnType<typeof createV1GameRosterMswHandlers>;
let server: ReturnType<typeof setupServer>;
let role: 'owner' | 'manager' | 'member' | 'none';
let participantReads: number;
const ok = (data: unknown) => HttpResponse.json({ status: 'success', data });

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1');
  role = 'owner';
  participantReads = 0;
  roster = createV1GameRosterMswHandlers();
  server = setupServer(...roster.handlers,
    http.get('*/api/v1/tournaments/:id', () => ok({
      id: tournamentId, title: '역할 확인 대회', kind: 'regular_tournament', status: 'in_progress',
      minPlayers: 1, maxPlayers: null, registrationDeadlineAt: null, rosterDeadlineAt: null,
    })),
    http.get('*/api/v1/tournaments/:id/registrations/:registrationId', () => ok({
      id: registrationId, tournamentId, teamId, status: 'confirmed',
      rosterLockedAt: null, rosterDeadlineOverrideAt: null,
    })),
    http.get('*/api/v1/teams/:id', () => ok({ teamId, name: '이게팀이야', viewer: { role } })),
    http.get('*/api/v1/teams/:id/upcoming-games', () => role === 'none'
      ? HttpResponse.json({ message: '팀원만 볼 수 있어요.' }, { status: 403 })
      : ok({ items: games.map(game => ({ gameId: game.gameId, tournamentId, scheduledAt: game.startAt })) })),
    http.get('*/api/v1/tournaments/:id/registrations/:registrationId/players', () => {
      participantReads++;
      return role === 'none'
        ? HttpResponse.json({ message: '팀원만 볼 수 있어요.' }, { status: 403 })
        : ok({ belowMinimum: false, players: roster.readRoster().base.map(player => ({
          id: player.participantId, userId: player.userId, nickname: player.displayName,
          displayName: player.displayName, jerseyNumber: player.jerseyNumber,
          goalkeeper: player.goalkeeper, eligibilityStatus: 'non_pro', personalInfoVisible: false,
        })) });
    }),
    http.post('*/api/v1/logs/client-error', () => new HttpResponse(null, { status: 204 })),
  );
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => { server.close(); vi.unstubAllEnvs(); });

function open() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>
    <CompetitionRosterManager teamId={teamId} gameId={games[0].gameId} />
  </QueryClientProvider>);
}

describe('MD-QA157 실제 명단 소비자의 역할별 참가 선수 진입', () => {
  it.each(['owner', 'manager'] as const)('%s는 관리 CTA로 참가 선수 편집 화면에 들어간다', async managerRole => {
    // Given: 팀 역할과 경기 명단 응답이 모두 관리 권한을 확인한다.
    role = managerRole;
    open();
    const entry = await screen.findByRole('button', { name: '선수 추가·번호·GK 관리' });
    // When: 경기 출전 목록에서 참가 선수로 이동한다.
    fireEvent.click(entry);
    // Then: 실제 참가 명단 HTTP 응답을 읽고 기존 편집 조작을 제공한다.
    expect(await screen.findByRole('button', { name: '김민재 GK 지정' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '선수 추가' })).toBeEnabled();
    expect(screen.queryByRole('link', { name: '신청 관리로 이동' })).not.toBeInTheDocument();
  });

  it('읽기 전용 팀원은 참가 선수 보기로 이동하고 편집 조작을 받지 않는다', async () => {
    // Given: 서버가 팀원에게 읽기 전용 명단과 조회용 신청 ID를 내려준다.
    role = 'member'; roster.setViewerRole('TEAM_MEMBER');
    open();
    expect(await screen.findByRole('checkbox', { name: '김민재 이번 경기 출전' })).toBeDisabled();
    // When: 참가 선수 보기로 이동한다.
    fireEvent.click(screen.getByRole('button', { name: '참가 선수 보기' }));
    // Then: 명단은 읽을 수 있고 관리 CTA나 편집 조작은 없다.
    expect(await screen.findByText('참가 선수 3명')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '선수 추가' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '김민재 GK 지정' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '선수 추가·번호·GK 관리' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '신청 관리로 이동' })).not.toBeInTheDocument();
  });

  it.each([
    ['TOURNAMENT', '/admin/tournaments/tournament-1/registrations'],
    ['LEAGUE', '/admin/league-matches/tournament-1/registrations'],
  ] as const)('팀원이 아닌 플랫폼 운영진은 %s의 실제 admin 신청 관리로 안내받는다', async (kind, href) => {
    // Given: 플랫폼 운영진에게는 팀 전용 참가 신청 ID를 제공하지 않는다.
    role = 'none'; roster.setViewerRole('ADMIN'); roster.setCompetitionKind(kind);
    open();
    await screen.findByRole('checkbox', { name: '김민재 이번 경기 출전' });
    // When: 참가 선수 탭으로 이동한다.
    fireEvent.click(screen.getByRole('tab', { name: '참가 선수' }));
    // Then: 기존 admin shell의 신청 관리 진입을 주고 팀원 API 인가를 넓히지 않는다.
    expect(await screen.findByRole('link', { name: '신청 관리로 이동' })).toHaveAttribute('href', href);
    expect(screen.queryByText(/팀장에게 문의/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '선수 추가' })).not.toBeInTheDocument();
    expect(participantReads).toBe(0);
  });

  it('보기 전용 플랫폼 운영진도 관리 대신 참가 선수 보기를 받는다', async () => {
    // Given: 지원 운영 계정은 경기 명단도 읽기 전용이다.
    role = 'none'; roster.setViewerRole('ADMIN'); roster.setCanWrite(false);
    open();
    expect(await screen.findByRole('checkbox', { name: '김민재 이번 경기 출전' })).toBeDisabled();
    // When: 참가 선수 보기로 이동한다.
    fireEvent.click(screen.getByRole('button', { name: '참가 선수 보기' }));
    // Then: admin 신청 관리 진입만 제공하고 팀 편집을 열지 않는다.
    expect(await screen.findByRole('link', { name: '신청 관리로 이동' })).toHaveAttribute('href', '/admin/tournaments/tournament-1/registrations');
    expect(screen.queryByRole('button', { name: '선수 추가·번호·GK 관리' })).not.toBeInTheDocument();
    expect(participantReads).toBe(0);
  });

  it('참가 명단이 없는 일반 팀원에게 admin 진입을 노출하지 않는다', async () => {
    // Given: 팀원 전체를 사용하는 리그여서 조회할 참가 신청 ID도 없다.
    role = 'member'; roster.setViewerRole('TEAM_MEMBER'); roster.useTeamMembersFallback();
    open();
    await screen.findByRole('checkbox', { name: '김민재 이번 경기 출전' });
    // When: 참가 선수 탭으로 이동한다.
    fireEvent.click(screen.getByRole('tab', { name: '참가 선수' }));
    // Then: 실제 미등록 안내를 유지하고 플랫폼 운영 권한을 가장하지 않는다.
    expect(await screen.findByText(/등록된 참가 명단이 없거나/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '신청 관리로 이동' })).not.toBeInTheDocument();
    expect(participantReads).toBe(0);
  });

  it('경기 명단 조회 실패는 운영진 진입으로 덮지 않고 실제 오류와 재시도를 남긴다', async () => {
    // Given: 최초 명단 HTTP 요청이 실패한다.
    role = 'none'; roster.setViewerRole('ADMIN');
    server.use(http.get('*/api/v1/teams/:teamId/games/:gameId/roster', () => HttpResponse.json({ message: '명단 서버 점검 중이에요.' }, { status: 503 })));
    // When: 경기 명단 화면을 연다.
    open();
    // Then: 실패 사유와 재시도를 보이고 가짜 참가 선수 화면을 열지 않는다.
    expect(await screen.findByText('명단 서버 점검 중이에요.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다시 시도하기' })).toBeEnabled();
    expect(screen.queryByRole('link', { name: '신청 관리로 이동' })).not.toBeInTheDocument();
    expect(participantReads).toBe(0);
  });
});
