import { JsonLd } from '@/components/seo/json-ld';
import { TeamMatchListPageClient } from '@/components/team-matches/team-matches-client';
import { sortTeamMatchesByAvailability } from '@/components/team-matches/team-matches.card-model';
import { hasListFilter, TEAM_MATCH_LIST_FILTER_PARAMS, TEAM_MATCH_LIST_SEED_PATH } from '@/lib/public-list-seed';
import { buildPublicMetadata } from '@/lib/seo';
import { fetchSeoMasterSports, fetchSeoSeed } from '@/lib/seo-list';
import { buildItemListLd } from '@/lib/structured-data';
import type { CursorPage, V1TeamMatch } from '@/types/api';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export const metadata = buildPublicMetadata({
  title: '팀매치 찾기',
  description: '우리 팀과 조건이 맞는 상대 팀을 찾고 스포츠 팀매치를 성사시켜 보세요.',
  path: '/team-matches',
});

// matches/page.tsx와 동일 이유 — revalidate=0으로 빌드 타임 프리렌더를 끈다.
export const revalidate = 0;

export default async function TeamMatchesPage({ searchParams }: { searchParams: SearchParams }) {
  const filtered = hasListFilter(await searchParams, TEAM_MATCH_LIST_FILTER_PARAMS);
  const [page, sports] = await Promise.all([
    fetchSeoSeed<CursorPage<V1TeamMatch>>(TEAM_MATCH_LIST_SEED_PATH, 'team-matches'),
    fetchSeoMasterSports(),
  ]);

  // matches/page.tsx 와 같은 규칙 — 카드 순서·이름 그대로, 무필터일 때만.
  const ldItems = page && !filtered ? sortTeamMatchesByAvailability([...page.items]) : [];

  return (
    <>
      {ldItems.length > 0 ? (
        <JsonLd
          data={buildItemListLd(
            '팀매치',
            '/team-matches',
            ldItems.map((item) => ({ name: item.title, path: `/team-matches/${item.teamMatchId ?? item.id}` })),
          )}
        />
      ) : null}
      <TeamMatchListPageClient seed={page ? { page, sports } : undefined} />
    </>
  );
}
