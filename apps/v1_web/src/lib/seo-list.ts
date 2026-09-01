import { fetchPublicV1 } from '@/lib/seo';
import type { CursorPage } from '@/types/api';

/** 크롤러에게 내보낼 첫 페이지 크기 — 서버 기본 페이지(20건)와 같게 둔다. */
export const SEO_LIST_PAGE_SIZE = 20;

/**
 * 목록 화면의 **서버 프리렌더용 첫 페이지**를 가져온다.
 *
 * 실패해도 던지지 않는다. 이 데이터의 용도는 크롤러가 읽을 첫 화면을 채우는 것이고,
 * 사용자 화면은 하이드레이션 후 클라이언트가 다시 가져온다 — 업스트림이 잠깐 흔들렸다고
 * 목록 페이지 전체를 500 으로 만들면 얻는 것 없이 사용자만 잃는다. 대신 조용히 삼키지 않고
 * 서버 로그에 남겨 "크롤러에게 빈 목록이 나간" 사실이 추적되게 한다.
 */
export async function fetchSeoListPage<T>(path: string, label: string): Promise<T[]> {
  try {
    const query = new URLSearchParams({ limit: String(SEO_LIST_PAGE_SIZE) });
    const page = await fetchPublicV1<CursorPage<T>>(`${path}?${query.toString()}`);
    return page?.items ?? [];
  } catch (error) {
    console.error(`[seo] ${label} 목록 서버 프리렌더 실패 — 크롤러에 빈 목록이 나간다`, error);
    return [];
  }
}
