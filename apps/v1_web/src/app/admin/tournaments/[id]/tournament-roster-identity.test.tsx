import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  V1AdminTournamentPlayer,
  V1AdminTournamentRegistration,
  V1AdminTournamentRosterResponse,
} from '@/types/api';
import { RosterModal } from './registrations-tab';

const registration: V1AdminTournamentRegistration = {
  id: 'registration-identity', tournamentId: 'tournament-identity', teamId: 'team-identity',
  teamName: '명단 팀', appliedByUserId: 'captain', status: 'confirmed', depositorName: null,
  agreedRules: true, agreedPrivacy: true, agreedRefund: true, agreedMediaConsent: true,
  confirmedAt: '2026-10-13T00:00:00Z', rosterLockedAt: null, rosterDeadlineOverrideAt: null,
  cancelRequestedAt: null, cancelReason: null, adminCancelReason: null, cancelOutcome: null,
  playerCount: 2, payment: null, confirmedByAdminUserId: 'admin',
  createdAt: '2026-10-13T00:00:00Z', updatedAt: '2026-10-13T00:00:00Z',
};

function player(overrides: Partial<V1AdminTournamentPlayer> = {}): V1AdminTournamentPlayer {
  return {
    id: 'player-member', userId: 'member', realName: '홍길동', nickname: '번개 선수',
    jerseyNumber: 0, birthDateSnapshot: '1995-03-15', genderSnapshot: 'male',
    eligibilityStatus: 'needs_review', eligibilityNote: null,
    addedAt: '2026-10-13T00:00:00Z', removedAt: null, phone: null, isTeamCaptain: false,
    ...overrides,
  };
}

const server = setupServer();
const clients: QueryClient[] = [];
let players: V1AdminTournamentPlayer[];
let rosterStatus: number;
let eligibilityRequests: Array<{ playerId: string; body: unknown }>;
let removedPlayers: string[];
let eligibleRequests: number;

function success(data: unknown) {
  return HttpResponse.json({ status: 'success', data, timestamp: '2026-10-13T00:00:00Z' });
}

function openRoster(canWrite = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  render(
    <QueryClientProvider client={client}>
      <RosterModal open onClose={() => undefined} registration={registration} showToast={() => undefined} canWrite={canWrite} />
    </QueryClientProvider>,
  );
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  server.resetHandlers();
  vi.unstubAllEnvs();
});
beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1');
  players = [player(), player({ id: 'player-captain', userId: 'captain', realName: '김팀장', nickname: '푸른 주장', jerseyNumber: 7, isTeamCaptain: true })];
  rosterStatus = 200;
  eligibilityRequests = [];
  removedPlayers = [];
  eligibleRequests = 0;
  server.use(
    http.post('*/api/v1/logs/client-error', () => new HttpResponse(null, { status: 204 })),
    http.get('http://localhost/api/v1/admin/registrations/:registrationId/players', ({ params }) => {
      expect(params.registrationId).toBe(registration.id);
      if (rosterStatus === 403) {
        return HttpResponse.json({ status: 'error', statusCode: 403, code: 'ADMIN_REQUIRED', message: '명단 조회 권한이 없어요.' }, { status: 403 });
      }
      const data: V1AdminTournamentRosterResponse = {
        registrationId: registration.id, teamId: registration.teamId, teamName: '명단 팀',
        rosterLockedAt: null, belowMinimum: false, players,
      };
      return success(data);
    }),
    http.get('http://localhost/api/v1/admin/registrations/:registrationId/eligible-players', () => {
      eligibleRequests += 1;
      return success({ members: [] });
    }),
    http.patch('http://localhost/api/v1/admin/players/:playerId/eligibility', async ({ params, request }) => {
      eligibilityRequests.push({ playerId: String(params.playerId), body: await request.json() });
      return success(player({ eligibilityStatus: 'pro' }));
    }),
    http.delete('http://localhost/api/v1/admin/players/:playerId', ({ params }) => {
      removedPlayers.push(String(params.playerId));
      return success({ id: params.playerId });
    }),
  );
});

