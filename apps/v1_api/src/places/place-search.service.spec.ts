import { BadGatewayException, ServiceUnavailableException } from '@nestjs/common';
import { PlaceSearchService } from './place-search.service';

describe('PlaceSearchService', () => {
  const originalFetch = global.fetch;
  const getKey = jest.fn();
  const service = new PlaceSearchService({ getKakaoRestApiKey: getKey } as never);
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    getKey.mockResolvedValue('rest-key');
    global.fetch = fetchMock as unknown as typeof fetch;
  });
  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('maps Kakao documents, prefers the road address and drops rows without finite coords', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        documents: [
          { id: '1', place_name: '망원 풋살장', address_name: '서울 마포구 망원동 1', road_address_name: '서울 마포구 월드컵로 1', category_name: '스포츠 > 풋살', x: '126.9', y: '37.55' },
          { id: '2', place_name: '지번만', address_name: '서울 어딘가 2', road_address_name: '', category_name: '', x: '127.0', y: '37.5' },
          { id: '3', place_name: '좌표 없음', x: 'abc', y: '37.5' },
        ],
        meta: { is_end: false },
      }),
    });

    const result = await service.search('망원', 2);

    expect(result.hasMore).toBe(true);
    expect(result.items).toEqual([
      { provider: 'kakao', providerPlaceId: '1', name: '망원 풋살장', address: '서울 마포구 월드컵로 1', jibunAddress: '서울 마포구 망원동 1', category: '스포츠 > 풋살', latitude: 37.55, longitude: 126.9 },
      { provider: 'kakao', providerPlaceId: '2', name: '지번만', address: '서울 어딘가 2', jibunAddress: '서울 어딘가 2', category: null, latitude: 37.5, longitude: 127 },
    ]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://dapi.kakao.com/v2/local/search/keyword.json?query=%EB%A7%9D%EC%9B%90&page=2&size=10');
    expect(init.headers.Authorization).toBe('KakaoAK rest-key');
  });

  it('503 PLACE_SEARCH_UNAVAILABLE when no REST key is configured, without calling Kakao', async () => {
    getKey.mockResolvedValue(null);
    await expect(service.search('x')).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('502 PLACE_SEARCH_FAILED on a non-ok response', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
    const err = await service.search('x').catch((e) => e);
    expect(err).toBeInstanceOf(BadGatewayException);
    expect(err.getResponse()).toMatchObject({ code: 'PLACE_SEARCH_FAILED' });
  });

  it('502 PLACE_SEARCH_FAILED when fetch throws (timeout/network)', async () => {
    fetchMock.mockRejectedValue(new Error('timeout'));
    await expect(service.search('x')).rejects.toBeInstanceOf(BadGatewayException);
  });
});
