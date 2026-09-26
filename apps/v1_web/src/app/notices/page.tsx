import { NoticeListPageClient } from '@/components/notices/notices-client';
import { toNotice } from '@/components/notices/notices.format';
import { JsonLd } from '@/components/seo/json-ld';
import { buildPublicMetadata } from '@/lib/seo';
import { fetchSeoSeed } from '@/lib/seo-list';
import { buildItemListLd } from '@/lib/structured-data';
import type { V1NoticesResponse } from '@/types/api';

export const metadata = buildPublicMetadata({
  title: '공지사항',
  description: 'Teameet 서비스 업데이트와 중요한 운영 소식을 확인하세요.',
  path: '/notices',
});

// matches/page.tsx 와 같은 이유 — 빌드 타임 프리렌더를 끈다(빈 seed 가 구워진다).
export const revalidate = 0;

export default async function NoticesPage() {
  // 클라이언트의 '전체' 요청(`useV1Notices(undefined)`)과 같은 쿼리여야 한다 — limit 을 붙이지 않는다.
  const seed = (await fetchSeoSeed<V1NoticesResponse>('/notices', 'notices')) ?? undefined;
  const notices = seed?.notices.map(toNotice) ?? [];

  return (
    <>
      {notices.length > 0 ? (
        <JsonLd
          data={buildItemListLd(
            '공지사항',
            '/notices',
            notices.map((notice) => ({ name: notice.title, path: `/notices/${notice.id}` })),
          )}
        />
      ) : null}
      <NoticeListPageClient seed={seed} />
    </>
  );
}
