import { afterEach, describe, expect, it, vi } from 'vitest';
import sitemap from '@/app/sitemap';
import { metadata as eventsMetadata } from '@/app/events/layout';
import { absoluteSiteUrl, buildTournamentDescription, fetchPublicV1, getSiteOrigin, metadataDescription, teamDescriptionFallback } from './seo';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('SEO site origin', () => {
  it('uses the production Teameet host when no override is configured', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');

    expect(getSiteOrigin()).toBe('https://teameet.co.kr');
    expect(absoluteSiteUrl('/tournaments')).toBe('https://teameet.co.kr/tournaments');
  });

  it('uses only the origin portion of a valid deployment override', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://preview.example.com/base/path');

    expect(getSiteOrigin()).toBe('https://preview.example.com');
  });

  it('falls back to the production host for an invalid override', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'not-a-url');

    expect(getSiteOrigin()).toBe('https://teameet.co.kr');
  });

  it('rejects non-HTTP URL schemes', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'javascript:alert(1)');

    expect(getSiteOrigin()).toBe('https://teameet.co.kr');
  });

  it('rejects an insecure production origin', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'http://teameet.co.kr');

    expect(getSiteOrigin()).toBe('https://teameet.co.kr');
  });

  it('publishes canonical metadata and a sitemap entry for the public events hub', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })));

    expect(eventsMetadata.alternates).toMatchObject({ canonical: '/events' });
    expect(eventsMetadata.robots).toMatchObject({ index: true, follow: true });

    const entries = await sitemap();
    expect(entries).toContainEqual(
      expect.objectContaining({
        url: 'https://teameet.co.kr/events',
        changeFrequency: 'daily',
      }),
    );
  });

  it('keeps the static sitemap available when one public API domain is unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((input: string | URL | Request) => {
        const url = String(input);
        return Promise.resolve(
          new Response(null, {
            status: url.includes('/api/v1/matches?') ? 503 : 404,
          }),
        );
      }),
    );

    const entries = await sitemap();

    expect(entries).toContainEqual(
      expect.objectContaining({ url: 'https://teameet.co.kr/events' }),
    );
  });
});

describe('fetchPublicV1 cache policy', () => {
  it('uses no-store for publication-sensitive public league reads', async () => {
    vi.stubEnv('INTERNAL_API_ORIGIN', 'http://api.test');
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ status: 'success', data: { leagueId: 'league-1' } }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchPublicV1('/league-matches/league-1', { cache: 'no-store' })).resolves.toEqual({ leagueId: 'league-1' });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/api/v1/league-matches/league-1',
      expect.objectContaining({ cache: 'no-store' }),
    );
    expect(fetchMock.mock.calls[0][1]).not.toHaveProperty('next');
  });
});

describe('teamDescriptionFallback', () => {
  it('종목·지역이 다 있으면 둘을 함께 쓴다', () => {
    expect(teamDescriptionFallback('강남 FC', '풋살', '서울 송파구')).toBe(
      '풋살 · 서울 송파구에서 활동하는 강남 FC 팀을 만나보세요.',
    );
  });

  it('지역만 있으면 지역만 쓴다', () => {
    expect(teamDescriptionFallback('강남 FC', null, '서울 송파구')).toBe(
      '서울 송파구에서 활동하는 강남 FC 팀을 만나보세요.',
    );
  });

  it('종목만 있으면 어색하지 않은 다른 문장을 쓴다', () => {
    expect(teamDescriptionFallback('강남 FC', '풋살', null)).toBe('풋살을 함께할 강남 FC 팀을 만나보세요.');
  });

  it('둘 다 없어도 null·undefined 가 문장에 새지 않는다', () => {
    const text = teamDescriptionFallback('강남 FC', null, null);

    expect(text).toBe('강남 FC 팀을 만나보세요.');
    expect(text).not.toMatch(/null|undefined/);
  });

  it('공백만 있는 값은 없는 것으로 본다', () => {
    expect(teamDescriptionFallback('강남 FC', '  ', ' \n ')).toBe('강남 FC 팀을 만나보세요.');
  });
});

