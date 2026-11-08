'use client';

import { X } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { BrandMark } from '@/components/v1-ui/brand-logo';
import { getMobileAppStoreUrl } from '@/lib/app-store-links';
import { detectNativeShell } from '@/lib/native-bridge';
import { isExcludedOpenInAppPath } from './open-in-app-eligibility';
import { hideOpenInApp, isOpenInAppHidden } from './open-in-app-hide-memory';
import './open-in-app-banner.css';

/**
 * 'shell' 은 앱 셸 스크롤 영역의 맨 위, 'page' 는 셸이 없는 문서형 페이지의 맨 위다.
 * 셸 안에서는 스크롤 영역의 위쪽 여백에 앉아 페이지가 기준으로 삼는 높이를 바꾸지 않는다.
 */
export function OpenInAppBanner({ placement }: { placement: 'shell' | 'page' }) {
  const pathname = usePathname();
  const [storeUrl, setStoreUrl] = useState<string | null>(null);

  // 서버는 UA 를 모르므로 첫 렌더는 비워 두고 마운트 뒤에 판정한다(hydration 일치).
  useEffect(() => {
    if (detectNativeShell() !== null) return;
    const mobileStoreUrl = getMobileAppStoreUrl(window.navigator.userAgent);
    if (!mobileStoreUrl || isOpenInAppHidden()) return;
    setStoreUrl(mobileStoreUrl);
  }, []);

  const dismiss = useCallback(() => {
    hideOpenInApp();
    setStoreUrl(null);
  }, []);

  // 링크 이동이 시작된 다음 태스크에서 치워, 스토어에서 돌아왔을 때 배너가 남아 있지 않게 한다.
  const openAppStore = useCallback(() => {
    hideOpenInApp();
    window.setTimeout(() => setStoreUrl(null), 0);
  }, []);

  if (!storeUrl || isExcludedOpenInAppPath(pathname)) return null;

  return (
    <section
      className="tm-open-in-app-banner"
      data-placement={placement}
      aria-label="팀밋 앱으로 열기"
      // 검색 결과는 실제 대회·리그 내용을 요약해야 한다. 설치 안내는 여전히 사용자에게 보인다.
      data-nosnippet
    >
      <BrandMark size={32} />
      <div className="tm-open-in-app-banner-text">
        <p className="tm-text-label tm-open-in-app-banner-title">팀밋 앱으로 보기</p>
        <p className="tm-text-caption tm-open-in-app-banner-caption">경기 알림 · 실시간 스코어</p>
      </div>
      <a href={storeUrl} onClick={openAppStore} className="tm-btn tm-btn-sm tm-btn-primary">
        앱으로 열기
      </a>
      <button type="button" aria-label="앱 안내 닫기" onClick={dismiss} className="tm-btn tm-btn-icon tm-btn-ghost">
        <X size={18} aria-hidden="true" />
      </button>
    </section>
  );
}
