import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import sitemap from '@/app/sitemap';
import { metadata as eventsMetadata } from '@/app/events/layout';
import { parseNextImageSrc } from '@/test/next-image';
import { absoluteSiteUrl, buildFixtureDescription, buildFixtureTitle, buildLeagueFixtureTitle, buildPublicMetadata, buildTeamRecordsDescription, buildTournamentDescription, buildTournamentSubpageDescription, buildTournamentTitle, DEFAULT_SOCIAL_IMAGE, fetchPublicV1, getSiteOrigin, metadataDescription, teamDescriptionFallback } from './seo';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const emptyListResponse = () => new Response(
  JSON.stringify({ status: 'success', data: { items: [], notices: [], nextCursor: null, pageInfo: { hasNext: false, nextCursor: null } } }),
  { status: 200, headers: { 'content-type': 'application/json' } },
);

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
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => emptyListResponse()));

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

  it('refuses to publish a partial sitemap when one public API domain is unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (input: string | URL | Request) => (
        String(input).includes('/api/v1/matches?') ? new Response(null, { status: 503 }) : emptyListResponse()
      )),
    );

    await expect(sitemap()).rejects.toThrow('/matches');
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

  it.each([404, 503])('closes the unread body of a %s answer', async (status) => {
    vi.stubEnv('INTERNAL_API_ORIGIN', 'http://api.test');
    const cancel = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status, ok: false, body: { cancel } }));

    await fetchPublicV1('/matches/m-1').catch(() => null);

    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('gives up on an API that never answers instead of waiting for the server default', async () => {
    vi.stubEnv('INTERNAL_API_ORIGIN', 'http://api.test');
    const real = AbortSignal.timeout.bind(AbortSignal);
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => real(20));
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
    })));

    await expect(fetchPublicV1('/matches/m-1')).rejects.toMatchObject({ name: 'TimeoutError' });
    expect(timeoutSpy).toHaveBeenCalledWith(4000);
    timeoutSpy.mockRestore();
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

  it('team name already ending with 팀 does not gain a duplicate suffix', () => {
    expect(teamDescriptionFallback('새 풋살 팀', '풋살', '서울 성동구')).toBe(
      '풋살 · 서울 성동구에서 활동하는 새 풋살 팀을 만나보세요.',
    );
    expect(teamDescriptionFallback('새 풋살 팀', null, null)).toBe('새 풋살 팀을 만나보세요.');
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

  it('설명 속 전화번호는 가려서 내보내고 날짜·시각은 그대로 둔다', () => {
    expect(metadataDescription('참가 문의는 010-1234-5678 로 주세요. 토요일 19:00 킥오프', fallback)).toBe(
      '참가 문의는 ***-****-**** 로 주세요. 토요일 19:00 킥오프',
    );
  });

  it('번호만 적은 설명은 가린 뒤 길이로 판정해 기본 문구로 떨어진다', () => {
    expect(metadataDescription('010-1234-5678', fallback)).toBe(fallback);
    expect(metadataDescription('  010 1234 5678  ', fallback)).toBe(fallback);
  });

  it('기본 문구로 떨어질 때도 그 안의 전화번호는 가린다', () => {
    expect(metadataDescription('dfd', '공지 문의 010-1234-5678 안내')).toBe('공지 문의 ***-****-**** 안내');
    expect(metadataDescription(null, '풋살  대회\n안내')).toBe('풋살 대회 안내');
  });

  it('155자 자르기 경계에 걸린 번호가 앞자리만 남아 드러나지 않는다', () => {
    const description = metadataDescription(`${'가'.repeat(148)} 010-1234-5678`, fallback);
    expect(description).not.toMatch(/010|1234|5678/);
  });
});

