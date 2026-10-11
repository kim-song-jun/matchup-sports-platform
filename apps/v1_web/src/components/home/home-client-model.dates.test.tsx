import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearStoredV1Session } from '@/lib/session-storage';
import { toTeamMatch } from '@/components/team-matches/team-matches.card-model';
import { getTeamMatchDetailViewModel } from '@/components/team-matches/team-matches.view-model';
import type { V1Home, V1TeamMatch, V1TournamentListItem } from '@/types/api';
import { toFeaturedLeague, toFeaturedTeamMatch, toHomeModel, withoutHomeContent } from './home-client-model';
import { HomePageView } from './home-page';
import { getHomeViewModel } from './home.view-model';

vi.mock('next/navigation', () => ({
  usePathname: () => '/home',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));

const MATCH_ID = '87328d95-dae5-4548-918f-7954a24b7fcd';
const NOW = '2026-10-08T00:00:00.000Z';
const DATES = [
  ['2026-10-09T14:02:00.000Z', '10월 9일 (금)', '23:02'],
  ['2026-10-09T15:02:00.000Z', '10월 10일 (토)', '00:02'],
  ['2026-10-09T07:02:00-07:00', '10월 9일 (금)', '23:02'],
  ['2026-10-10T00:02:00+09:00', '10월 10일 (토)', '00:02'],
] as const;
function teamMatch(startsAt: string): V1TeamMatch {
  return { id: MATCH_ID, teamMatchId: MATCH_ID, title: 'UTC 경계 친선전',
    sportName: '풋살', sport: { sportId: 'futsal', name: '풋살' },
    placeName: '합성 경기장', place: { name: '합성 경기장', address: null, latitude: null, longitude: null, provider: null, providerPlaceId: null },
    hostTeam: { teamId: 'host-team', name: '현재 경기의 팀' },
    startsAt, endsAt: '2026-10-10T14:59:00.000Z', capacityText: '2/12', status: 'recruiting',
    imageUrl: '/uploads/current-match.webp', listImageUrl: '/uploads/current-list.webp' };
}
function league(registrationDeadlineAt: string): V1TournamentListItem {
  return { id: 'league-1', sportId: 'futsal', sport: { code: 'futsal', name: '풋살' },
    title: '같은 날짜의 리그', status: 'open', format: 'league', kind: 'regular_league',
    registrationDeadlineAt, scheduledAt: null, scheduledEndAt: null, venue: '합성 경기장', coverImageUrl: null,
    genderCategory: null, entryFee: 0, entryFeeConfigured: true, prizePool: null, prizeSummary: null, prizeBreakdown: null,
    promoHomeEnabled: false, promoHomeTitle: null, promoHomeSubtitle: null, promoHomeImageUrl: null,
    promoHomeBadgeText: null, promoHomeDateText: null, promoHomeTeamsText: null,
    promoHomeLocationText: null, promoHomePrizeText: null, promoHomePriority: 0,
    promoListEnabled: false, promoListTitle: null, promoListSubtitle: null, promoListImageUrl: null,
    promoListBadgeText: null, promoListDateText: null, promoListTeamsText: null,
    promoListLocationText: null, promoListPrizeText: null, promoListPriority: 0,
    campaignSlug: null, confirmedCount: 2, pendingPaymentCount: 0, createdAt: NOW, updatedAt: NOW };
}
function homeModel(home: V1Home = {}) {
  return toHomeModel({ viewer: { authenticated: true, displayName: '합성 사용자', onboardingStatus: 'completed' }, ...home },
    withoutHomeContent(getHomeViewModel()), () => {}, 0, null);
}

let startsAt: string = DATES[0][0];
const teamRequests: URL[] = [];
const clients: QueryClient[] = [];
const ok = (data: unknown) => HttpResponse.json({ status: 'success', data, timestamp: NOW });
const server = setupServer(
  http.get('*/api/v1/team-matches', ({ request }) => {
    teamRequests.push(new URL(request.url));
    return ok({ items: [teamMatch(startsAt)], pageInfo: { hasNext: false, nextCursor: null } });
  }),
  http.get('*/api/v1/tournaments', () => ok({ items: [], pageInfo: { hasNext: false, nextCursor: null } })),
  http.get('*/api/v1/league-matches', () => ok({ items: [] })),
  http.get('*/api/v1/me/lineup-todos', () => ok({ items: [] })),
  http.post('*/api/v1/logs/client-error', () => new HttpResponse(null, { status: 204 })),
);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1');
  clearStoredV1Session();
  startsAt = DATES[0][0];
  teamRequests.length = 0;
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
  server.resetHandlers();
  server.close();
  clearStoredV1Session();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('MD-QA #58 실제 홈 날짜 소비자와 상세 계약', () => {
  it('formatter를 대체하지 않은 실제 프로세스 시간대를 확인한다', () => {
    const timezone = process.env.TZ;
    expect(['UTC', 'America/Los_Angeles', 'Asia/Seoul']).toContain(timezone);
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(timezone);
    expect(new Date(DATES[0][0]).getHours()).toBe(timezone === 'UTC' ? 14 : timezone === 'Asia/Seoul' ? 23 : 7);
  });

  it.each(DATES)('팀매치 %s는 홈·실제 상세 model에서 같은 KST %s %s를 표시한다', (input, date, time) => {
    const match = teamMatch(input);
    const home = toFeaturedTeamMatch(match);
    const detail = toTeamMatch(match, getTeamMatchDetailViewModel().match);
    expect(detail).toMatchObject({ id: MATCH_ID, date, time });
    expect(home).toMatchObject({ id: MATCH_ID, date, time, imageUrl: match.listImageUrl,
      venue: '합성 경기장 · 현재 경기의 팀', currentParticipants: null, maxParticipants: null, actionLabel: '경기 신청하기' });
  });

  it.each(['', 'invalid-date'])('invalid 입력 %s는 기존 날짜 원문·빈 시각 정책을 보존한다', (input) => {
    expect(toFeaturedTeamMatch(teamMatch(input))).toMatchObject({ date: input, time: '' });
  });

  it('개인 매치 두 API 모양·리그 마감·공지·팝업도 같은 KST 날짜를 소비한다', () => {
    const [input, date, time] = DATES[1];
    const legacy = homeModel({ recommendedMatches: [teamMatch(input)],
      notices: [{ noticeId: 'notice-1', title: '공지', publishedAt: input }],
      popup: { popupId: 'popup-1', title: '팝업', body: '본문', targetScreens: ['home'], publishedAt: input, linkUrl: null, linkLabel: null } });
    const current = homeModel({ recommendations: [{ matchId: MATCH_ID, title: '개인 매치', sportName: '풋살', regionName: '서울', startsAt: input }] });
    expect.soft(legacy.recommendedMatches[0]).toMatchObject({ date, time, currentParticipants: 2, maxParticipants: 12 });
    expect.soft(current.recommendedMatches[0]).toMatchObject({ date, time });
    expect.soft(legacy.notices[0].trailing).toBe(date);
    expect.soft(legacy.popup?.trailing).toBe(date);
    expect(toFeaturedLeague(league(input))).toMatchObject({ date: `${date} 신청 마감`, time: '', actionLabel: '참가 신청하기' });
  });

  it.each(DATES.slice(0, 2))('실제 추천 HTTP %s의 카드가 %s %s와 같은 경기 링크를 표시한다', async (input, date, time) => {
    startsAt = input;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    clients.push(client);
    render(<QueryClientProvider client={client}><HomePageView model={homeModel()} /></QueryClientProvider>);
    const link = await screen.findByRole('link', { name: /UTC 경계 친선전/ });
    expect(link).toHaveAttribute('href', `/team-matches/${MATCH_ID}?from=%2Fhome`);
    expect(within(link).getByText(`${date} ${time}`)).toBeVisible();
    expect(within(link).getByText('경기 신청하기')).toBeInTheDocument();
    expect(teamRequests).toHaveLength(1);
    expect(Object.fromEntries(teamRequests[0].searchParams)).toMatchObject({ status: 'recruiting', kind: 'friendly', sort: 'recommended', limit: '1' });
  });
});
