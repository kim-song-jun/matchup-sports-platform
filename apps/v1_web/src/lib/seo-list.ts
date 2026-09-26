import { fetchPublicV1 } from '@/lib/seo';
import type { V1MasterSportsResponse, V1Sport } from '@/types/api';

/**
 * 클라이언트 목록 쿼리의 placeholder 로 넘길 응답. `path` 는 클라이언트 훅이 보내는 요청과
 * **같은 쿼리**여야 한다 — 다르면 서버 첫 화면과 하이드레이션 후 목록이 어긋난다.
 *
 * 실패해도 던지지 않는다 — 업스트림이 흔들렸다고 목록 페이지 전체를 500 으로 만들지 않는다.
 * 실패하면 빈 목록이 아니라 `null` 이다. 빈 목록을 seed 로 넘기면 클라이언트가 실제 응답이
 * 올 때까지 "대회가 없어요" 빈 상태를 사실처럼 그린다 — seed 없음이면 기존 로딩 경로를 탄다.
 */
export async function fetchSeoSeed<T>(path: string, label: string): Promise<T | null> {
  try {
    const data = await fetchPublicV1<T>(path);
    if (data === null) console.error(`[seo] ${label} 목록 서버 프리렌더 404 — 클라이언트 로딩으로 넘긴다`);
    return data;
  } catch (error) {
    console.error(`[seo] ${label} 목록 서버 프리렌더 실패 — 클라이언트 로딩으로 넘긴다`, error);
    return null;
  }
}

/**
 * 서버 프리렌더용 마스터 종목 목록.
 *
 * 종목 필터 칩은 링크에 **종목 ID** 를 실어야 실제로 필터가 걸린다. 이 목록이 없으면 칩은
 * 필터가 걸리지 않는 링크가 되므로(라벨을 ID 인 척 쓰는 것은 더 나쁘다 — 아무 것도 걸리지
 * 않는 URL 을 크롤러가 수집한다), 서버에서도 같은 공개 API 로 가져온다.
 *
 * 실패해도 던지지 않는다 — 목록 본문이 더 중요하고, 칩은 하이드레이션 후 클라이언트가
 * 정상 링크로 다시 그린다.
 */
export async function fetchSeoMasterSports(): Promise<V1Sport[]> {
  try {
    const data = await fetchPublicV1<V1Sport[] | V1MasterSportsResponse>('/master/sports');
    if (!data) return [];
    return Array.isArray(data) ? data : data.sports;
  } catch (error) {
    console.error('[seo] 마스터 종목 조회 실패 — 종목 칩이 필터 없는 링크로 나간다', error);
    return [];
  }
}