describe('buildTournamentDescription', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-13T00:00:00.000Z')); });
  afterEach(() => vi.useRealTimers());
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
    pendingPaymentCount: 0,
    registrationDeadlineAt: '2026-10-16T14:59:00.000Z',
    prizeSummary: '총 800만원 상당의 상금 및 상품',
    promoListSubtitle: null,
  } as unknown as Parameters<typeof buildTournamentDescription>[0];

  it('모집 중 대회는 언제·어디·방식·참가비·남은 자리·마감·상금을 앞에 둔다', () => {
    expect(buildTournamentDescription(open)).toBe(
      '2026년 10월 25일 (일) · 경기대 케이풋살파크 · 풋살 조별리그 + 토너먼트 · 참가비 300,000원 · 20팀 중 14팀 확정 · 신청 마감 2026년 10월 16일 (금) · 총 800만원 상당의 상금 및 상품',
    );
  });

  it('모집이 끝난 대회는 정원·마감 대신 상태를 적는다', () => {
    const done = buildTournamentDescription({ ...open, status: 'completed', prizeSummary: null });
    expect(done).toBe('2026년 10월 25일 (일) · 경기대 케이풋살파크 · 풋살 조별리그 + 토너먼트 · 참가비 300,000원 · 대회 종료');
  });

  it('정규 리그는 형식 값이 기본값이어도 리그로 적는다', () => {
    expect(buildTournamentDescription({ ...open, kind: 'regular_league' })).toContain('풋살 리그 방식');
  });

  it('미설정 리그의 설명에는 참가비를 적지 않고, 설정된 리그·대회는 그대로 적는다', () => {
    const league = { ...open, kind: 'regular_league' } as typeof open;
    const unset = buildTournamentDescription({ ...league, entryFee: 0, entryFeeConfigured: false });
    expect(unset).not.toContain('참가비');
    expect(unset).toContain('풋살 리그 방식');
    expect(unset).not.toContain('20팀 중');
    expect(buildTournamentDescription({ ...league, entryFee: 0, entryFeeConfigured: true })).toContain('참가비 무료');
    expect(buildTournamentDescription({ ...league, entryFee: 50000, entryFeeConfigured: true })).toContain('참가비 50,000원');
    expect(buildTournamentDescription({ ...open, entryFeeConfigured: true })).toContain('참가비 300,000원');
  });

  it('이모지뿐인 짧은 소개는 버리고, 충분한 소개는 사실 뒤에 잇되 155자에서 자른다', () => {
    expect(buildTournamentDescription({ ...open, promoListSubtitle: '⚽️ 5대5 ⚽️' })).not.toContain('⚽');
    const long = buildTournamentDescription({ ...open, promoListSubtitle: '비선출 남성 동호인을 위한 가을 정규 대회로 조별 예선 뒤 상위 팀이 결선 토너먼트에 오릅니다 '.repeat(3) });
    expect(long.startsWith('2026년 10월 25일 (일) · 경기대 케이풋살파크')).toBe(true);
    expect(long).toContain('신청 마감 2026년 10월 16일');
    expect(long.length).toBeLessThanOrEqual(153);
    expect(long.endsWith('…')).toBe(true);
  });

  it('일정·장소가 비어도 방식과 참가비만으로 설명을 만든다', () => {
    expect(
      buildTournamentDescription({ ...open, scheduledAt: null, scheduledEndAt: null, venue: '  ', entryFee: 0, status: 'draft', prizeSummary: null }),
    ).toBe('풋살 조별리그 + 토너먼트 · 참가비 무료');
  });

  it('검색 설명도 실제 마감·결제 대기 정원을 기준으로 모집 상태를 안내한다', () => {
    expect(buildTournamentDescription({ ...open, registrationDeadlineAt: '2026-10-12T14:59:00.000Z' })).toContain('신청 마감됨');
    expect(buildTournamentDescription({ ...open, pendingPaymentCount: 6 })).toContain('정원 마감');
  });
});

