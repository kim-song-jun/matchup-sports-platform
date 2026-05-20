import { NoticeListPageView } from '@/components/notices/notices-page';
import { getNoticeListViewModel } from '@/components/notices/notices.view-model';

export default function NoticesPage() {
  return <NoticeListPageView model={getNoticeListViewModel()} />;
}
