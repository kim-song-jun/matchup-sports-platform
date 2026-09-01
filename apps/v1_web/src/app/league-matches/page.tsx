import { redirect } from 'next/navigation';
import { buildLeagueListRedirect } from '@/lib/league-list-redirect';

/**
 * **리그 전용 목록은 통합 목록으로 넘어갔다**(2026-09-01 사용자 확정, A안 2단계).
 *
 * 리그는 이제 `/tournaments?kind=league` 에서 본다 — 그 목록이 예정(draft)까지 담고
 * (#932) 상태·종목 필터도 갖췄으므로(#942) 이 화면이 하던 일을 전부 대신한다.
 * **순서를 지켰다:** 담을 곳을 먼저 만들고 나서 넘긴다 — 반대로 하면 넘어간 화면에
 * 예정 리그가 없거나 상태 칩이 없는 창이 생긴다.
 *
 * ## 넘기는 범위 — **목록만**
 * 하위 화면(`/league-matches/:id` · `/fixtures/:id` · `/awards`)은 **그대로 둔다**
 * (사용자 명시). 특히 **시상(`/awards`)은 대회 쪽에 대응 화면이 없다** — 넘기면 갈 곳이
 * 없어진다.
 *
 * ## 고른 상태를 함께 넘긴다
 * *"진행 중을 보던 사람은 넘어가서도 진행 중"* 이어야 한다. 축마다 상태 이름이 달라
 * (`active` ↔ `in_progress`) 그냥 실어 보내면 400 이므로 `buildLeagueListRedirect` 가
 * 옮긴다.
 *
 * ⚠️ `redirect()` 는 기본이 **307**(임시)이다. 이 이전은 영구적이지만, 통합 목록이
 * 자리를 잡을 때까지는 되돌릴 여지를 남기는 편이 안전하다 — 영구(308)로 바꾸면 브라우저가
 * 캐시해 되돌려도 사용자가 옛 화면을 못 본다.
 */
export default async function LeagueMatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string | string[]; sportId?: string | string[] }>;
}) {
  const params = await searchParams;
  redirect(buildLeagueListRedirect(params));
}
