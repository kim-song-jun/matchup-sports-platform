import { redirect } from 'next/navigation';

interface Props {
  params: Promise<{ leagueId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * 리그 상세의 기본 진입 섹션. 목록·시리즈·팀매치·운영 콘솔이 이 주소(`/admin/league-matches/:id`)로
 * 링크하므로 주소는 그대로 두고 일정 섹션으로 보낸다. `?from=`(목록 출처)·`?view=list` 는 그대로 이어 준다.
 */
export default async function AdminLeagueMatchDetailPage({ params, searchParams }: Props) {
  const { leagueId } = await params;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) query.append(key, item);
  }
  const suffix = query.size === 0 ? '' : `?${query.toString()}`;
  redirect(`/admin/league-matches/${encodeURIComponent(leagueId)}/schedule${suffix}`);
}
