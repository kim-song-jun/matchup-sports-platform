import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MyMatchesPageClient } from './my-matches-client';

const navigation = vi.hoisted(() => ({ search: '' }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/my/matches/created',
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

const platformRecruitment = {
  teamMatchId: 'platform-match',
  title: '플랫폼 풋살 모집',
  sportName: '풋살',
  startsAt: '2026-10-20T10:00:00Z',
  status: 'recruiting',
  relation: 'created_by_me',
  teamId: null,
  teamName: null,
  applicationId: null,
  league: null,
  detailRoute: '/team-matches/platform-match',
  manageRoute: null,
};
let teamFails = true;
let teamHasItem = true;
let personalHasItem = false;
let personalRequests = 0;
let teamRequests = 0;
const clients: QueryClient[] = [];
const pageInfo = { nextCursor: null, hasNext: false };
const server = setupServer(
  http.get('*/api/v1/me/matches', ({ request }) => {
    personalRequests += 1;
    const query = new URL(request.url).searchParams;
    if (query.get('mode') !== 'created' || query.get('limit') !== '50') {
      return new HttpResponse(null, { status: 400 });
    }
    return HttpResponse.json({ status: 'success', data: {
      items: personalHasItem ? [{
        id: 'personal-match', title: '개인 풋살 모집', startsAt: '2026-10-20T10:00:00Z', status: 'recruiting', viewerState: 'host',
      }] : [],
      pageInfo,
    } });
  }),
  http.get('*/api/v1/me/team-matches', ({ request }) => {
    teamRequests += 1;
    const query = new URL(request.url).searchParams;
    if (query.get('scope') !== 'created' || query.get('limit') !== '50') {
      return new HttpResponse(null, { status: 400 });
    }
    if (teamFails) {
      return HttpResponse.json({
        status: 'error', statusCode: 409, code: 'TEAM_MATCH_OPERATIONAL_DATA_INVALID',
        message: '팀 매치의 호스트 팀 또는 경기 시작 시간이 없습니다.', details: null,
      }, { status: 409 });
    }
    return HttpResponse.json({ status: 'success', data: { items: teamHasItem ? [platformRecruitment] : [], pageInfo } });
  }),
  http.post('*/api/v1/logs/client-error', () => new HttpResponse(null, { status: 204 })),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1');
  navigation.search = '';
  teamFails = true;
  teamHasItem = true;
  personalHasItem = false;
  personalRequests = 0;
  teamRequests = 0;
});
afterEach(() => {
  cleanup();
  for (const client of clients) client.clear();
  clients.length = 0;
  server.resetHandlers();
  vi.unstubAllEnvs();
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}><MyMatchesPageClient mode="created" /></QueryClientProvider>);
}

describe('생성한 매치 — 실제 조회 훅과 HTTP 오류·회복', () => {
  it('개인 목록이 0건이어도 팀 조회가 실패하면 전체가 비었다고 안내하지 않는다', async () => {
    // Given personal succeeds empty while the actual team endpoint returns an integrity error.
    // When the creator opens the combined list.
    renderPage();
    // Then the partial failure is visible without a false empty-list conclusion.
    expect(await screen.findByText(/팀 매치 목록을 불러오지 못했어요/)).toBeInTheDocument();
    expect(screen.queryByText('만든 매치가 없어요')).not.toBeInTheDocument();
  });

  it('부분 오류의 재시도는 팀 목록만 다시 조회하고 호스트 없는 생성 이력을 보여준다', async () => {
    // Given the failed combined list and a recovered backend.
    renderPage();
    await screen.findByText(/팀 매치 목록을 불러오지 못했어요/);
    teamFails = false;
    // When the user retries the failed source through the page.
    fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' }));
    // Then the response renders through the real query, with a valid detail link and no invented manage action.
    expect(await screen.findByText(platformRecruitment.title)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '상세' })).toHaveAttribute('href', '/team-matches/platform-match?from=%2Fmy%2Fmatches%2Fcreated');
    expect(screen.queryByRole('link', { name: '팀매치 관리' })).not.toBeInTheDocument();
    expect(screen.queryByText(/목록을 불러오지 못했어요/)).not.toBeInTheDocument();
    expect({ personalRequests, teamRequests }).toEqual({ personalRequests: 1, teamRequests: 2 });
  });

  it('팀 전용 목록의 오류를 재시도하면 실제 팀 이력으로 회복한다', async () => {
    // Given the team-only filter and the server integrity failure.
    navigation.search = 'type=team';
    renderPage();
    await screen.findByText('매치 목록을 불러오지 못했어요');
    expect(screen.queryByText('만든 팀 매치가 없어요')).not.toBeInTheDocument();
    teamFails = false;
    // When the user retries.
    fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' }));
    // Then the failed HTTP source recovers without requesting the disabled personal source.
    expect(await screen.findByText(platformRecruitment.title)).toBeInTheDocument();
    expect({ personalRequests, teamRequests }).toEqual({ personalRequests: 0, teamRequests: 2 });
  });

  it('일부 개인 이력이 있으면 팀 조회 실패 중에도 실제 이력을 유지한다', async () => {
    // Given an existing personal item and a failed team source.
    personalHasItem = true;
    // When the combined list loads.
    renderPage();
    // Then the loaded source stays usable alongside the partial failure.
    expect(await screen.findByText(/팀 매치 목록을 불러오지 못했어요/)).toBeInTheDocument();
    expect(screen.getByText('개인 풋살 모집')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '상세' })).toHaveAttribute('href', '/matches/personal-match?from=%2Fmy%2Fmatches%2Fcreated');
  });

  it('개인 전용 필터는 실패한 팀 소스를 요청하지 않고 정상 빈 상태를 보여준다', async () => {
    // Given the personal-only filter with no created personal matches.
    navigation.search = 'type=personal';
    // When the list loads.
    renderPage();
    // Then the successfully empty source displays its own empty state.
    expect(await screen.findByText('만든 개인 매치가 없어요')).toBeInTheDocument();
    expect({ personalRequests, teamRequests }).toEqual({ personalRequests: 1, teamRequests: 0 });
  });

  it('전체 소스가 정상 0건이면 기존 전체 빈 상태를 보여준다', async () => {
    // Given both endpoints succeed with empty pages.
    teamFails = false;
    teamHasItem = false;
    // When the creator opens the combined list.
    renderPage();
    // Then a complete empty result may be stated as empty.
    expect(await screen.findByText('만든 매치가 없어요')).toBeInTheDocument();
    await waitFor(() => expect({ personalRequests, teamRequests }).toEqual({ personalRequests: 1, teamRequests: 1 }));
  });
});
