/**
 * /tournaments 서버 렌더 계약 — 비-JS 크롤러가 받는 HTML 에 대회 목록이 있어야 하고,
 * API 가 실패하면 빈 목록을 사실처럼 그리지 말고 클라이언트 로딩 경로로 넘겨야 한다.
 * API 경계(fetch)만 바꾸고 페이지 → 클라이언트 → React Query 는 실제 코드로 렌더한다.
 */
import { IsRestoringProvider, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { V1TournamentListItem } from '@/types/api';

const searchParamsState = vi.hoisted(() => ({ value: new URLSearchParams() }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParamsState.value,
  usePathname: () => '/tournaments',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

import TournamentsPage, { generateMetadata } from './page';

function item(id: string, title: string): V1TournamentListItem {
  return {
    id, sportId: 'sport-futsal', sport: { code: 'futsal', name: '풋살' }, title, status: 'open',
    format: 'knockout', kind: 'tournament', registrationDeadlineAt: null, scheduledAt: null,
    scheduledEndAt: null, venue: null, coverImageUrl: null, teamCount: 8, genderCategory: 'mixed',
    entryFee: 0, prizePool: null, prizeSummary: null, prizeBreakdown: null,
    confirmedCount: 0, pendingPaymentCount: 0, createdAt: '2026-01-01T00:00:00.000Z',
  } as unknown as V1TournamentListItem;
}

const requested: string[] = [];

function stubApi(respond: (url: string) => Response) {
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => {
    const url = String(input);
    requested.push(url);
    return respond(url);
  }));
}

function envelope(data: unknown): Response {
  return new Response(JSON.stringify({ status: 'success', data }), { status: 200 });
}

// 실제 앱은 PersistQueryClientProvider 라 서버·첫 렌더에서 isRestoring=true 다(fetchStatus 'idle',
// isLoading=false). 그 상태를 재현하지 않으면 로딩/빈 상태 단언이 실서버와 다르게 통과한다.
async function serverHtml(query = ''): Promise<string> {
  searchParamsState.value = new URLSearchParams(query);
  const page = await TournamentsPage({ searchParams: Promise.resolve(Object.fromEntries(searchParamsState.value)) });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrap = (node: ReactNode) => (
    <QueryClientProvider client={client}><IsRestoringProvider value>{node}</IsRestoringProvider></QueryClientProvider>
  );
  return renderToString(wrap(page));
}

/** JSON-LD 는 따로 본다 — 목록 본문 검사가 스크립트 안의 이름으로 통과하면 안 된다. */
function markup(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>/g, '');
}

function itemListNames(html: string): string[] {
  const match = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/);
  if (!match) return [];
  const data = JSON.parse(match[1]) as { itemListElement: Array<{ name: string }> };
  return data.itemListElement.map((entry) => entry.name);
}

describe('/tournaments 서버 렌더', () => {
  beforeEach(() => {
    requested.length = 0;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('첫 페이지 seed 의 대회 제목이 서버 HTML 과 ItemList 에 같은 순서로 들어간다', async () => {
    stubApi(() => envelope({ items: [item('t-1', '서울 풋살 오픈'), item('t-2', '부산 농구 챌린지')], pageInfo: { nextCursor: null, hasNext: false } }));

    const html = await serverHtml();

    expect(markup(html)).toContain('서울 풋살 오픈');
    expect(markup(html)).toContain('부산 농구 챌린지');
    expect(markup(html)).toContain('href="/tournaments/t-1"');
    expect(itemListNames(html)).toEqual(['서울 풋살 오픈', '부산 농구 챌린지']);
    expect(html).not.toContain('대회 목록 불러오는 중');
    // seed 없는 추천 캐러셀은 자리(스켈레톤)를 잡아 둔다 — null 이면 하이드레이션 뒤에 목록을 밀어낸다.
    expect(html).toContain('추천 대회 불러오는 중');
  });

  it('kind=league 는 리그 목록을 seed 한다 — 전체 목록을 리그 화면에 그리지 않는다', async () => {
    stubApi(() => envelope({ items: [item('l-1', '서울 나이트 리그')], pageInfo: { nextCursor: null, hasNext: false } }));

    const html = await serverHtml('kind=league');

    expect(requested.some((url) => url.includes('/tournaments?') && url.includes('kind=league'))).toBe(true);
    expect(markup(html)).toContain('서울 나이트 리그');
  });

  it('API 가 실패하면 빈 상태 대신 로딩 스켈레톤으로 넘기고 ItemList 를 내지 않는다', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    stubApi(() => new Response('upstream down', { status: 503 }));

    const html = await serverHtml();

    expect(html).toContain('대회 목록 불러오는 중');
    expect(html).not.toContain('모집 중인 대회가 없어요');
    expect(html).not.toContain('application/ld+json');
  });

  it('필터가 걸린 주소는 무필터 첫 페이지를 받지 않는다', async () => {
    stubApi(() => envelope({ items: [item('t-1', '서울 풋살 오픈')], pageInfo: { nextCursor: null, hasNext: false } }));

    const html = await serverHtml('status=open');

    expect(requested.filter((url) => url.includes('/tournaments?'))).toEqual([]);
    expect(markup(html)).not.toContain('서울 풋살 오픈');
    // seed 가 없어도 첫 HTML 은 "조건에 맞는 대회가 없어요"가 아니라 로딩이어야 한다.
    expect(html).toContain('대회 목록 불러오는 중');
  });
});

describe('/tournaments 메타데이터', () => {
  it('kind=league 는 리그 전용 제목·설명을 쓰고 canonical 은 /tournaments 로 묶는다', async () => {
    const league = await generateMetadata({ searchParams: Promise.resolve({ kind: 'league' }) });
    const all = await generateMetadata({ searchParams: Promise.resolve({}) });

    expect(league.title).toBe('정규 리그');
    expect(all.title).toBe('스포츠 대회');
    expect(league.description).not.toBe(all.description);
    expect(league.alternates?.canonical).toBe('/tournaments');
    expect(all.alternates?.canonical).toBe('/tournaments');
  });
});
