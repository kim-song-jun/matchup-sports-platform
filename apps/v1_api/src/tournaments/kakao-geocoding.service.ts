import { Injectable, Logger } from '@nestjs/common';
import { IntegrationSettingsService } from '../integrations/integration-settings.service';

export type GeocodedCoordinates = { latitude: number; longitude: number };

interface KakaoKeywordSearchResponse {
  documents?: Array<{ y?: string; x?: string }>;
}

/**
 * 카카오 로컬 API 키워드 검색으로 장소명(venue) → 좌표 변환.
 *
 * WebPushService와 동일한 graceful-disable 패턴: REST 키가 없으면(env var도, 어드민
 * 설정도 없으면) 조회를 시도하지 않고 null을 반환한다 — 실패해도 venue 저장 자체를
 *막지 않는다(호출부에서 try/catch로 감싸는 것과 별개로, 이 서비스 자체도 절대 throw하지 않는다).
 */
@Injectable()
export class KakaoGeocodingService {
  private readonly logger = new Logger(KakaoGeocodingService.name);
  private warnedDisabled = false;

  constructor(private readonly integrationSettings: IntegrationSettingsService) {}

  async geocode(query: string): Promise<GeocodedCoordinates | null> {
    const trimmed = query.trim();
    if (!trimmed) return null;

    const apiKey = await this.integrationSettings.getKakaoRestApiKey();
    if (!apiKey) {
      if (!this.warnedDisabled) {
        this.logger.warn(
          'KAKAO_REST_API_KEY not configured (env var or admin settings) — venue geocoding disabled, falling back to null coordinates',
        );
        this.warnedDisabled = true;
      }
      return null;
    }

    try {
      const url = `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(trimmed)}`;
      const response = await fetch(url, {
        headers: { Authorization: `KakaoAK ${apiKey}` },
      });

      if (!response.ok) {
        this.logger.warn(`Kakao geocoding request failed with status ${response.status} for query "${trimmed}"`);
        return null;
      }

      const body = (await response.json()) as KakaoKeywordSearchResponse;
      const first = body.documents?.[0];
      if (!first?.y || !first?.x) return null;

      const latitude = Number(first.y);
      const longitude = Number(first.x);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

      return { latitude, longitude };
    } catch (err) {
      this.logger.warn(`Kakao geocoding request threw for query "${trimmed}": ${err}`);
      return null;
    }
  }
}
