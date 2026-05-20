import { NoticeDetailPageView } from '@/components/notices/notices-page';
import { getNoticeDetailViewModel } from '@/components/notices/notices.view-model';

export default async function NoticeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <NoticeDetailPageView model={getNoticeDetailViewModel(id)} />;
}
