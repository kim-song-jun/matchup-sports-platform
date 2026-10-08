import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { toTeamMatch } from '@/components/team-matches/team-matches.card-model';
import { getTeamMatchDetailViewModel } from '@/components/team-matches/team-matches.view-model';
import { clearStoredV1Session } from '@/lib/session-storage';
import type { V1Match, V1TeamMatch } from '@/types/api';
import { SearchExperience } from './search-experience';

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }));

const TEAM_MATCH_ID = 'ad400000-0000-4000-8000-000000000006';
const SEARCH = '서울 나이트';
const DATES = [
  ['2026-10-11T14:57:00.000Z', '10/11 (일) 23:57', '10월 11일 (일)', '23:57'],
  ['2026-10-11T15:02:00.000Z', '10/12 (월) 00:02', '10월 12일 (월)', '00:02'],
  ['2026-10-11T07:57:00-07:00', '10/11 (일) 23:57', '10월 11일 (일)', '23:57'],
  ['2026-10-11T23:57:00+09:00', '10/11 (일) 23:57', '10월 11일 (일)', '23:57'],
] as const;

function match(input: string): V1Match {
  return { id: 'personal-match', matchId: 'personal-match', title: '개인 검색 경기',
    sportName: '풋살', placeName: '합성 경기장', startsAt: input, capacityText: '2/12', status: 'recruiting' };
}
function teamMatch(input: string): V1TeamMatch {
  return { id: TEAM_MATCH_ID, teamMatchId: TEAM_MATCH_ID,
    title: '성수 아틀레틱 검색 경기', hostTeamName: SEARCH,
    sportName: '풋살', placeName: '합성 경기장', startsAt: input, capacityText: '2/12', status: 'recruiting' };
}

let startsAt: string | null | undefined = DATES[0][0];
const requests: URL[] = [];
const clients: QueryClient[] = [];
const ok = (data: unknown) => HttpResponse.json({ status: 'success', data, timestamp: '2026-10-08T00:00:00.000Z' });
const page = (items: unknown[]) => ({ items, pageInfo: { hasNext: false, nextCursor: null } });
const server = setupServer(
  http.get('*/api/v1/matches', ({ request }) => {
    requests.push(new URL(request.url));
    return ok(page([{ ...match(DATES[0][0]), startsAt }]));
  }),
  http.get('*/api/v1/team-matches', ({ request }) => {
    requests.push(new URL(request.url));
    return ok(page([{ ...teamMatch(DATES[0][0]), startsAt }]));
  }),
  http.get('*/api/v1/teams', () => ok(page([]))),
  http.get('*/api/v1/league-matches', () => ok(page([]))),
  http.get('*/api/v1/search/recent', () => ok({ items: [] })),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1');
  clearStoredV1Session();
  startsAt = DATES[0][0];
  requests.length = 0;
  window.history.replaceState({}, '', `/search?q=${encodeURIComponent(SEARCH)}`);
});
afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
  server.resetHandlers();
  clearStoredV1Session();
  vi.unstubAllEnvs();
});

function renderSearch() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}><SearchExperience /></QueryClientProvider>);
}

describe('MD-QA #62 실제 통합 검색 경기 시각', () => {
  it('포맷터를 대체하지 않고 실제 프로세스 시간대를 확인한다', () => {
    const timezone = process.env.TZ;
    expect(['UTC', 'America/Los_Angeles', 'Asia/Seoul']).toContain(timezone);
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(timezone);
    expect(new Date(DATES[0][0]).getHours()).toBe(timezone === 'UTC' ? 14 : timezone === 'Asia/Seoul' ? 23 : 7);
  });

  it.each(DATES)('HTTP %s는 검색·실제 상세 model에서 같은 KST %s를 표시한다', async (input, label, date, time) => {
    startsAt = input;
    renderSearch();
    const personal = await screen.findByRole('button', { name: /개인 검색 경기/ });
    const team = await screen.findByRole('button', { name: /성수 아틀레틱 검색 경기/ });
    expect.soft(personal).toHaveTextContent(label);
    expect.soft(team).toHaveTextContent(label);
    expect(toTeamMatch(teamMatch(input), getTeamMatchDetailViewModel().match)).toMatchObject({ id: TEAM_MATCH_ID, date, time });
    expect(requests).toHaveLength(2);
    for (const request of requests) {
      expect(Object.fromEntries(request.searchParams)).toMatchObject({ query: SEARCH, limit: '5', sort: 'recommended' });
    }
    fireEvent.click(personal);
    fireEvent.click(team);
    const from = encodeURIComponent(`/search?${new URLSearchParams({ q: SEARCH })}`);
    expect(router.push).toHaveBeenNthCalledWith(1, `/matches/personal-match?from=${from}`);
    expect(router.push).toHaveBeenNthCalledWith(2, `/team-matches/${TEAM_MATCH_ID}?from=${from}`);
  });

  it.each(['invalid-date', '', null, undefined])('잘못되거나 빠진 HTTP 시각 %s는 기존처럼 날짜 조각만 생략한다', async (input) => {
    // Runtime HTTP can omit a required field; keep the existing consumer policy without forging a typed DTO.
    startsAt = input;
    renderSearch();
    const personal = await screen.findByRole('button', { name: /개인 검색 경기/ });
    const team = await screen.findByRole('button', { name: /성수 아틀레틱 검색 경기/ });
    expect(within(personal).getByText('풋살 · 합성 경기장 · 2/12')).toBeVisible();
    expect(within(team).getByText('풋살 · 서울 나이트 · 합성 경기장')).toBeVisible();
    expect(personal).not.toHaveTextContent(/Invalid Date|NaN|날짜 미정|null|undefined/);
    expect(team).not.toHaveTextContent(/Invalid Date|NaN|날짜 미정|null|undefined/);
  });
});
