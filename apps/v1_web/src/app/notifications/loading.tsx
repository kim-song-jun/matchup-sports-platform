import { AppChrome } from '@/components/v1-ui/shell';
import { PageSkeleton } from '@/components/v1-ui/page-skeleton';

/**
 * 라우트 전환 중 보여줄 셸. 없으면 이전 화면이 그대로 멈춰 있다가 갑자기 바뀐다.
 * AppChrome props 는 NotificationsPageView 와 같아야 전환 시 헤더·탭이 튀지 않는다.
 */
export default function NotificationsLoading() {
  return (
    <AppChrome
      title="알림"
      activeTab="my"
      bottomNav={false}
      backHref="/home"
      showNotifications={false}
      // NotificationsPageView 는 이 슬롯에 "모두 읽기"를 항상 렌더한다. 로딩 셸에서 비워 두면
      // 데이터가 도착하는 순간 헤더 오른쪽에 버튼이 튀어나온다 — 같은 크기의 비활성 자리표시로
      // 폭을 미리 잡아 둔다(읽을 게 없으므로 스크린리더에서는 숨긴다).
      topbarActions={(
        <button className="tm-btn tm-btn-sm tm-btn-ghost" type="button" disabled aria-hidden="true" tabIndex={-1}>
          모두 읽기
        </button>
      )}
    >
      <p className="sr-only" role="status">알림을 불러오는 중이에요.</p>
      <PageSkeleton />
    </AppChrome>
  );
}
