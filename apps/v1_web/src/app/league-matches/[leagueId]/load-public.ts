import { fetchPublicV1 } from '@/lib/seo';

export type Loaded<T> = { ok: true; data: T | null } | { ok: false };

/**
 * 리그 화면은 원래 클라이언트만 API 를 불렀다 — 서버 조회가 실패했다고 페이지를 500 으로 만들지
 * 않는다. 실패는 로그로 남기고 메타·LD 만 포기한다(없는 리그의 404 는 proxy.ts 가 HTTP 상태로 처리한다).
 */
export async function loadPublic<T>(path: string): Promise<Loaded<T>> {
  try {
    return { ok: true, data: await fetchPublicV1<T>(path) };
  } catch (error) {
    console.error(`[seo] 리그 화면 서버 조회 실패 — ${path}`, error);
    return { ok: false };
  }
}

// 웹 경로와 API 경로가 같은 모양이라 canonical·breadcrumb·조회가 한 값을 쓴다.
export const leaguePath = (leagueId: string) => `/league-matches/${encodeURIComponent(leagueId)}`;
