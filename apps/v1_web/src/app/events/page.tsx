import { JsonLd } from '@/components/seo/json-ld';
import { eventCampaignSeedPath, type EventCampaignSeed } from '@/lib/public-list-seed';
import { fetchSeoSeed } from '@/lib/seo-list';
import { buildItemListLd } from '@/lib/structured-data';
import { EventsPageClient } from './events-client';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// matches/page.tsx 와 같은 이유 — 빌드 타임 프리렌더를 끈다(빈 seed 가 구워진다).
export const revalidate = 0;

export default async function EventsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  // 종목이 걸린 주소는 seed 하지 않는다 — 무필터 목록을 그 종목의 결과처럼 보여 주게 된다.
  // 빈 `?sport=` 도 클라이언트는 "종목 있음"으로 읽어 seed 를 버리므로 파라미터 자체가 없을 때만.
  const seed = params.sport === undefined
    ? (await fetchSeoSeed<EventCampaignSeed>(eventCampaignSeedPath(), 'events')) ?? undefined
    : undefined;

  return (
    <>
      {seed && seed.items.length > 0 ? (
        <JsonLd
          data={buildItemListLd(
            '팀밋이 여는 대회',
            '/events',
            seed.items.map((item) => ({ name: item.heroTitle, path: `/tournaments/campaigns/${item.slug}` })),
          )}
        />
      ) : null}
      <EventsPageClient seed={seed} />
    </>
  );
}
