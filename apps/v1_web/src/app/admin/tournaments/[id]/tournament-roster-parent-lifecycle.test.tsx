import { transferableAbortController } from 'node:util';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createV1QueryClient } from '@/lib/query-client';
import { v1Keys } from '@/lib/query-keys';
import type {
  V1AdminMe, V1AdminTournamentPlayer, V1AdminTournamentRegistration,
  V1AdminTournamentRosterResponse, V1Tournament,
} from '@/types/api';
import { TournamentAdminShell } from './tournament-admin-shell';
import AdminTournamentRegistrationsPage from './registrations/page';

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/tournaments/tournament-parent-lifecycle/registrations',
}));

const tournament: V1Tournament = {
  id: 'tournament-parent-lifecycle', sportId: 'sport-futsal', title: '부모 오류 명단 대회',
  status: 'open', format: 'knockout', isPublic: true,
  registrationDeadlineAt: null, rosterDeadlineAt: null, bracketPublishedAt: null,
  bracketPublishScheduledAt: null, scheduledAt: null, scheduledEndAt: null, venue: null,
  latitude: null, longitude: null, coverImageUrl: null, teamCount: 8, minPlayers: 1, maxPlayers: 20,
  competitionConfigVersionId: null, lineupMaxPlayers: null, lineupMinPlayers: null,
  lineupSizeOptions: [], substitutionMode: null, maxSubstitutions: null,
  substitutionModeOptions: ['limited', 'rolling'], genderCategory: null,
  genderMinMale: null, genderMaxMale: null, genderMinFemale: null, genderMaxFemale: null,
  minMatchesPerTeam: null, entryFee: 0, prizePool: null, prizeSummary: null, prizeBreakdown: null,
  promoHomeEnabled: false, promoHomeTitle: null, promoHomeSubtitle: null, promoHomeImageUrl: null,
  promoHomeBadgeText: null, promoHomeDateText: null, promoHomeTeamsText: null,
  promoHomeLocationText: null, promoHomePrizeText: null, promoHomePriority: 0,
  promoListEnabled: false, promoListTitle: null, promoListSubtitle: null, promoListImageUrl: null,
  promoListBadgeText: null, promoListDateText: null, promoListTeamsText: null,
  promoListLocationText: null, promoListPrizeText: null, promoListPriority: 0,
  bankName: null, bankAccount: null, bankHolder: null, yellowAccumulationLimit: null,
  redCardSuspensionMatches: null, rulesText: null, refundPolicyText: null, registrationCount: 1,
  operationCounts: { registrations: 1, fixtures: 0, announcements: 0 },
  createdAt: '2026-10-13T00:00:00Z', updatedAt: '2026-10-13T00:00:00Z',
};

const registration: V1AdminTournamentRegistration = {
  id: 'registration-parent-lifecycle', tournamentId: tournament.id, teamId: 'team-parent-lifecycle',
  teamName: '부모 오류 명단 팀', appliedByUserId: 'captain', status: 'confirmed', depositorName: null,
  agreedRules: true, agreedPrivacy: true, agreedRefund: true, agreedMediaConsent: true,
  confirmedAt: '2026-10-13T00:00:00Z', rosterLockedAt: null, rosterDeadlineOverrideAt: null,
  cancelRequestedAt: null, cancelReason: null, adminCancelReason: null, cancelOutcome: null,
  playerCount: 1, payment: null, confirmedByAdminUserId: 'admin',
  createdAt: '2026-10-13T00:00:00Z', updatedAt: '2026-10-13T00:00:00Z',
};

const adminMe: V1AdminMe = {
  userId: 'admin', adminUserId: 'admin-support', adminRole: 'support', status: 'active',
  capabilities: [], lastActiveAt: null,
};

function roster(nickname: string | null): V1AdminTournamentRosterResponse {
  const player: V1AdminTournamentPlayer = {
    id: 'player-parent-lifecycle', userId: 'member', realName: '홍길동', nickname,
    jerseyNumber: 7, goalkeeper: false, birthDateSnapshot: '1995-03-15', genderSnapshot: 'male',
    eligibilityStatus: 'needs_review', eligibilityNote: null,
    addedAt: '2026-10-13T00:00:00Z', removedAt: null, phone: null, isTeamCaptain: false,
  };
  return {
    registrationId: registration.id, teamId: registration.teamId, teamName: registration.teamName ?? '',
    rosterLockedAt: null, belowMinimum: false, players: [player],
  };
}

function success(data: unknown) {
  return HttpResponse.json({ status: 'success', data, timestamp: '2026-10-13T00:00:00Z' });
}

function deferredResponse() {
  let resolveResponse: ((response: Response) => void) | undefined;
  const promise = new Promise<Response>((resolve) => { resolveResponse = resolve; });
  return {
    promise,
    resolve(response: Response) {
      if (!resolveResponse) throw new Error('응답 대기 초기화에 실패했어요.');
      resolveResponse(response);
    },
  };
}

