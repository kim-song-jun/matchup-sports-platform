import { redirect } from 'next/navigation';

/**
 * 리그 허브 통합(2026-08-25)으로 목록이 /admin/league-matches 의 탭으로 이동했다.
 * 북마크·딥링크가 죽지 않도록 구 URL 은 리다이렉트로 보존한다.
 * 체계 상세([seriesId])·생성(new) 라우트는 그대로 산다.
 */
export default function AdminLeagueSeriesRedirect() {
  redirect('/admin/league-matches?tab=series');
}
