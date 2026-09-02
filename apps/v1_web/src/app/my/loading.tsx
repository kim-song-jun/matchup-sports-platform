import { PageSkeleton } from '@/components/v1-ui/page-skeleton';

/**
 * 라우트 전환 중 보여줄 스켈레톤. 셸(AppShellFrame)이 이미 프레임을 그리므로 여기서는
 * 본문 스켈레톤만 렌더한다 — MyHomePageView는 lib/route-chrome/fragments/my-home.ts 테이블의
 * title/activeTab/centerTitle 그대로 쓴다. useShellOverride({ hasNewNotification })은 벨
 * 아이콘 위 점 하나만 켜고 끄는 것이라(shell.tsx NotificationBellLink forceUnread) 헤더 폭에는
 * 영향이 없다 — 폭 튐 방지용 자리표시가 필요 없다.
 */
export default function MyLoading() {
  return (
    <>
      <p className="sr-only" role="status">내 정보를 불러오는 중이에요.</p>
      <PageSkeleton variant="detail" />
    </>
  );
}
