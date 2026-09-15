'use client';

import { usePathname } from 'next/navigation';
import { HomePopupDialog } from '@/components/home/home-notice-popup';
import { useV1ActivePopup } from '@/hooks/use-v1-api';
import { isSafePopupTargetPath, resolvePopupTargetScreen } from '@/lib/popup-targets';

export function GlobalPopup() {
  const pathname = usePathname();
  const screen = resolvePopupTargetScreen(pathname);
  // 정확 경로 타겟(V1Popup.targetPaths)은 화면 단위 타겟보다 우선한다(PopupsService.findActive).
  // 경로를 안 넘기면 같은 화면(예: 대회)에 걸린 팝업 여러 개 중 아무거나 하나가 뜬다.
  // ActivePopupQueryDto 와 같은 조건을 통과하는 경로만 넘겨 400 을 만들지 않는다.
  const targetPath = pathname && isSafePopupTargetPath(pathname) ? pathname : undefined;
  const popupQuery = useV1ActivePopup(screen, targetPath);
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
