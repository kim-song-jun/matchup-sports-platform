'use client';

import { usePathname } from 'next/navigation';
import { HomePopupDialog } from '@/components/home/home-notice-popup';
import { useV1ActivePopup } from '@/hooks/use-v1-api';
import { resolvePopupTargetScreen } from '@/lib/popup-targets';

export function GlobalPopup() {
  const pathname = usePathname();
  const screen = resolvePopupTargetScreen(pathname);
  const popupQuery = useV1ActivePopup(screen);
  const popup = popupQuery.data?.popup;

  return (
    <HomePopupDialog
      popup={popup ? {
        id: popup.popupId,
        title: popup.title,
        body: popup.body,
        trailing: popup.publishedAt
          ? new Date(popup.publishedAt).toLocaleDateString('ko-KR')
          : '팝업',
        linkUrl: popup.linkUrl,
        linkLabel: popup.linkLabel,
      } : null}
    />
  );
}
