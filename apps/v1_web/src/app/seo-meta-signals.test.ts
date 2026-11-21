import type { Metadata } from 'next';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseNextImageSrc } from '@/test/next-image';
import { COMPLETED_CUP_ID, LIVE_CUP_ID, publicSeoApi, REGULAR_LEAGUE_ID } from '@/test/public-seo-fixtures';

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
vi.mock('./tournaments/[id]/matches/[fixtureId]/match-page-client', () => ({ MatchPageClient: () => null }));
vi.mock('./teams/[id]/records/team-records-page-client', () => ({ TeamRecordsPageClient: () => null }));
vi.mock('./tournaments/[id]/bracket/bracket-page-client', () => ({ BracketPageClient: () => null }));
vi.mock('./tournaments/[id]/results/results-page-client', () => ({ ResultsPageClient: () => null }));
vi.mock('./tournaments/[id]/awards/awards-page-client', () => ({ AwardsPageClient: () => null }));
vi.mock('./tournaments/[id]/reviews/reviews-page-client', () => ({ TournamentReviewsPageClient: () => null }));
vi.mock('./league-matches/[leagueId]/awards/league-awards-page-client', () => ({ LeagueAwardsPageClient: () => null }));
vi.mock('./users/[id]/records/user-records-page-client', () => ({ UserRecordsPageClient: () => null }));
vi.mock('./users/[id]/card/fetch-profile', () => ({ fetchPublicProfileForOg: mocks.fetchPublicProfileForOg }));
vi.mock('@/components/users/player-card-share-client', () => ({ PlayerCardShareClient: () => null }));

const { default: sitemap } = await import('./sitemap');
const { generateMetadata: matchMetadata } = await import('./tournaments/[id]/matches/[fixtureId]/page');
const { generateMetadata: teamRecordsMetadata } = await import('./teams/[id]/records/page');
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
    sport: { code: 'futsal', name: '풋살' },
    format: 'group_knockout',
    kind: 'regular_tournament',
    scheduledAt: '2026-10-25T02:00:00.000Z',
    scheduledEndAt: '2026-10-25T10:00:00.000Z',
    venue: '경기대 케이풋살파크',
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

