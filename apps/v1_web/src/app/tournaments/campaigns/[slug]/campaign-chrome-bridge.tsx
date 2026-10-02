'use client';
import type { ReactNode } from 'react';
import { useShellOverride } from '@/components/v1-ui/shell-override';

/**
 * page.tsx는 async 서버 컴포넌트라 useShellOverride(클라이언트 훅)를 직접 부를 수 없다.
 * 이 얇은 클라이언트 경계가 그 간극을 메운다 — searchParams 기반 backHref(page.tsx
 * 주석 참조)와 서버에서 이미 fetch된 대회명을 셸(AppShellFrame)에 밀어넣는다.
 *
 * title은 route-chrome 테이블 기본값 "대회 캠페인"(fragments/tournaments-core.ts)을
 * 덮어쓴다 — SSR은 항상 그 기본값을 먼저 그리고 하이드레이션 후 실제 대회명으로
 * 바뀐다(shell-override.ts의 getServerSnapshot 주석 참조). tournament-detail-client.tsx
 * 등 기존 "fetch된 제목" 케이스와 동일한 트레이드오프이며, 이 라우트도 desktopHead:
 * true(테이블 고정값)라 그 항목이 그대로 이 실제 제목으로 그려진다.
 */
export function CampaignChromeBridge({
  title,
  backHref,
  children,
}: {
  readonly title: string;
  readonly backHref: string;
  readonly children: ReactNode;
}) {
  useShellOverride({ title, backHref });
  return <>{children}</>;
}
