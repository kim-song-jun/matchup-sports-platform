import { PageSkeleton } from '@/components/v1-ui/page-skeleton';

/**
 * 라우트 전환 중 보여줄 스켈레톤. 셸(AppShellFrame)이 이미 프레임(title/activeTab/backHref
 * 등)을 그리므로 여기서는 본문 스켈레톤만 렌더한다 — ChatListPageView는 useShellOverride를
 * 쓰지 않고 lib/route-chrome/fragments/community.ts 테이블 값 그대로 쓰므로, 헤더는 로딩→실제
 * 전환에도 값이 안 바뀐다(튈 게 없다).
 */
export default function ChatLoading() {
  return (
    <>
      <p className="sr-only" role="status">채팅 목록을 불러오는 중이에요.</p>
      <PageSkeleton variant="list" />
    </>
  );
}