function optimizedOgImage(meta: { openGraph?: unknown }) {
  return parseNextImageSrc(ogImageUrl(meta) ?? '');
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

describe('대진 화면 설명', () => {
  const FACTS = '2026년 10월 25일 (일) · 경기대 케이풋살파크';
  const LEAGUE_STYLE = `가을 풋살컵의 경기 일정과 순위를 확인하세요. ${FACTS} · 풋살 리그 방식 · 대회 종료`;
  const TOURNAMENT_STYLE = (format: string) =>
    `가을 풋살컵의 조별 순위와 토너먼트 대진표를 확인하세요. ${FACTS} · 풋살 ${format} · 대회 종료`;

  // 리그처럼 그리는 두 모양 — 정규 리그 거울 행은 format 이 group_knockout 이라 format 만 보면 못 잡는다.
  it.each([
    ['리그 방식 대회', { format: 'league', kind: 'regular_tournament' }],
    ['정규 리그', { format: 'group_knockout', kind: 'regular_league' }],
  ])('%s: 화면 소개 줄과 같은 문장이고 og 설명도 같다', async (_name, shape) => {
    mocks.fetchPublicV1.mockResolvedValueOnce(tournament(shape));

    const meta = await bracketMetadata(params);

    expect(meta.description).toBe(LEAGUE_STYLE);
    expect(meta.openGraph?.description).toBe(LEAGUE_STYLE);
  });

  it.each([
    ['조별+토너먼트 대회', { format: 'group_knockout', kind: 'regular_tournament' }, '조별리그 + 토너먼트'],
    ['정규리그 + 여러 토너먼트 대회', { format: 'league_knockouts', kind: 'regular_tournament' }, '정규리그 + 복수 토너먼트'],
    ['토너먼트 대회', { format: 'knockout', kind: 'regular_tournament' }, '토너먼트'],
    ['kind 없는 옛 행', { format: 'group_knockout', kind: null }, '조별리그 + 토너먼트'],
  ])('%s: 대진표 문장 뒤에 일정·장소·방식이 붙는다', async (_name, shape, formatLabel) => {
    mocks.fetchPublicV1.mockResolvedValueOnce(tournament(shape));

    const meta = await bracketMetadata(params);

    expect(meta.description).toBe(TOURNAMENT_STYLE(formatLabel));
    expect(meta.openGraph?.description).toBe(TOURNAMENT_STYLE(formatLabel));
  });

  it.each([
    { format: 'league', kind: 'regular_tournament' },
    { format: 'group_knockout', kind: 'regular_league' },
    { format: 'group_knockout', kind: 'regular_tournament' },
    { format: 'league_knockouts', kind: 'regular_tournament' },
    { format: 'knockout', kind: 'regular_tournament' },
    { format: 'group_knockout', kind: null },
  ])('제목과 canonical 은 형식과 무관하게 같다: %o', async (shape) => {
    mocks.fetchPublicV1.mockResolvedValueOnce(tournament(shape));

    const meta = await bracketMetadata(params);

    expect(meta.title).toBe('가을 풋살컵 대진표');
    expect(meta.alternates?.canonical).toBe('/tournaments/t-1/bracket');
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
    expect(optimizedOgImage(await generate(params))).toMatchObject({ pathname: '/_next/image', url: '/uploads/poster.png', w: '1200' });

    mocks.fetchPublicV1.mockResolvedValueOnce(tournament({ coverImageUrl: '/uploads/cover.png', promoHomeImageUrl: '/uploads/poster.png' }));
    expect(optimizedOgImage(await generate(params))).toMatchObject({ pathname: '/_next/image', url: '/uploads/cover.png', w: '1200' });

    mocks.fetchPublicV1.mockResolvedValueOnce(tournament());
    expect(ogImageUrl(await generate(params))).toBe('/opengraph-image');
  });
});

/**
 * 사이트맵이 "여기를 색인해 달라"고 올린 대회 하위 주소를 그 화면 자신의 메타가 검색 제외로 내면
 * 크롤러가 받는 신호가 서로 엇갈린다. 사이트맵의 조건(sitemap.ts)과 화면 메타의 조건(각 page.tsx)은
 * 따로 쓰여 있어 한쪽만 고쳐도 어긋난다.
 */
describe('사이트맵과 대회 하위 화면 메타의 교차', () => {
  const SUBROUTES = {
    bracket: bracketMetadata,
    results: resultsMetadata,
    awards: awardsMetadata,
    reviews: reviewsMetadata,
  } as const;
  type Subroute = keyof typeof SUBROUTES;

  const indexAllowed = ({ robots }: Metadata) => typeof robots !== 'object' || robots === null || robots.index !== false;
  const tournamentAddress = (id: string, subroute: Subroute) => `https://teameet.co.kr/tournaments/${id}/${subroute}`;
  const metaFor = (id: string, subroute: Subroute) => SUBROUTES[subroute]({ params: Promise.resolve({ id }) });

  async function sitemapUrls() {
    mocks.fetchPublicV1.mockImplementation(async (apiPath: string) => publicSeoApi(apiPath));
    return (await sitemap()).map((entry) => entry.url);
  }

  it('사이트맵에 실린 대회 하위 주소는 모두 그 화면의 메타가 색인을 허용한다', async () => {
    const urls = await sitemapUrls();
    const listed = urls.flatMap((url) => {
      const match = /^https:\/\/teameet\.co\.kr\/tournaments\/([^/]+)\/(bracket|results|awards|reviews)$/.exec(url);
      return match ? [{ id: match[1]!, subroute: match[2] as Subroute }] : [];
    });
    // 네 화면이 모두 한 번 이상 나와야 이 시험이 네 화면의 메타를 다 본다.
    expect(new Set(listed.map(({ subroute }) => subroute))).toEqual(new Set(Object.keys(SUBROUTES)));

    for (const { id, subroute } of listed) {
      expect(indexAllowed(await metaFor(id, subroute)), `${id} ${subroute}: 사이트맵에 있는데 메타가 검색 제외다`).toBe(true);
    }
  });

  it('메타가 검색 제외로 내는 대회 하위 주소는 사이트맵에 없다', async () => {
    const urls = await sitemapUrls();
    const excluded: string[] = [];
    for (const id of [COMPLETED_CUP_ID, LIVE_CUP_ID, REGULAR_LEAGUE_ID]) {
      for (const subroute of Object.keys(SUBROUTES) as Subroute[]) {
        if (indexAllowed(await metaFor(id, subroute))) continue;
        excluded.push(tournamentAddress(id, subroute));
        expect(urls, `${id} ${subroute}: 메타가 검색 제외인데 사이트맵에 있다`).not.toContain(tournamentAddress(id, subroute));
      }
    }
    // 끝나지 않은 대회의 결과·시상, 후기 없는 대회의 후기 — 자료가 이 조합을 실제로 만든다.
    expect(excluded).toEqual(expect.arrayContaining([
      tournamentAddress(LIVE_CUP_ID, 'results'),
      tournamentAddress(LIVE_CUP_ID, 'awards'),
      tournamentAddress(LIVE_CUP_ID, 'reviews'),
    ]));
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

describe('결과·시상 화면 설명', () => {
  it.each([
    ['결과', resultsMetadata, '경기별 결과와 기록을 확인하세요.'],
    ['시상', awardsMetadata, 'MVP와 개인 시상 결과를 확인하세요.'],
  ])('%s: 목적 문장 뒤에 일정·장소·방식·상태가 붙고 og 설명도 같다', async (_screen, generate, purpose) => {
    mocks.fetchPublicV1.mockResolvedValueOnce(tournament());

    const meta = await generate(params);

    const expected = `가을 풋살컵의 ${purpose} 2026년 10월 25일 (일) · 경기대 케이풋살파크 · 풋살 조별리그 + 토너먼트 · 대회 종료`;
    expect(meta.description).toBe(expected);
    expect(meta.openGraph?.description).toBe(expected);
  });

  it('일정이 다른 대회는 같은 화면이어도 설명이 다르다', async () => {
    mocks.fetchPublicV1.mockResolvedValueOnce(tournament());
    mocks.fetchPublicV1.mockResolvedValueOnce(tournament({ scheduledAt: '2026-11-08T02:00:00.000Z', scheduledEndAt: null, venue: '송파 풋살파크' }));

    const first = await resultsMetadata(params);
    const second = await resultsMetadata(params);

    expect(second.description).not.toBe(first.description);
  });
});

describe('경기 상세 설명', () => {
  const match = {
    tournamentId: 't-1',
    tournamentTitle: '가을 풋살컵',
    fixtureId: 'f-1',
    displayTitle: null,
    round: 'quarter',
    groupName: null,
    legNumber: 1,
    scheduledAt: '2026-10-25T05:00:00.000Z',
    venue: '경기대 케이풋살파크',
    fieldName: null,
    home: { registrationId: 'r1', teamId: 'a', teamName: '송파 FC' },
    away: { registrationId: 'r2', teamId: 'b', teamName: '잠실 유나이티드' },
    status: 'ended',
    scoreStatus: 'official',
    score: { home: 2, away: 0, penalties: null },
  };
  const matchParams = { params: Promise.resolve({ id: 't-1', fixtureId: 'f-1' }) };

  async function describeMatch(overrides: Record<string, unknown>) {
    mocks.fetchPublicV1.mockResolvedValueOnce({ ...match, ...overrides }).mockResolvedValueOnce({ kind: 'regular_tournament' });
    return matchMetadata(matchParams);
  }

  it('확정 경기는 점수·일정·장소를 설명에 싣고 og 설명도 같다', async () => {
    const meta = await describeMatch({});
    expect(meta.description).toContain('최종 스코어 송파 FC 2 : 0 잠실 유나이티드 · 2026년 10월 25일 (일) 오후 2:00 · 경기대 케이풋살파크');
    expect(meta.openGraph?.description).toBe(meta.description);
    expect((meta.description ?? '').length).toBeGreaterThanOrEqual(70);
  });

  it('확정 전 경기의 설명에는 점수가 없다', async () => {
    const meta = await describeMatch({ scoreStatus: 'pending', score: { home: 2, away: 0, penalties: null } });
    expect(meta.description).not.toMatch(/스코어|\d : \d/);
    expect(meta.description).toContain('송파 FC vs 잠실 유나이티드 · 2026년 10월 25일');
  });

  it('같은 두 팀의 다른 라운드 경기는 제목이 갈린다', async () => {
    const group = await describeMatch({ round: 'group', groupName: 'A조' });
    const final = await describeMatch({ round: 'final', groupName: null });
    expect(group.title).not.toBe(final.title);
    expect(String(group.title)).toContain('A조');
  });
});

describe('팀 전적 설명', () => {
  it('공식 경기 승무패가 설명에 들어간다', async () => {
    mocks.fetchPublicV1.mockResolvedValueOnce({
      teamId: 'a',
      teamName: '송파 FC',
      summary: { played: 5, won: 3, drawn: 1, lost: 1, goalsFor: 9, goalsAgainst: 4, byType: {} },
      availableSeasons: ['2026'],
      items: [],
      nextCursor: null,
    });

    const meta = await teamRecordsMetadata(params);

    expect(meta.description).toBe('송파 FC의 공식 경기 전적과 최근 결과를 확인하세요. 2026년 공식 5경기 3승 1무 1패');
  });
});
