import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchPublicV1: vi.fn(),
  fetchPublicProfileForOg: vi.fn(),
}));

vi.mock('@/lib/seo', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/seo')>()),
  fetchPublicV1: mocks.fetchPublicV1,
}));
vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));
vi.mock('./tournaments/[id]/bracket/bracket-page-client', () => ({ BracketPageClient: () => null }));
vi.mock('./tournaments/[id]/results/results-page-client', () => ({ ResultsPageClient: () => null }));
vi.mock('./tournaments/[id]/awards/awards-page-client', () => ({ AwardsPageClient: () => null }));
vi.mock('./tournaments/[id]/reviews/reviews-page-client', () => ({ TournamentReviewsPageClient: () => null }));
vi.mock('./league-matches/[leagueId]/awards/league-awards-page-client', () => ({ LeagueAwardsPageClient: () => null }));
vi.mock('./users/[id]/records/user-records-page-client', () => ({ UserRecordsPageClient: () => null }));
vi.mock('./users/[id]/card/fetch-profile', () => ({ fetchPublicProfileForOg: mocks.fetchPublicProfileForOg }));
vi.mock('@/components/users/player-card-share-client', () => ({ PlayerCardShareClient: () => null }));

const { generateMetadata: bracketMetadata } = await import('./tournaments/[id]/bracket/page');
const { generateMetadata: resultsMetadata } = await import('./tournaments/[id]/results/page');
const { generateMetadata: awardsMetadata } = await import('./tournaments/[id]/awards/page');
const { generateMetadata: reviewsMetadata } = await import('./tournaments/[id]/reviews/page');
const { generateMetadata: leagueAwardsMetadata } = await import('./league-matches/[leagueId]/awards/page');
const { generateMetadata: userCardMetadata } = await import('./users/[id]/card/page');
const { generateMetadata: userRecordsMetadata } = await import('./users/[id]/records/page');

afterEach(() => {
  mocks.fetchPublicV1.mockReset();
  mocks.fetchPublicProfileForOg.mockReset();
  vi.restoreAllMocks();
});

const params = { params: Promise.resolve({ id: 't-1' }) };
const INDEXABLE = { index: true, follow: true };
const SEARCH_EXCLUDED_KEEP_LINKS = { index: false, follow: true };

function tournament(overrides: Record<string, unknown> = {}) {
  return {
    tournamentId: 't-1',
    title: '가을 풋살컵',
    status: 'completed',
    coverImageUrl: null,
    listImageUrl: null,
    promoHomeImageUrl: null,
    promoListImageUrl: null,
    reviewsTotalCount: 3,
    ...overrides,
  };
}

function ogImageUrl(meta: { openGraph?: unknown }): string | undefined {
  const images = (meta.openGraph as { images?: Array<{ url: string }> } | undefined)?.images;
  return images?.[0]?.url;
}

describe('대회 결과·시상 화면의 색인 조건', () => {
  it.each([
    ['결과', resultsMetadata],
    ['시상', awardsMetadata],
  ])('%s: 끝난 대회만 색인을 허용하고 끝나지 않은 대회는 검색 제외(링크는 따라감)로 낸다', async (_screen, generate) => {
    for (const status of ['open', 'closed', 'in_progress', 'cancelled']) {
      mocks.fetchPublicV1.mockResolvedValueOnce(tournament({ status }));
      expect((await generate(params)).robots, status).toEqual(SEARCH_EXCLUDED_KEEP_LINKS);
    }
    mocks.fetchPublicV1.mockResolvedValueOnce(tournament({ status: 'completed' }));
    expect((await generate(params)).robots).toEqual(INDEXABLE);
  });
});

