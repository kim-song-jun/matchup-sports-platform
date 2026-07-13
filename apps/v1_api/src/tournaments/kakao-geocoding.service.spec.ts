/**
 * kakao-geocoding.service.spec.ts
 *
 * Contract tests for the WebPushService-style graceful-disable pattern:
 * no REST key (env var nor admin setting) → no-op null, never throws; key present →
 * calls Kakao's keyword search with the right URL/header and parses the first result.
 */
import { KakaoGeocodingService } from './kakao-geocoding.service';
import { IntegrationSettingsService } from '../integrations/integration-settings.service';

describe('KakaoGeocodingService', () => {
  let integrationSettings: { getKakaoRestApiKey: jest.Mock };
  let service: KakaoGeocodingService;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    integrationSettings = { getKakaoRestApiKey: jest.fn() };
    service = new KakaoGeocodingService(integrationSettings as unknown as IntegrationSettingsService);
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => jest.clearAllMocks());

  it('no REST key configured (env var nor admin setting) → returns null without calling fetch', async () => {
    integrationSettings.getKakaoRestApiKey.mockResolvedValue(null);

    const result = await service.geocode('잠실종합운동장');

    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('key present → calls Kakao keyword search with encoded query + KakaoAK header, returns parsed coordinates', async () => {
    integrationSettings.getKakaoRestApiKey.mockResolvedValue('test-rest-key');
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ documents: [{ y: '37.5', x: '127.07' }] }),
    });

    const result = await service.geocode('잠실종합운동장');

    expect(result).toEqual({ latitude: 37.5, longitude: 127.07 });
    expect(fetchMock).toHaveBeenCalledWith(
      `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent('잠실종합운동장')}`,
      { headers: { Authorization: 'KakaoAK test-rest-key' } },
    );
  });

  it('empty documents array (no match) → returns null', async () => {
    integrationSettings.getKakaoRestApiKey.mockResolvedValue('test-rest-key');
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ documents: [] }) });

    expect(await service.geocode('존재하지 않는 장소')).toBeNull();
  });

  it('Kakao API returns a non-ok status → returns null, never throws', async () => {
    integrationSettings.getKakaoRestApiKey.mockResolvedValue('test-rest-key');
    fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });

    await expect(service.geocode('잠실종합운동장')).resolves.toBeNull();
  });

  it('fetch throws (network error) → returns null, never throws', async () => {
    integrationSettings.getKakaoRestApiKey.mockResolvedValue('test-rest-key');
    fetchMock.mockRejectedValue(new Error('network down'));

    await expect(service.geocode('잠실종합운동장')).resolves.toBeNull();
  });

  it('blank/whitespace-only query → returns null without checking the key', async () => {
    const result = await service.geocode('   ');

    expect(result).toBeNull();
    expect(integrationSettings.getKakaoRestApiKey).not.toHaveBeenCalled();
  });
});
