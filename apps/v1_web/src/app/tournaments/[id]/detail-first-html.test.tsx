/**
 * 대회 상세·하위 화면의 첫 HTML 계약 — 비-JS 크롤러가 받는 서버 HTML 에 대회 내용이 있어야 하고,
 * "불러오지 못했어요" 오류 화면이 들어가면 안 된다. API 경계(fetch)만 바꾸고 page → 클라이언트 →
 * React Query 는 실제 코드로 렌더한다(list-pages-first-html.test.tsx 와 같은 방식).
 */
import { IsRestoringProvider, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicMatchDetail } from '@/components/public-game-records/types';
import type { V1TournamentDetail } from '@/types/api';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/tournaments/t-1',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  notFound: () => { throw new Error('NEXT_NOT_FOUND'); },
}));

import TournamentDetailPage from './page';
import ResultsPage from './results/page';
import BracketPage from './bracket/page';
import AwardsPage from './awards/page';
import TournamentMatchPage from './matches/[fixtureId]/page';

const TOURNAMENT = {
  id: 't-1', title: '가을 송파 풋살컵', status: 'open', kind: 'regular_tournament', format: 'knockout',
  sport: { code: 'futsal', name: '풋살' }, scheduledAt: '2026-10-10T01:00:00.000Z', scheduledEndAt: null,
  registrationDeadlineAt: '2026-10-05T14:59:00.000Z', venue: '송파 풋살파크', entryFee: 0,
  teamCount: 8, confirmedCount: 2, pendingPaymentCount: 0, minPlayers: 5, maxPlayers: 10, genderCategory: 'mixed',
  prizeBreakdown: null, rulesText: null, refundPolicyText: null, prizePool: null, prizeSummary: null,
  coverImageUrl: null, latitude: null, longitude: null, campaignSlug: null, bracketPublishedAt: null,
  participantTeams: [], groups: [], fixtures: [], announcements: [], sponsors: [], reviews: [],
  reviewsTotalCount: 0, awards: [], leagueFixtures: [], createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
} as unknown as V1TournamentDetail;

const MATCH = {
  tournamentId: 't-1', tournamentTitle: '가을 송파 풋살컵', fixtureId: 'f-1', round: '결승', fixtureNumber: 1,
  legNumber: 1, groupId: null, groupName: null, scheduledAt: '2026-10-10T05:00:00.000Z', venue: '송파 풋살파크',
  fieldName: null, home: { registrationId: 'r-1', teamId: 'team-a', teamName: '송파 유나이티드' },
  away: { registrationId: 'r-2', teamId: 'team-b', teamName: '한강 로버스' }, visibilityMode: 'PUBLIC',
  status: 'scheduled', resultState: 'pending', scoreStatus: 'unavailable', score: null, clock: null,
  periodBreak: null, lineup: null, events: [], mvp: null, outcome: null, pendingProjection: false,
  history: [], videos: [], nextMatch: null,
} as unknown as PublicMatchDetail;

function envelope(data: unknown): Response {
  return new Response(JSON.stringify({ status: 'success', data }), { status: 200 });
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => {
    const path = String(input).replace(/^.*\/api\/v1/, '');
    if (path === '/tournaments/t-1') return envelope(TOURNAMENT);
    if (path === '/tournaments/t-1/matches/f-1') return envelope(MATCH);
    return new Response('unexpected', { status: 500 });
  }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// 실제 앱은 PersistQueryClientProvider 라 서버·첫 렌더에서 isRestoring=true 다(fetch 없음, isLoading=false).
async function serverHtml(node: Promise<ReactNode>): Promise<string> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const html = renderToString(
    <QueryClientProvider client={client}><IsRestoringProvider value>{await node}</IsRestoringProvider></QueryClientProvider>,
  );
  // JSON-LD 안의 값으로 본문 검사가 통과하면 안 된다.
  return html.replace(/<script[\s\S]*?<\/script>/g, '');
}

describe('대회 상세 첫 HTML', () => {
  it('상세는 오류 화면 대신 대회 이름을 서버 HTML 에 그린다', async () => {
    const html = await serverHtml(TournamentDetailPage({ params: Promise.resolve({ id: 't-1' }) }));
    expect(html).not.toContain('불러오지 못했어요');
    expect(html).toContain('가을 송파 풋살컵');
  });

  it('결과 화면도 오류 화면을 서버 HTML 에 넣지 않는다', async () => {
    const html = await serverHtml(ResultsPage({ params: Promise.resolve({ id: 't-1' }) }));
    expect(html).not.toContain('불러오지 못했어요');
    expect(html).toContain('가을 송파 풋살컵');
  });

  it.each([
    ['대진표', BracketPage],
    ['시상', AwardsPage],
  ])('%s 화면도 오류 화면을 서버 HTML 에 넣지 않는다', async (_label, Page) => {
    const html = await serverHtml(Page({ params: Promise.resolve({ id: 't-1' }) }));
    expect(html).not.toContain('불러오지 못했어요');
    expect(html).toContain('가을 송파 풋살컵');
  });

  it('경기 상세는 두 팀 이름을 서버 HTML 에 그린다', async () => {
    const html = await serverHtml(TournamentMatchPage({ params: Promise.resolve({ id: 't-1', fixtureId: 'f-1' }) }));
    expect(html).not.toContain('경기 정보를 찾을 수 없어요');
    expect(html).toContain('송파 유나이티드');
    expect(html).toContain('한강 로버스');
  });
});
