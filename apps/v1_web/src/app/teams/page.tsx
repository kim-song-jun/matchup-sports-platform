import { JsonLd } from '@/components/seo/json-ld';
import { TeamListPageClient } from '@/components/teams/teams-client';
import { hasListFilter, TEAM_LIST_FILTER_PARAMS, TEAM_LIST_SEED_PATH } from '@/lib/public-list-seed';
import { buildPublicMetadata } from '@/lib/seo';
import { fetchSeoMasterSports, fetchSeoSeed } from '@/lib/seo-list';
import { buildItemListLd } from '@/lib/structured-data';
import type { CursorPage, V1Team } from '@/types/api';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export const metadata = buildPublicMetadata({
  title: '스포츠 팀 찾기',
  description: '종목과 활동 지역이 맞는 스포츠 팀을 찾고 팀원으로 함께해 보세요.',
  path: '/teams',
});

// 0 = 이 라우트를 정적/ISR 프리렌더 대상에서 뺀다. `next build`는 API에 못 닿는 CI에서
// 돈다 — revalidate>0로 두면 그 시점의 (실패해 빈) seed가 배포 직후 첫 HIT까지 그대로
// 나간다(관련 메모: isr-serves-build-time-empty-cache). fetchPublicV1의 fetch 자체는
// `next: { revalidate: 300 }`를 여전히 쓰므로 API 부하는 그대로 5분 캐시된다.
export const revalidate = 0;

export default async function TeamsPage({ searchParams }: { searchParams: SearchParams }) {
  const filtered = hasListFilter(await searchParams, TEAM_LIST_FILTER_PARAMS);
  const [page, sports] = await Promise.all([
    fetchSeoSeed<CursorPage<V1Team>>(TEAM_LIST_SEED_PATH, 'teams'),
    fetchSeoMasterSports(),
  ]);

  // 필터가 걸리면 클라이언트가 seed 를 버리므로 LD 도 내지 않는다.
  const ldItems = page && !filtered ? page.items : [];

  return (
    <>
      {ldItems.length > 0 ? (
        <JsonLd
          data={buildItemListLd(
            '스포츠 팀',
            '/teams',
            ldItems.map((item) => ({ name: item.name, path: `/teams/${item.teamId ?? item.id}` })),
          )}
        />
      ) : null}
      <TeamListPageClient seed={page ? { page, sports } : undefined} />
    </>
  );
}