describe('대회 하위 화면의 공유 이미지', () => {
  it.each([
    ['대진표', bracketMetadata],
    ['결과', resultsMetadata],
    ['시상', awardsMetadata],
    ['후기', reviewsMetadata],
  ])('%s: 커버 없이 포스터만 있는 대회도 상세 화면과 같은 이미지를 쓴다', async (_screen, generate) => {
    mocks.fetchPublicV1.mockResolvedValueOnce(tournament({ promoHomeImageUrl: '/uploads/poster.png' }));
    expect(ogImageUrl(await generate(params))).toBe('/uploads/poster.png');

    mocks.fetchPublicV1.mockResolvedValueOnce(tournament({ coverImageUrl: '/uploads/cover.png', promoHomeImageUrl: '/uploads/poster.png' }));
    expect(ogImageUrl(await generate(params))).toBe('/uploads/cover.png');

    mocks.fetchPublicV1.mockResolvedValueOnce(tournament());
    expect(ogImageUrl(await generate(params))).toBe('/opengraph-image');
  });
});

describe('리그 시상 화면 메타', () => {
  const leagueParams = { params: Promise.resolve({ leagueId: 'l-1' }) };
  const league = (state: string) => ({ leagueId: 'l-1', title: '성수 주말 리그', state });

  it('끝난 리그는 리그 이름이 든 제목과 자기 주소 canonical 로 색인을 허용한다', async () => {
    mocks.fetchPublicV1.mockResolvedValue(league('completed'));

    const meta = await leagueAwardsMetadata(leagueParams);

    expect(mocks.fetchPublicV1).toHaveBeenCalledWith('/league-matches/l-1', { cache: 'no-store' });
    expect(meta.title).toContain('성수 주말 리그');
    expect(meta.alternates?.canonical).toBe('/league-matches/l-1/awards');
    expect(meta.robots).toEqual(INDEXABLE);
  });

  it.each(['draft', 'active', 'on_hold'])('%s 상태의 리그는 검색 제외(링크는 따라감)로 낸다', async (state) => {
    mocks.fetchPublicV1.mockResolvedValue(league(state));

    const meta = await leagueAwardsMetadata(leagueParams);

    expect(meta.title).toContain('성수 주말 리그');
    expect(meta.robots).toEqual(SEARCH_EXCLUDED_KEEP_LINKS);
  });

  it('없는 리그는 제목 없는 일반 색인 대신 검색 제외 메타를 낸다', async () => {
    mocks.fetchPublicV1.mockResolvedValue(null);

    const meta = await leagueAwardsMetadata(leagueParams);

    expect(meta.title).toBe('리그를 찾을 수 없어요');
    expect(meta.robots).toMatchObject({ index: false });
  });

  it('조회가 실패하면 끝난 리그인지 알 수 없으므로 색인 허용으로 내보내지 않는다', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.fetchPublicV1.mockRejectedValue(new Error('SEO metadata request failed: /league-matches/l-1 (503)'));

    const meta = await leagueAwardsMetadata(leagueParams);

    expect(meta.robots).toEqual(SEARCH_EXCLUDED_KEEP_LINKS);
    expect(meta.alternates?.canonical).toBe('/league-matches/l-1/awards');
  });
});

describe('선수 카드·활동 기록 메타', () => {
  it('선수 카드: 검색 제외로 맞추되 공유 미리보기 값(og 제목·설명)과 자동 이미지 규약은 그대로 둔다', async () => {
    mocks.fetchPublicProfileForOg.mockResolvedValue({
      displayName: '민수',
      playerCard: { overall: 77, appearances: 12, unlockedCount: 4 },
    });

    const meta = await userCardMetadata({ params: Promise.resolve({ id: 'u-1' }) });

    expect(meta.robots).toMatchObject({ index: false });
    expect(meta.openGraph?.title).toBe('민수 · 77 | Teameet');
    expect(meta.openGraph?.description).toContain('12경기');
    // images 를 직접 지정하면 같은 폴더의 opengraph-image 규약이 덮인다.
    expect(meta.openGraph).not.toHaveProperty('images');
  });

  it('활동 기록: 검색 제외로 맞추되 og 제목·이미지는 그대로 둔다', async () => {
    mocks.fetchPublicV1.mockResolvedValue({ nickname: '민수' });

    const meta = await userRecordsMetadata({ params: Promise.resolve({ id: 'u-1' }) });

    expect(meta.robots).toMatchObject({ index: false });
    expect(meta.openGraph?.title).toBe('민수 님의 활동 기록 | Teameet');
    expect(ogImageUrl(meta)).toBe('/opengraph-image');
  });
});
