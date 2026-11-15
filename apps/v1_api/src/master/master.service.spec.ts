import { Logger } from '@nestjs/common';
import { MasterService, normalizeDistrictName, normalizeRegionName } from './master.service';

describe('normalizeRegionName', () => {
  it.each([
    ['서울특별시', '서울'],
    ['경기도', '경기'],
    ['부산광역시', '부산'],
    ['세종특별자치시', '세종'],
    ['제주특별자치도', '제주'],
    ['강원특별자치도', '강원'],
  ])('%s 를 %s 로 정규화한다', (raw, expected) => {
    expect(normalizeRegionName(raw)).toBe(expected);
  });

  it('입력이 없으면 null을 반환한다', () => {
    expect(normalizeRegionName(null)).toBeNull();
    expect(normalizeRegionName(undefined)).toBeNull();
    expect(normalizeRegionName('')).toBeNull();
  });
});

describe('normalizeDistrictName', () => {
  it('공백으로 구분된 구·군 이름의 첫 토큰만 취한다', () => {
    expect(normalizeDistrictName('강남구 역삼동')).toBe('강남구');
  });

  it('입력이 없으면 null을 반환한다', () => {
    expect(normalizeDistrictName(null)).toBeNull();
    expect(normalizeDistrictName(undefined)).toBeNull();
  });
});

describe('MasterService.resolveLocation', () => {
  const MAP_KEY = 'map-rest-key';
  const LOGIN_KEY = 'login-only-key';
  const LATITUDE = 37.5172;
  const LONGITUDE = 127.0473;

  const seoul = { id: 'r-seoul', code: 'seoul', name: '서울' };
  const gangnam = { id: 'r-gangnam', code: 'seoul-gangnam', name: '강남구', level: 2, parentId: 'r-seoul', parent: seoul };
  const songpa = { id: 'r-songpa', code: 'seoul-songpa', name: '송파구', level: 2, parentId: 'r-seoul', parent: seoul };
  const nearestCandidates = [
    { ...gangnam, centerLat: 37.5172, centerLng: 127.0473 },
    { ...songpa, centerLat: 37.5145, centerLng: 127.1059 },
  ];

  const originalFetch = global.fetch;
  const originalLoginKey = process.env.KAKAO_CLIENT_ID;
  const getKakaoRestApiKey = jest.fn();
  const findFirst = jest.fn();
  const findMany = jest.fn();
  const fetchMock = jest.fn();
  const service = new MasterService(
    { v1Region: { findFirst, findMany } } as never,
    { getKakaoRestApiKey } as never,
  );
  const request = { locationConsentAccepted: true as const, latitude: LATITUDE, longitude: LONGITUDE };
  let warn: jest.SpyInstance;

  const kakaoDocuments = (documents: unknown[]) => ({ ok: true, json: async () => ({ documents }) });
  const seoulGangnamDocument = {
    region_type: 'H',
    region_1depth_name: '서울특별시',
    region_2depth_name: '강남구',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    getKakaoRestApiKey.mockResolvedValue(MAP_KEY);
    findFirst.mockResolvedValue(gangnam);
    findMany.mockResolvedValue(nearestCandidates);
    process.env.KAKAO_CLIENT_ID = LOGIN_KEY;
    global.fetch = fetchMock as unknown as typeof fetch;
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
  });

  afterAll(() => {
    global.fetch = originalFetch;
    if (originalLoginKey === undefined) delete process.env.KAKAO_CLIENT_ID;
    else process.env.KAKAO_CLIENT_ID = originalLoginKey;
  });

  it('calls Kakao with the map REST key, never the login client id, and answers from Kakao', async () => {
    fetchMock.mockResolvedValue(kakaoDocuments([seoulGangnamDocument]));

    const result = await service.resolveLocation(request);

    expect(result).toEqual({ region: gangnam, source: 'kakao' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      `https://dapi.kakao.com/v2/local/geo/coord2regioncode.json?x=${LONGITUDE}&y=${LATITUDE}`,
    );
    expect(init.headers.Authorization).toBe(`KakaoAK ${MAP_KEY}`);
    expect(findMany).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('bounds the Kakao call with a timeout signal', async () => {
    fetchMock.mockResolvedValue(kakaoDocuments([seoulGangnamDocument]));

    await service.resolveLocation(request);

    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it('does not call Kakao when only the login client id exists, and answers with the nearest region', async () => {
    getKakaoRestApiKey.mockResolvedValue(null);

    const result = await service.resolveLocation(request);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({ source: 'nearest', region: { id: gangnam.id } });
    expect(result.distanceMeters).toBeLessThan(1);
    expect(warn).not.toHaveBeenCalled();
  });

  it('falls back to the nearest region when Kakao answers but the district is not a supported region', async () => {
    fetchMock.mockResolvedValue(kakaoDocuments([seoulGangnamDocument]));
    findFirst.mockResolvedValue(null);

    const result = await service.resolveLocation(request);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ source: 'nearest', region: { id: gangnam.id } });
  });

  it.each([
    ['a rejected status', () => fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }), /status 401/],
    ['a network or timeout error', () => fetchMock.mockRejectedValue(new Error('connect timeout')), /connect timeout/],
    [
      'an unreadable body',
      () => fetchMock.mockResolvedValue({ ok: true, json: async () => { throw new Error('bad json'); } }),
      /bad json/,
    ],
  ])('logs a warning without key or coordinates and falls back to nearest on %s', async (_label, arrange, reason) => {
    arrange();

    const result = await service.resolveLocation(request);

    expect(result).toMatchObject({ source: 'nearest', region: { id: gangnam.id } });
    expect(warn).toHaveBeenCalledTimes(1);
    const logged = String(warn.mock.calls[0][0]);
    expect(logged).toMatch(reason);
    for (const secret of [MAP_KEY, LOGIN_KEY, String(LATITUDE), String(LONGITUDE)]) {
      expect(logged).not.toContain(secret);
    }
  });

  it('answers none when there is no map key and no region within range', async () => {
    getKakaoRestApiKey.mockResolvedValue(null);
    findMany.mockResolvedValue([]);

    const result = await service.resolveLocation(request);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toEqual({ region: null, source: 'none', distanceMeters: null });
  });
});