describe('buildFixtureDescription', () => {
  const played = {
    tournamentTitle: '가을 풋살컵',
    displayTitle: null,
    round: 'quarter',
    groupName: null,
    legNumber: 1,
    scheduledAt: '2026-10-25T05:00:00.000Z',
    venue: '경기대 케이풋살파크',
    fieldName: 'A구장',
    home: { registrationId: 'r1', teamId: 't1', teamName: '송파 FC' },
    away: { registrationId: 'r2', teamId: 't2', teamName: '잠실 유나이티드' },
    status: 'ended',
    scoreStatus: 'official',
    score: { home: 3, away: 1, penalties: null },
  } as unknown as Parameters<typeof buildFixtureDescription>[0];

  it('확정 경기는 점수·일정·장소를 앞에 두고 70자를 넘긴다', () => {
    const text = buildFixtureDescription(played);
    expect(text).toBe(
      '최종 스코어 송파 FC 3 : 1 잠실 유나이티드 · 2026년 10월 25일 (일) 오후 2:00 · 경기대 케이풋살파크 A구장 — 가을 풋살컵 8강 경기 일정과 득점·카드 기록을 확인하세요.',
    );
    expect(text.length).toBeGreaterThanOrEqual(70);
  });

  it('승부차기까지 간 확정 경기는 승부차기 점수도 적는다', () => {
    const text = buildFixtureDescription({ ...played, score: { home: 1, away: 1, penalties: { home: 4, away: 3 } } });
    expect(text).toContain('송파 FC 1 : 1 잠실 유나이티드 (승부차기 4 : 3)');
  });

  it.each(['pending', 'live', 'unavailable'] as const)('점수 상태가 %s 이면 점수를 싣지 않고 팀과 일정만 적는다', (scoreStatus) => {
    const text = buildFixtureDescription({ ...played, scoreStatus, status: scoreStatus === 'live' ? 'live' : 'scheduled' });
    expect(text).not.toMatch(/\d : \d|스코어/);
    expect(text.startsWith('송파 FC vs 잠실 유나이티드 · 2026년 10월 25일 (일) 오후 2:00')).toBe(true);
  });

  it('같은 대회·라운드의 경기도 팀과 일정이 다르면 설명이 다르다', () => {
    const other = { ...played, home: { registrationId: 'r3', teamId: 't3', teamName: '강동 FC' }, scheduledAt: '2026-10-25T07:00:00.000Z' };
    expect(buildFixtureDescription(other)).not.toBe(buildFixtureDescription(played));
  });

  it('팀이 정해지지 않은 경기는 미정으로 적고, 취소된 경기는 취소를 적는다', () => {
    const text = buildFixtureDescription({ ...played, home: null, away: null, scoreStatus: 'unavailable', score: null, status: 'cancelled' });
    expect(text).toContain('미정 vs 미정 · 취소된 경기 ·');
  });

  it('일정이 미정이어도 가짜 날짜는 적지 않고 확정 점수와 장소는 싣는다', () => {
    const text = buildFixtureDescription({ ...played, scheduledAt: null });
    expect(text).toBe('최종 스코어 송파 FC 3 : 1 잠실 유나이티드 · 경기대 케이풋살파크 A구장 — 가을 풋살컵 8강 경기 일정과 득점·카드 기록을 확인하세요.');
    expect(text).not.toContain('일정 미정');
  });

  it('구장 이름이 장소 이름과 같으면 한 번만 적는다', () => {
    expect(buildFixtureDescription({ ...played, fieldName: '경기대 케이풋살파크' })).toContain('오후 2:00 · 경기대 케이풋살파크 — ');
  });

  it('날짜·확정 점수·장소가 모두 없으면 기존 문구를 그대로 쓴다', () => {
    expect(buildFixtureDescription({ ...played, scheduledAt: null, venue: null, fieldName: null, scoreStatus: 'pending', score: null })).toBe(
      '가을 풋살컵 8강 경기 기록을 확인하세요.',
    );
  });
});

describe('buildTournamentSubpageDescription', () => {
  const base = {
    title: '가을 풋살컵',
    sport: { code: 'futsal', name: '풋살' },
    format: 'group_knockout',
    kind: 'regular_tournament',
    status: 'completed',
    scheduledAt: '2026-10-25T02:00:00.000Z',
    scheduledEndAt: '2026-10-25T10:00:00.000Z',
    venue: '경기대 케이풋살파크',
  } as unknown as Parameters<typeof buildTournamentSubpageDescription>[0];

  it('화면 목적 문장 뒤에 일정·장소·방식·상태를 붙인다', () => {
    expect(buildTournamentSubpageDescription(base, 'results')).toBe(
      '가을 풋살컵의 경기별 결과와 기록을 확인하세요. 2026년 10월 25일 (일) · 경기대 케이풋살파크 · 풋살 조별리그 + 토너먼트 · 대회 종료',
    );
    expect(buildTournamentSubpageDescription(base, 'awards')).toContain('MVP와 개인 시상 결과를 확인하세요. 2026년 10월 25일');
    expect(buildTournamentSubpageDescription(base, 'bracket')).toContain('조별 순위와 토너먼트 대진표를 확인하세요. 2026년 10월 25일');
  });

  it('리그처럼 그리는 대회의 대진표는 리그 소개 문장을 쓴다', () => {
    expect(buildTournamentSubpageDescription({ ...base, kind: 'regular_league' } as typeof base, 'bracket')).toContain(
      '가을 풋살컵의 경기 일정과 순위를 확인하세요. 2026년 10월 25일',
    );
  });

  it('일정·장소가 없으면 방식만 덧붙인다', () => {
    expect(buildTournamentSubpageDescription({ ...base, scheduledAt: null, venue: null, status: 'open' } as typeof base, 'results')).toBe(
      '가을 풋살컵의 경기별 결과와 기록을 확인하세요. 풋살 조별리그 + 토너먼트',
    );
  });
});