const server = setupServer();
const clients: QueryClient[] = [];
let tournamentUnavailable: boolean;
let tournamentFailures: number;
let currentNickname: string | null;
let rosterRequests: Request[];

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  server.resetHandlers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
beforeEach(() => {
  // MSW의 Node Request에는 jsdom 대신 Node 호환 AbortSignal을 전달해요.
  vi.stubGlobal('AbortController', function NativeAbortController() {
    return transferableAbortController();
  });
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1');
  tournamentUnavailable = false;
  tournamentFailures = 0;
  currentNickname = '처음 조회 닉네임';
  rosterRequests = [];
  server.use(
    http.post('*/api/v1/logs/client-error', () => new HttpResponse(null, { status: 204 })),
    http.get('http://localhost/api/v1/admin/me', () => success(adminMe)),
    http.get(`http://localhost/api/v1/admin/tournaments/${tournament.id}`, () => {
      if (tournamentUnavailable) {
        tournamentFailures += 1;
        return HttpResponse.json({
          status: 'error', statusCode: 503, code: 'TOURNAMENT_UNAVAILABLE',
          message: '대회 정보를 다시 조회하지 못했어요.',
        }, { status: 503 });
      }
      return success(tournament);
    }),
    http.get(`http://localhost/api/v1/tournament-ops/tournaments/${tournament.id}/staff`, () => success({ items: [] })),
    http.get(`http://localhost/api/v1/admin/tournaments/${tournament.id}/registrations`, () =>
      success({ items: [registration], pageInfo: { hasNext: false, nextCursor: null } })),
    http.get(`http://localhost/api/v1/admin/registrations/${registration.id}/players`, ({ request }) => {
      rosterRequests.push(request);
      return success(roster(currentNickname));
    }),
  );
});

async function openRoster(user: ReturnType<typeof userEvent.setup>) {
  const card = (await screen.findByText(registration.teamName ?? '')).closest('li');
  if (!card) throw new Error('실제 신청 카드가 없어요.');
  await user.click(within(card).getByRole('button', { name: '명단 검토' }));
  return screen.findByRole('dialog', { name: `명단 검토 — ${registration.teamName}` });
}

describe('MD-QA #140 실제 대회 셸의 오류·재시도와 명단 요청 수명', () => {
  it.each([
    { cached: false, phase: '최초 조회', nickname: '재시도 이후 현재 닉네임', expected: '닉네임 재시도 이후 현재 닉네임' },
    { cached: true, phase: '성공 캐시 재조회', nickname: null, expected: '닉네임 미등록' },
  ])('$phase 중 부모 GET이 실패해 탭이 제거되면 복구 후 이전 명단 응답을 쓰지 않아요', async ({ cached, nickname, expected }) => {
    // Given: 실제 route child와 셸이 하나의 production QueryClient를 공유해요.
    const user = userEvent.setup();
    const client = createV1QueryClient();
    clients.push(client);
    render(
      <QueryClientProvider client={client}>
        <TournamentAdminShell id={tournament.id}><AdminTournamentRegistrationsPage /></TournamentAdminShell>
      </QueryClientProvider>,
    );
    if (cached) {
      const firstDialog = await openRoster(user);
      expect(await within(firstDialog).findByText('닉네임 처음 조회 닉네임')).toBeInTheDocument();
      await waitFor(() => expect(client.isFetching()).toBe(0));
      await user.click(within(firstDialog).getByRole('button', { name: '모달 닫기' }));
    }

    const held = deferredResponse();
    const oldSnapshot = success(roster('부모 오류 전 스냅샷 닉네임'));
    let heldRequest: Request | undefined;
    server.use(http.get(`http://localhost/api/v1/admin/registrations/${registration.id}/players`, ({ request }) => {
      rosterRequests.push(request);
      if (!heldRequest) {
        heldRequest = request;
        return held.promise.then((response) => response.clone());
      }
      return success(roster(currentNickname));
    }));

    try {
      await openRoster(user);
      await waitFor(() => expect(rosterRequests).toHaveLength(cached ? 2 : 1));
      expect(client.isFetching({ queryKey: v1Keys.adminTournamentRoster(registration.id), exact: true })).toBe(1);

      // When: 실제 부모 재조회가 마지막 503까지 실패해 자식을 제거하고, UI 재시도로 돌아와요.
      tournamentUnavailable = true;
      await act(async () => { await client.refetchQueries({ queryKey: v1Keys.adminTournament(tournament.id), exact: true }); });
      expect(await screen.findByText('대회 정보를 다시 조회하지 못했어요.')).toBeInTheDocument();
      expect(tournamentFailures).toBe(2);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '명단 검토' })).not.toBeInTheDocument();
      expect(client.getQueryData(v1Keys.adminTournament(tournament.id))).toEqual(tournament);

      tournamentUnavailable = false;
      currentNickname = nickname;
      await user.click(screen.getByRole('button', { name: '다시 시도하기' }));
      const recoveredDialog = await openRoster(user);
      held.resolve(oldSnapshot);
      await waitFor(() => expect(client.isFetching()).toBe(0));

      // Then: 복구된 실제 DOM과 동일한 query cache에는 새 프로필만 남아요.
      expect(await within(recoveredDialog).findByText(expected)).toBeInTheDocument();
      expect(within(recoveredDialog).queryByText('닉네임 부모 오류 전 스냅샷 닉네임')).not.toBeInTheDocument();
      expect(within(recoveredDialog).queryByText('닉네임 처음 조회 닉네임')).not.toBeInTheDocument();
      expect(client.getQueryData<V1AdminTournamentRosterResponse>(v1Keys.adminTournamentRoster(registration.id))?.players[0]?.nickname).toBe(nickname);
      expect(rosterRequests).toHaveLength(cached ? 3 : 2);
      expect(within(recoveredDialog).getByRole('combobox', { name: '홍길동 자격 상태' })).toBeDisabled();
    } finally {
      held.resolve(oldSnapshot);
    }
  }, 20_000);
});
