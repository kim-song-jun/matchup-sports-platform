'use client';

import { PageSkeleton } from '@/components/v1-ui/page-skeleton';
import { useShellOverride } from '@/components/v1-ui/shell-override';

/**
 * 라우트 전환 중 보여줄 스켈레톤. 셸(AppShellFrame)이 이미 프레임(title/activeTab/backHref
 * 등)을 그리므로 본문은 스켈레톤만 렌더하면 되지만, /notifications는 예외다.
 *
 * NotificationsPageView가 마운트되면 useShellOverride로 title을 "알림 {안읽음수}"(ReactNode
 * — route-chrome 테이블은 string만 허용해 못 담는다, types.ts:8)로, topbarActions를 "모두
 * 읽기" 버튼으로 덮어쓴다(community-page.tsx). 로딩 셸이 lib/route-chrome/fragments/
 * community.ts 테이블의 정적 title="알림"·topbarActions 없음 그대로 있다가 데이터 도착
 * 순간 이 값들로 바뀌면 헤더 폭이 튄다. 그래서 로딩 중에도 같은 구조를 보이지 않게
 * (visibility:hidden / disabled+aria-hidden) 미리 깔아 폭을 예약해 둔다 — 실제 숫자가
 * 두 자리 이상이면 그만큼은 여전히 움직이는데, 이건 로딩 셸이 아니라 화면 자체의 성질이라
 * 여기서 더 해줄 수 있는 게 없다(읽음 처리로 숫자가 줄 때도 마찬가지).
 */
export default function NotificationsLoading() {
  useShellOverride({
    title: (
      <span>
        알림 <span className="tm-notification-count" aria-hidden="true" style={{ visibility: 'hidden' }}>0</span>
      </span>
    ),
    topbarActions: (
      <button className="tm-btn tm-btn-sm tm-btn-ghost" type="button" disabled aria-hidden="true" tabIndex={-1}>
        모두 읽기
      </button>
    ),
  });
  return (
    <>
      <p className="sr-only" role="status">알림을 불러오는 중이에요.</p>
      <PageSkeleton variant="list" />
    </>
  );
}