describe('buildTeamRecordsDescription', () => {
  const summary = { played: 12, won: 7, drawn: 2, lost: 3, goalsFor: 30, goalsAgainst: 18, byType: {} };

  it('공식 경기가 있으면 시즌 범위와 승무패를 적는다', () => {
    const records = { teamName: '송파 FC', summary, availableSeasons: ['2026', '2025'] } as unknown as Parameters<typeof buildTeamRecordsDescription>[0];
    expect(buildTeamRecordsDescription(records)).toBe('송파 FC의 공식 경기 전적과 최근 결과를 확인하세요. 2025~2026년 공식 12경기 7승 2무 3패');
  });

  it('공식 경기가 없으면 전적 숫자를 적지 않는다', () => {
    const records = { teamName: '송파 FC', summary: { ...summary, played: 0, won: 0, drawn: 0, lost: 0 }, availableSeasons: [] } as unknown as Parameters<typeof buildTeamRecordsDescription>[0];
    expect(buildTeamRecordsDescription(records)).toBe('송파 FC의 공식 경기 전적과 최근 결과를 확인하세요.');
  });
});

describe('buildTournamentTitle', () => {
  it.each([
    ['풋살', 'regular_league', '수요일 여성부', '수요일 여성부 · 풋살 리그'],
    ['풋살', 'regular_tournament', '지역 컵', '지역 컵 · 풋살 대회'],
    ['수영', 'regular_tournament', '시민 수영대회', '시민 수영대회 · 수영 대회'],
    ['축구', 'regular_league', '서울 축구 리그', '서울 축구 리그'],
  ] as const)('실제 %s 종목과 %s 유형을 보존한다', (sport, kind, title, expected) => {
    expect(buildTournamentTitle({ title, sport: { name: sport } as never, kind })).toBe(expected);
  });
});

describe('buildPublicMetadata 공유 이미지', () => {
  const ogImages = (metadata: ReturnType<typeof buildPublicMetadata>) =>
    metadata.openGraph?.images as Array<{ url: string; width?: number; height?: number; alt?: string }>;

  it('업로드 커버는 원본 대신 가로 1200 사본을 og:image·twitter:image 로 내보내고, 모르는 크기를 적지 않는다', () => {
    const metadata = buildPublicMetadata({ title: '대회', description: '설명', path: '/tournaments/t-1', image: '/uploads/2026/07/cover.png' });
    const [og] = ogImages(metadata);

    expect(parseNextImageSrc(og.url)).toMatchObject({ pathname: '/_next/image', url: '/uploads/2026/07/cover.png', w: '1200' });
    expect(og).toEqual({ url: og.url, alt: '대회' });
    expect(metadata.twitter).toMatchObject({ card: 'summary_large_image', images: [og.url] });
  });

  it('정사각 로고도 같은 사본으로 내보내고 X 작은 카드는 그대로 둔다', () => {
    const metadata = buildPublicMetadata({ title: '팀', description: '설명', path: '/teams/t-1', image: '/uploads/2026/07/logo.png', squareImage: true });

    expect(parseNextImageSrc(ogImages(metadata)[0].url).url).toBe('/uploads/2026/07/logo.png');
    expect(metadata.twitter).toMatchObject({ card: 'summary', images: [ogImages(metadata)[0].url] });
  });

  it('외부 주소 커버는 변환 주소로 감싸지 않는다', () => {
    const metadata = buildPublicMetadata({ title: '대회', description: '설명', path: '/tournaments/t-1', image: 'https://cdn.example.com/poster.jpg' });

    expect(ogImages(metadata)).toEqual([{ url: 'https://cdn.example.com/poster.jpg', alt: '대회' }]);
    expect(metadata.twitter).toMatchObject({ images: ['https://cdn.example.com/poster.jpg'] });
  });

  it('이미지가 없으면 지금처럼 기본 이미지와 크기 메타를 낸다', () => {
    const metadata = buildPublicMetadata({ title: '공지', description: '설명', path: '/notices/n-1', image: null });

    expect(ogImages(metadata)).toEqual([
      { url: DEFAULT_SOCIAL_IMAGE.path, width: DEFAULT_SOCIAL_IMAGE.width, height: DEFAULT_SOCIAL_IMAGE.height, alt: '공지' },
    ]);
    expect(metadata.twitter).toMatchObject({ card: 'summary_large_image', images: [DEFAULT_SOCIAL_IMAGE.path] });
  });
});

