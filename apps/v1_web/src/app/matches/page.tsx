import { MatchListPageClient } from '@/components/matches/matches-client';
import { sortMatchesByAvailability } from '@/components/matches/matches.card-model';
import { JsonLd } from '@/components/seo/json-ld';
import { hasListFilter, MATCH_LIST_FILTER_PARAMS, MATCH_LIST_SEED_PATH } from '@/lib/public-list-seed';
import { buildPublicMetadata } from '@/lib/seo';
import { fetchSeoMasterSports, fetchSeoSeed } from '@/lib/seo-list';
import { buildItemListLd } from '@/lib/structured-data';
import type { CursorPage, V1Match } from '@/types/api';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export const metadata = buildPublicMetadata({
  title: '개인 매치 찾기',
  description: '내 지역과 종목에 맞는 스포츠 매치를 찾고 함께 운동할 사람을 만나보세요.',
  path: '/matches',
});

// 첫 페이지를 서버에서 미리 받아 크롤러에게 내보낸다. revalidate=0으로 정적/ISR 프리렌더를
// 끈다 — 켜 두면 API에 못 닿는 빌드(next build, CI)에서 구운 빈 목록이 배포 직후 그대로
// 나간다(teams/page.tsx와 동일 이유). fetchPublicV1 내부 fetch는 `next: { revalidate: 300 }`를
// 그대로 쓰므로 5분 캐시는 유지된다.
export const revalidate = 0;

export default async function MatchesPage({ searchParams }: { searchParams: SearchParams }) {
  const filtered = hasListFilter(await searchParams, MATCH_LIST_FILTER_PARAMS);
  const [page, sports] = await Promise.all([
    fetchSeoSeed<CursorPage<V1Match>>(MATCH_LIST_SEED_PATH, 'matches'),
    fetchSeoMasterSports(),
  ]);

  // 카드와 같은 순서(클라이언트가 가용성순으로 다시 정렬한다)·같은 이름. 필터가 걸리면 화면이 seed 와 달라 내지 않는다.
  const ldItems = page && !filtered ? sortMatchesByAvailability([...page.items]) : [];

  return (
    <>
      {ldItems.length > 0 ? (
        <JsonLd
          data={buildItemListLd(
            '개인 매치',
            '/matches',
            ldItems.map((item) => ({ name: item.title, path: `/matches/${item.matchId ?? item.id}` })),
          )}
        />
      ) : null}
      <MatchListPageClient seed={page ? { page, sports } : undefined} />
    </>
  );
}
