'use client';

import { usePathname } from 'next/navigation';
import { HomePopupDialog } from '@/components/home/home-notice-popup';
import { useV1ActivePopup } from '@/hooks/use-v1-api';
import { resolvePopupTargetScreen } from '@/lib/popup-targets';

export function GlobalPopup() {
  const pathname = usePathname();
  const screen = resolvePopupTargetScreen(pathname);
  // TODO: exact-path 타겟팅(V1Popup.targetPaths)이 아직 findActive()에서 안 쓰여서
  // pathname을 넘겨도 백엔드가 무시한다 — 완성되면 useV1ActivePopup에 두 번째
  // 인자로 pathname을 추가하고 여기서도 넘긴다.
  const popupQuery = useV1ActivePopup(screen);
  const popup = popupQuery.data?.popup;

  return (
    <HomePopupDialog
      popup={popup ? {
        id: popup.popupId,
        title: popup.title,
        body: popup.body,
        content: popup.content,
        trailing: popup.publishedAt
          ? new Date(popup.publishedAt).toLocaleDateString('ko-KR')
          : '팝업',
        linkUrl: popup.linkUrl,
        linkLabel: popup.linkLabel,
      } : null}
    />
  );
}