describe('buildFixtureTitle', () => {
  const pair = {
    tournamentTitle: '가을 풋살컵',
    displayTitle: null,
    legNumber: 1,
    home: { registrationId: 'r1', teamId: 't1', teamName: '송파 FC' },
    away: { registrationId: 'r2', teamId: 't2', teamName: '잠실 유나이티드' },
  };

  it('같은 두 팀이 조별리그와 결선에서 만나면 라운드·조 이름으로 제목이 갈린다', () => {
    const group = buildFixtureTitle({ ...pair, round: 'group', groupName: 'A조' } as unknown as Parameters<typeof buildFixtureTitle>[0]);
    const final = buildFixtureTitle({ ...pair, round: 'final', groupName: null } as unknown as Parameters<typeof buildFixtureTitle>[0]);
    expect(group).not.toBe(final);
    expect(group).toBe('송파 FC vs 잠실 유나이티드 · A조 · 조별리그 | 가을 풋살컵');
    expect(final).toContain('송파 FC vs 잠실 유나이티드 · ');
  });

  it('운영자가 정한 경기 제목이 있으면 그것을 쓴다', () => {
    const title = buildFixtureTitle({ ...pair, round: 'final', groupName: null, displayTitle: '챔피언 결정전' } as unknown as Parameters<typeof buildFixtureTitle>[0]);
    expect(title).toBe('송파 FC vs 잠실 유나이티드 · 챔피언 결정전 | 가을 풋살컵');
  });

  it('팀이 정해지지 않았으면 미정으로 적는다', () => {
    const title = buildFixtureTitle({ ...pair, home: null, away: null, round: 'final', groupName: null } as unknown as Parameters<typeof buildFixtureTitle>[0]);
    expect(title.startsWith('미정 vs 미정 · ')).toBe(true);
  });
});

describe('buildLeagueFixtureTitle', () => {
  it('두 팀이 정해지면 제목 뒤에 붙인다', () => {
    expect(buildLeagueFixtureTitle('봄 리그 3주차', { host: '송파 FC', opponent: '잠실 FC' })).toBe('봄 리그 3주차 · 송파 FC vs 잠실 FC');
  });

  it('한쪽만 알면 모르는 쪽은 미정이고, 둘 다 모르면 제목 그대로다', () => {
    expect(buildLeagueFixtureTitle('봄 리그 3주차', { host: '송파 FC' })).toBe('봄 리그 3주차 · 송파 FC vs 미정');
    expect(buildLeagueFixtureTitle('봄 리그 3주차', { host: ' ', opponent: null })).toBe('봄 리그 3주차');
  });
});

describe('정규리그 + 토너먼트 방식 검색 설명', () => {
  const base = {
    title: '가을컵',
    sport: { code: 'futsal', name: '풋살' },
    format: 'league_knockouts',
    kind: 'regular_tournament',
    status: 'in_progress',
    scheduledAt: '2026-10-25T02:00:00.000Z',
    scheduledEndAt: null,
    venue: '경기대 케이풋살파크',
  } as unknown as Parameters<typeof buildTournamentSubpageDescription>[0];

  it('화면 라벨의 자리표시자 「N개」가 검색 설명에 나오지 않는다', () => {
    const text = buildTournamentSubpageDescription(base, 'bracket');
    expect(text).toContain('정규리그 + 복수 토너먼트');
    expect(text).not.toContain('N개');
  });

  it('다른 방식의 문구는 그대로다', () => {
    const text = buildTournamentSubpageDescription({ ...base, format: 'group_knockout' } as typeof base, 'bracket');
    expect(text).toContain('풋살 조별리그 + 토너먼트');
  });
});