describe('MD-QA #140 관리자 명단 실명·닉네임 A안', () => {
  it('실제 관리자 조회 응답의 두 이름을 같은 선수 행에 표시하며 팀장·등번호와 수정 대상을 유지해요', async () => {
    const user = userEvent.setup();
    openRoster();
    const list = await screen.findByRole('list');
    const rows = within(list).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('김팀장');
    expect(rows[0]).toHaveTextContent('팀장');
    expect(within(rows[0]).getByText('닉네임 푸른 주장')).toBeInTheDocument();
    expect(within(rows[1]).getByText('홍길동')).toBeInTheDocument();
    expect(within(rows[1]).getByText('닉네임 번개 선수')).toBeInTheDocument();
    expect(within(rows[1]).getByLabelText('등번호 0번')).toBeInTheDocument();
    expect(rows[1]).toHaveTextContent('1995-03-15 · 남성');
    await user.selectOptions(within(rows[1]).getByRole('combobox', { name: '홍길동 자격 상태' }), 'pro');
    await waitFor(() => expect(eligibilityRequests).toEqual([{ playerId: 'player-member', body: { eligibilityStatus: 'pro' } }]));
    await user.click(within(rows[1]).getByRole('button', { name: '홍길동 선수를 명단에서 제외' }));
    await waitFor(() => expect(removedPlayers).toEqual(['player-member']));
  });

  it.each([
    { nickname: '홍길동', secondary: '닉네임 홍길동' },
    { nickname: null, secondary: '닉네임 미등록' },
  ])('닉네임 $nickname 응답도 실명과 구별해서 보여요', async ({ nickname, secondary }) => {
    players = [player({ nickname })];
    openRoster();
    const row = within(await screen.findByRole('list')).getByRole('listitem');
    expect(within(row).getByText('홍길동')).toBeInTheDocument();
    expect(within(row).getByText(secondary)).toBeInTheDocument();
  });

  it('긴 한글 실명·닉네임과 HTML 모양 문자열을 온전히 텍스트로 읽을 수 있어요', async () => {
    const realName = '이름이긴한글선수'.repeat(6);
    const nickname = `닉네임이긴한글선수${'가나다라마바사'.repeat(8)}<img src=x onerror=alert(1)>`;
    players = [player({ realName, nickname })];
    openRoster();
    const row = within(await screen.findByRole('list')).getByRole('listitem');
    expect(within(row).getByText(realName)).toBeInTheDocument();
    expect(within(row).getByText(`닉네임 ${nickname}`)).toBeInTheDocument();
    expect(row.querySelector('img')).toBeNull();
  });

  it('읽기 권한만 있는 운영자는 두 이름을 확인하되 선수를 수정하지 못해요', async () => {
    players = [player()];
    openRoster(false);
    const row = within(await screen.findByRole('list')).getByRole('listitem');
    expect(within(row).getByText('홍길동')).toBeInTheDocument();
    expect(within(row).getByText('닉네임 번개 선수')).toBeInTheDocument();
    expect(within(row).getByRole('combobox', { name: '홍길동 자격 상태' })).toBeDisabled();
    expect(within(row).getByRole('button', { name: '홍길동 선수를 명단에서 제외' })).toBeDisabled();
    expect(eligibleRequests).toBe(0);
    expect(eligibilityRequests).toEqual([]);
    expect(removedPlayers).toEqual([]);
  });

  it('관리자 API가 403으로 거부하면 개인정보 명단 대신 실제 권한 오류를 보여요', async () => {
    rosterStatus = 403;
    openRoster(false);
    expect(await screen.findByRole('alert')).toHaveTextContent('명단 조회 권한이 없어요.');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.queryByText('홍길동')).not.toBeInTheDocument();
    expect(screen.queryByText('닉네임 번개 선수')).not.toBeInTheDocument();
  });
});