describe('metadataDescription', () => {
  const fallback = '풋살 · 송파 풋살파크에서 열리는 팀매치 정보를 확인해 보세요.';

  it('검색 설명으로 쓸 수 없는 짧은 입력은 기본 문구로 바꾼다', () => {
    expect(metadataDescription('dfd', fallback)).toBe(fallback);
    expect(metadataDescription('   ', fallback)).toBe(fallback);
    expect(metadataDescription(null, fallback)).toBe(fallback);
  });

  it('충분한 길이의 입력은 공백을 접어 그대로 쓰고, 155자를 넘으면 자른다', () => {
    expect(metadataDescription('매주 토요일 오전 송파에서\n풋살하는 팀이에요', fallback)).toBe('매주 토요일 오전 송파에서 풋살하는 팀이에요');
    const long = metadataDescription('가'.repeat(200), fallback);
    expect(long).toHaveLength(153);
    expect(long.endsWith('…')).toBe(true);
  });
});

describe('buildTournamentDescription', () => {
  // 제2회 팀밋 풋살컵(비선출 남성부) 프로덕션 응답에서 가져온 값 — 주최자 소개는 이모지 한 줄뿐이었다.
  const open = {
    sport: { code: 'futsal', name: '풋살' },
    format: 'group_knockout',
    kind: 'regular_tournament',
    status: 'open',
    scheduledAt: '2026-10-25T02:00:00.000Z',
    scheduledEndAt: '2026-10-25T10:00:00.000Z',
    venue: '경기대 케이풋살파크',
    entryFee: 300000,
    teamCount: 20,
    confirmedCount: 14,
    registrationDeadlineAt: '2026-10-16T14:59:00.000Z',
    prizeSummary: '총 800만원 상당의 상금 및 상품',
    promoListSubtitle: null,
  } as unknown as Parameters<typeof buildTournamentDescription>[0];

  it('모집 중 대회는 언제·어디·방식·참가비·남은 자리·마감·상금을 앞에 둔다', () => {
    expect(buildTournamentDescription(open)).toBe(
      '10월 25일 (일) · 경기대 케이풋살파크 · 풋살 조별리그 + 토너먼트 · 참가비 300,000원 · 20팀 중 14팀 확정 · 신청 마감 10월 16일 (금) · 총 800만원 상당의 상금 및 상품',
    );
  });

  it('모집이 끝난 대회는 정원·마감 대신 상태를 적는다', () => {
    const done = buildTournamentDescription({ ...open, status: 'completed', prizeSummary: null });
    expect(done).toBe('10월 25일 (일) · 경기대 케이풋살파크 · 풋살 조별리그 + 토너먼트 · 참가비 300,000원 · 대회 종료');
  });

  it('정규 리그는 형식 값이 기본값이어도 리그로 적는다', () => {
    expect(buildTournamentDescription({ ...open, kind: 'regular_league' })).toContain('풋살 리그 방식');
  });

  it('미설정 리그의 설명에는 참가비를 적지 않고, 설정된 리그·대회는 그대로 적는다', () => {
    const league = { ...open, kind: 'regular_league' } as typeof open;
    const unset = buildTournamentDescription({ ...league, entryFee: 0, entryFeeConfigured: false });
    expect(unset).not.toContain('참가비');
    expect(unset).toContain('풋살 리그 방식 · 20팀 중 14팀 확정');
    expect(buildTournamentDescription({ ...league, entryFee: 0, entryFeeConfigured: true })).toContain('참가비 무료');
    expect(buildTournamentDescription({ ...league, entryFee: 50000, entryFeeConfigured: true })).toContain('참가비 50,000원');
    expect(buildTournamentDescription({ ...open, entryFeeConfigured: true })).toContain('참가비 300,000원');
  });

  it('이모지뿐인 짧은 소개는 버리고, 충분한 소개는 사실 뒤에 잇되 155자에서 자른다', () => {
    expect(buildTournamentDescription({ ...open, promoListSubtitle: '⚽️ 5대5 ⚽️' })).not.toContain('⚽');
    const long = buildTournamentDescription({ ...open, promoListSubtitle: '비선출 남성 동호인을 위한 가을 정규 대회로 조별 예선 뒤 상위 팀이 결선 토너먼트에 오릅니다 '.repeat(3) });
    expect(long.startsWith('10월 25일 (일) · 경기대 케이풋살파크')).toBe(true);
    expect(long).toContain(' — 비선출 남성 동호인을 위한');
    expect(long.length).toBeLessThanOrEqual(153);
    expect(long.endsWith('…')).toBe(true);
  });

  it('일정·장소가 비어도 방식과 참가비만으로 설명을 만든다', () => {
    expect(
      buildTournamentDescription({ ...open, scheduledAt: null, scheduledEndAt: null, venue: '  ', entryFee: 0, status: 'draft', prizeSummary: null }),
    ).toBe('풋살 조별리그 + 토너먼트 · 참가비 무료');
  });
});
