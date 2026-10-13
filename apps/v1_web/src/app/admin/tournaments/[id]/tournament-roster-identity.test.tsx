import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { StrictMode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createV1QueryClient } from '@/lib/query-client';
import { v1Keys } from '@/lib/query-keys';
import type {
  V1AdminTournamentPlayer,
  V1AdminTournamentRegistration,
  V1AdminTournamentRosterResponse,
} from '@/types/api';
import { RegistrationsTab, RosterModal } from './registrations-tab';

const registration: V1AdminTournamentRegistration = {
  id: 'registration-identity', tournamentId: 'tournament-identity', teamId: 'team-identity',
  teamName: '명단 팀', appliedByUserId: 'captain', status: 'confirmed', depositorName: null,
  agreedRules: true, agreedPrivacy: true, agreedRefund: true, agreedMediaConsent: true,
  confirmedAt: '2026-10-13T00:00:00Z', rosterLockedAt: null, rosterDeadlineOverrideAt: null,
  cancelRequestedAt: null, cancelReason: null, adminCancelReason: null, cancelOutcome: null,
  playerCount: 2, payment: null, confirmedByAdminUserId: 'admin',
  createdAt: '2026-10-13T00:00:00Z', updatedAt: '2026-10-13T00:00:00Z',
};

const otherRegistration: V1AdminTournamentRegistration = {
  ...registration,
  id: 'registration-other-identity',
  teamId: 'team-other-identity',
  teamName: '다른 명단 팀',
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
let otherPlayers: V1AdminTournamentPlayer[];
let rosterStatus: number;
let rosterRequests: string[];
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

function openRegistrationTab() {
  const client = createV1QueryClient();
  clients.push(client);
  render(
    <QueryClientProvider client={client}>
      <RegistrationsTab tournamentId={registration.tournamentId} showToast={() => undefined} canWrite={false} />
    </QueryClientProvider>,
  );
  return client;
}

async function reviewTeam(user: ReturnType<typeof userEvent.setup>, teamName = registration.teamName) {
  const card = (await screen.findByText(teamName ?? '')).closest('li');
  if (!card) throw new Error('실제 신청 카드가 없어요.');
  await user.click(within(card).getByRole('button', { name: '명단 검토' }));
  return screen.findByRole('dialog', { name: `명단 검토 — ${teamName}` });
}

async function closeRoster(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: '모달 닫기' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
}

function deferredResponse() {
  let resolve: (response: HttpResponse) => void = () => {
    throw new Error('보류한 명단 응답이 준비되지 않았어요.');
  };
  const promise = new Promise<HttpResponse>((complete) => { resolve = complete; });
  return { promise, resolve };
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  server.resetHandlers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1');
  players = [player(), player({ id: 'player-captain', userId: 'captain', realName: '김팀장', nickname: '푸른 주장', jerseyNumber: 7, isTeamCaptain: true })];
  otherPlayers = [player({ id: 'other-player', userId: 'other-member', realName: '이두번째', nickname: '다른 팀 선수' })];
  rosterStatus = 200;
  rosterRequests = [];
  eligibilityRequests = [];
  removedPlayers = [];
  eligibleRequests = 0;
  server.use(
    http.post('*/api/v1/logs/client-error', () => new HttpResponse(null, { status: 204 })),
    http.get('http://localhost/api/v1/admin/tournaments/:tournamentId/registrations', ({ params }) => {
      expect(params.tournamentId).toBe(registration.tournamentId);
      return success({ items: [registration, otherRegistration], pageInfo: { hasNext: false, nextCursor: null } });
    }),
    http.get('http://localhost/api/v1/admin/registrations/:registrationId/players', ({ params }) => {
      const registrationId = String(params.registrationId);
      rosterRequests.push(registrationId);
      const selected = registrationId === registration.id ? registration : otherRegistration;
      expect(registrationId).toBe(selected.id);
      if (rosterStatus === 403) {
        return HttpResponse.json({ status: 'error', statusCode: 403, code: 'ADMIN_REQUIRED', message: '명단 조회 권한이 없어요.' }, { status: 403 });
      }
      if (rosterStatus === 503) {
        return HttpResponse.json({ status: 'error', statusCode: 503, code: 'ROSTER_UNAVAILABLE', message: '명단을 다시 조회하지 못했어요.' }, { status: 503 });
      }
      const data: V1AdminTournamentRosterResponse = {
        registrationId: selected.id, teamId: selected.teamId, teamName: selected.teamName ?? '',
        rosterLockedAt: null, belowMinimum: false,
        players: registrationId === registration.id ? players : otherPlayers,
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

describe('MD-QA #140 실제 신청 탭에서 명단을 다시 열 때 현재 프로필 재조회', () => {
  it.each([
    { nickname: '변경한 현재 닉네임', expected: '닉네임 변경한 현재 닉네임' },
    { nickname: null, expected: '닉네임 미등록' },
  ])('닫힌 동안 nickname=$nickname 응답으로 바뀌면 같은 명단을 다시 열어 최신 값을 보여요', async ({ nickname, expected }) => {
    const user = userEvent.setup();
    const client = openRegistrationTab();
    const firstDialog = await reviewTeam(user);
    expect(await within(firstDialog).findByText('닉네임 번개 선수')).toBeInTheDocument();
    await waitFor(() => expect(client.isFetching()).toBe(0));
    expect(rosterRequests).toEqual([registration.id]);
    await closeRoster(user);
    players = [player({ nickname })];

    const reopened = await reviewTeam(user);
    await waitFor(() => expect(rosterRequests).toEqual([registration.id, registration.id]));
    expect(await within(reopened).findByText(expected)).toBeInTheDocument();
    expect(within(reopened).queryByText('닉네임 번개 선수')).not.toBeInTheDocument();
    expect(within(reopened).getByText('홍길동')).toBeInTheDocument();
    expect(within(reopened).getByRole('combobox', { name: '홍길동 자격 상태' })).toBeDisabled();
    expect(eligibilityRequests).toEqual([]);
    expect(removedPlayers).toEqual([]);
  });

  it.each([
    { status: 503, message: '명단을 다시 조회하지 못했어요.' },
    { status: 403, message: '명단 조회 권한이 없어요.' },
  ])('캐시가 남아 있어도 재열기 GET의 $status 실패를 실제 오류로 알리고 개인정보 행을 숨겨요', async ({ status, message }) => {
    const user = userEvent.setup();
    const client = openRegistrationTab();
    const firstDialog = await reviewTeam(user);
    expect(await within(firstDialog).findByText('닉네임 번개 선수')).toBeInTheDocument();
    await waitFor(() => expect(client.isFetching()).toBe(0));
    await closeRoster(user);
    rosterStatus = status;

    const reopened = await reviewTeam(user);
    await waitFor(() => expect(rosterRequests).toEqual([registration.id, registration.id]));
    expect(await within(reopened).findByRole('alert')).toHaveTextContent(message);
    expect(within(reopened).queryByText('홍길동')).not.toBeInTheDocument();
    expect(within(reopened).queryByText('닉네임 번개 선수')).not.toBeInTheDocument();
    expect(client.getQueryData<V1AdminTournamentRosterResponse>(v1Keys.adminTournamentRoster(registration.id))?.players[0]?.nickname).toBe('번개 선수');
    expect(eligibilityRequests).toEqual([]);
    expect(removedPlayers).toEqual([]);

    rosterStatus = 200;
    players = [player({ nickname: null })];
    await user.click(within(reopened).getByRole('button', { name: '다시 시도' }));
    expect(await within(reopened).findByText('닉네임 미등록')).toBeInTheDocument();
    expect(within(reopened).queryByRole('alert')).not.toBeInTheDocument();
    expect(rosterRequests).toEqual([registration.id, registration.id, registration.id]);
  });

  it('명단을 열기 전에는 조회하지 않고 한 번 연 명단의 읽기 권한·초기 조회를 유지해요', async () => {
    const user = userEvent.setup();
    const client = openRegistrationTab();
    await screen.findByText(registration.teamName ?? '');
    await waitFor(() => expect(client.isFetching()).toBe(0));
    expect(rosterRequests).toEqual([]);
    const dialog = await reviewTeam(user);
    expect(await within(dialog).findByText('닉네임 번개 선수')).toBeInTheDocument();
    await waitFor(() => expect(client.isFetching()).toBe(0));
    expect(rosterRequests).toEqual([registration.id]);
    expect(within(dialog).getByRole('button', { name: '홍길동 선수를 명단에서 제외' })).toBeDisabled();
    expect(eligibleRequests).toBe(0);
    await closeRoster(user);
    expect(screen.queryByText('닉네임 번개 선수')).not.toBeInTheDocument();
    expect(rosterRequests).toEqual([registration.id]);
  });

  it('등록 A를 닫고 B를 열 때 다른 등록의 개인정보와 수정 대상이 섞이지 않아요', async () => {
    const user = userEvent.setup();
    const client = openRegistrationTab();
    const firstDialog = await reviewTeam(user);
    expect(await within(firstDialog).findByText('닉네임 번개 선수')).toBeInTheDocument();
    await waitFor(() => expect(client.isFetching()).toBe(0));
    await closeRoster(user);

    const secondDialog = await reviewTeam(user, otherRegistration.teamName);
    expect(await within(secondDialog).findByText('닉네임 다른 팀 선수')).toBeInTheDocument();
    expect(within(secondDialog).getByText('이두번째')).toBeInTheDocument();
    expect(within(secondDialog).queryByText('홍길동')).not.toBeInTheDocument();
    expect(within(secondDialog).queryByText('닉네임 번개 선수')).not.toBeInTheDocument();
    expect(within(secondDialog).getByRole('button', { name: '이두번째 선수를 명단에서 제외' })).toBeDisabled();
    expect(rosterRequests).toEqual([registration.id, otherRegistration.id]);
    expect(eligibilityRequests).toEqual([]);
    expect(removedPlayers).toEqual([]);
  });

  it('등록 A의 보류한 응답이 B를 연 뒤 도착해도 현재 B 명단을 덮어쓰지 않아요', async () => {
    const held = deferredResponse();
    server.use(http.get(`http://localhost/api/v1/admin/registrations/${registration.id}/players`, () => {
      rosterRequests.push(registration.id);
      return held.promise.then((response) => response.clone());
    }));
    const user = userEvent.setup();
    const client = openRegistrationTab();
    await reviewTeam(user);
    await waitFor(() => expect(rosterRequests).toEqual([registration.id]));
    await closeRoster(user);

    const secondDialog = await reviewTeam(user, otherRegistration.teamName);
    expect(await within(secondDialog).findByText('닉네임 다른 팀 선수')).toBeInTheDocument();
    held.resolve(success({
      registrationId: registration.id, teamId: registration.teamId, teamName: registration.teamName ?? '',
      rosterLockedAt: null, belowMinimum: false, players: [player({ nickname: '늦게 도착한 A 닉네임' })],
    } satisfies V1AdminTournamentRosterResponse));
    await waitFor(() => expect(client.isFetching()).toBe(0));
    expect(within(secondDialog).getByText('닉네임 다른 팀 선수')).toBeInTheDocument();
    expect(within(secondDialog).queryByText('닉네임 늦게 도착한 A 닉네임')).not.toBeInTheDocument();
    expect(within(secondDialog).queryByText('홍길동')).not.toBeInTheDocument();
    expect(rosterRequests).toEqual([registration.id, otherRegistration.id]);
  });

  it('등록 A→B→A로 되돌아와도 60초 캐시의 옛 닉네임 대신 A의 현재 값을 조회해요', async () => {
    const user = userEvent.setup();
    const client = openRegistrationTab();
    const firstDialog = await reviewTeam(user);
    expect(await within(firstDialog).findByText('닉네임 번개 선수')).toBeInTheDocument();
    await waitFor(() => expect(client.isFetching()).toBe(0));
    await closeRoster(user);
    const secondDialog = await reviewTeam(user, otherRegistration.teamName);
    expect(await within(secondDialog).findByText('닉네임 다른 팀 선수')).toBeInTheDocument();
    await waitFor(() => expect(client.isFetching()).toBe(0));
    await closeRoster(user);
    players = [player({ nickname: '돌아온 A의 현재 닉네임' })];

    const returnedDialog = await reviewTeam(user);
    await waitFor(() => expect(rosterRequests).toEqual([registration.id, otherRegistration.id, registration.id]));
    expect(await within(returnedDialog).findByText('닉네임 돌아온 A의 현재 닉네임')).toBeInTheDocument();
    expect(within(returnedDialog).queryByText('닉네임 번개 선수')).not.toBeInTheDocument();
    expect(within(returnedDialog).queryByText('이두번째')).not.toBeInTheDocument();
  });

  it('60초 캐시가 만료된 명단을 재열 때 자동 재조회와 열림 재조회가 한 GET으로 합쳐져요', async () => {
    const user = userEvent.setup();
    const client = openRegistrationTab();
    const firstDialog = await reviewTeam(user);
    expect(await within(firstDialog).findByText('닉네임 번개 선수')).toBeInTheDocument();
    await waitFor(() => expect(client.isFetching()).toBe(0));
    await closeRoster(user);

    const held = deferredResponse();
    server.use(http.get(`http://localhost/api/v1/admin/registrations/${registration.id}/players`, () => {
      rosterRequests.push(registration.id);
      return held.promise.then((response) => response.clone());
    }));
    const expiredNow = Date.now() + 61_000;
    vi.spyOn(Date, 'now').mockReturnValue(expiredNow);
    const reopened = await reviewTeam(user);
    await waitFor(() => expect(rosterRequests.length).toBeGreaterThan(1));
    held.resolve(success({
      registrationId: registration.id, teamId: registration.teamId, teamName: registration.teamName ?? '',
      rosterLockedAt: null, belowMinimum: false, players: [player({ nickname: '만료 후 현재 닉네임' })],
    } satisfies V1AdminTournamentRosterResponse));
    expect(await within(reopened).findByText('닉네임 만료 후 현재 닉네임')).toBeInTheDocument();
    await waitFor(() => expect(client.isFetching()).toBe(0));
    expect(rosterRequests).toEqual([registration.id, registration.id]);
  });

  it('실제 조회 캐시가 있는 모달의 StrictMode effect 재실행도 같은 진행 중 GET을 기다려요', async () => {
    const user = userEvent.setup();
    const client = openRegistrationTab();
    const firstDialog = await reviewTeam(user);
    expect(await within(firstDialog).findByText('닉네임 번개 선수')).toBeInTheDocument();
    await waitFor(() => expect(client.isFetching()).toBe(0));
    cleanup();

    const held = deferredResponse();
    server.use(http.get(`http://localhost/api/v1/admin/registrations/${registration.id}/players`, () => {
      rosterRequests.push(registration.id);
      return held.promise.then((response) => response.clone());
    }));
    render(
      <StrictMode>
        <QueryClientProvider client={client}>
          <RosterModal open onClose={() => undefined} registration={registration} showToast={() => undefined} canWrite={false} />
        </QueryClientProvider>
      </StrictMode>,
    );
    await waitFor(() => expect(rosterRequests.length).toBeGreaterThan(1));
    held.resolve(success({
      registrationId: registration.id, teamId: registration.teamId, teamName: registration.teamName ?? '',
      rosterLockedAt: null, belowMinimum: false, players: [player({ nickname: 'StrictMode 현재 닉네임' })],
    } satisfies V1AdminTournamentRosterResponse));
    expect(await screen.findByText('닉네임 StrictMode 현재 닉네임')).toBeInTheDocument();
    await waitFor(() => expect(client.isFetching()).toBe(0));
    expect(rosterRequests).toEqual([registration.id, registration.id]);
  });
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
