'use client';

import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { usePathname, useSearchParams } from 'next/navigation';
import { HOME_AD_POPUP_PATH, useNoticeAllowsHomeAd } from '@/components/ads/home-ad-popup-notice-gate';
import { HomePopupDialog } from '@/components/home/home-notice-popup';
import { useV1ActivePopup } from '@/hooks/use-v1-api';
import { isSafePopupTargetPath, resolvePopupTargetScreen } from '@/lib/popup-targets';

// This component mounts on every route, but the ad popup is only for `/home`: its chunk loads when it is first rendered there.
const HomeAdPopup = dynamic(() => import('@/components/ads/home-ad-popup').then((module) => module.HomeAdPopup), { ssr: false });

export function GlobalPopup() {
  return (
    <Suspense fallback={null}>
      <GlobalPopupForLocation />
    </Suspense>
  );
}

function GlobalPopupForLocation() {
  const pathname = usePathname();
  const search = useSearchParams()?.toString() ?? '';
  const screen = resolvePopupTargetScreen(pathname);
  // 정확 경로 타겟(V1Popup.targetPaths)은 화면 단위 타겟보다 우선한다(PopupsService.findActive).
  // 경로를 안 넘기면 같은 화면(예: 대회)에 걸린 팝업 여러 개 중 아무거나 하나가 뜬다.
  // ActivePopupQueryDto 와 같은 조건을 통과하는 경로만 넘겨 400 을 만들지 않는다.
  const targetPath = pathname && isSafePopupTargetPath(pathname) ? pathname : undefined;
  const popupQuery = useV1ActivePopup(screen, targetPath);
  const popup = popupQuery.data?.popup;
  // 광고 팝업은 홈에서만, 공지 조회가 끝나 띄울 공지가 없을 때만 순서가 온다(공지 우선).
  const onHome = pathname === HOME_AD_POPUP_PATH;
  const noticeAllowsAd = useNoticeAllowsHomeAd({ onHome, notice: popupQuery });

  return (
    <>
      <HomePopupDialog
        location={pathname ? `${pathname}${search ? `?${search}` : ''}` : pathname}
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
      {onHome ? <HomeAdPopup noticeAllowsAd={noticeAllowsAd} /> : null}
    </>
  );
}
