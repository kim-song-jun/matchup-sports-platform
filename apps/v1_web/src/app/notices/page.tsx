import { NoticeListPageClient } from '@/components/notices/notices-client';
import { buildPublicMetadata } from '@/lib/seo';

export const metadata = buildPublicMetadata({
  title: '공지사항',
  description: 'Teameet 서비스 업데이트와 중요한 운영 소식을 확인하세요.',
  path: '/notices',
});

export default function NoticesPage() {
  return <NoticeListPageClient />;
}
