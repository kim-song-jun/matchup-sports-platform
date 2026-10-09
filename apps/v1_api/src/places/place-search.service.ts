import { BadGatewayException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { IntegrationSettingsService } from '../integrations/integration-settings.service';

interface KakaoKeywordDocument {
  id?: string;
  place_name?: string;
  address_name?: string;
  road_address_name?: string;
  category_name?: string;
  x?: string;
  y?: string;
}

interface KakaoKeywordResponse {
  documents?: KakaoKeywordDocument[];
  meta?: { is_end?: boolean };
}

export interface PlaceSearchItem {
  provider: 'kakao';
  providerPlaceId: string;
  name: string;
  address: string | null;
  jibunAddress: string | null;
  category: string | null;
  latitude: number;
  longitude: number;
}

export interface PlaceSearchResult {
  items: PlaceSearchItem[];
  hasMore: boolean;
}

const KAKAO_KEYWORD_URL = 'https://dapi.kakao.com/v2/local/search/keyword.json';
const PAGE_SIZE = 10;

/** 카카오 로컬 키워드 검색 프록시. REST 키는 서버에만 있고 응답에 싣지 않는다. */
@Injectable()
export class PlaceSearchService {
  private readonly logger = new Logger(PlaceSearchService.name);

  constructor(private readonly integrationSettings: IntegrationSettingsService) {}

  async search(query: string, page = 1): Promise<PlaceSearchResult> {
    const apiKey = await this.integrationSettings.getKakaoRestApiKey();
    if (!apiKey) {
      throw new ServiceUnavailableException({
        code: 'PLACE_SEARCH_UNAVAILABLE',
        message: '장소 검색을 지금 쓸 수 없어요. 이름만 직접 입력해 주세요.',
      });
    }

    let body: KakaoKeywordResponse;
    try {
      const url = `${KAKAO_KEYWORD_URL}?query=${encodeURIComponent(query)}&page=${page}&size=${PAGE_SIZE}`;
      const response = await fetch(url, {
        headers: { Authorization: `KakaoAK ${apiKey}` },
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) {
        this.logger.warn(`Kakao place search failed with status ${response.status}`);
        throw new Error(`status ${response.status}`);
      }
      body = (await response.json()) as KakaoKeywordResponse;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Kakao place search error: ${reason}`);
      throw new BadGatewayException({
        code: 'PLACE_SEARCH_FAILED',
        message: '장소 검색에 실패했어요. 잠시 후 다시 시도해 주세요.',
      });
    }

    const items: PlaceSearchItem[] = [];
    for (const doc of body.documents ?? []) {
      const latitude = Number(doc.y);
      const longitude = Number(doc.x);
      if (!doc.id || !doc.place_name || !Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
      items.push({
        provider: 'kakao',
        providerPlaceId: doc.id,
        name: doc.place_name,
        address: doc.road_address_name || doc.address_name || null,
        jibunAddress: doc.address_name || null,
        category: doc.category_name || null,
        latitude,
        longitude,
      });
    }
    return { items, hasMore: body.meta?.is_end === false };
  }
}
