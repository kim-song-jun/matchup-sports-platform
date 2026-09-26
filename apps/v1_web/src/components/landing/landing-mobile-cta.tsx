'use client';

import { useEffect, useState } from 'react';
import { LandingCtaLink } from './landing-cta-link';

/**
 * 모바일(<768) 하단 고정 CTA 바. 히어로 CTA 나 마지막 CTA 배너·푸터가 화면에 있으면
 * 같은 버튼이 두 번 보이고 푸터 링크를 가리므로 그때는 숨긴다(`[data-mobile-cta-hide]`).
 * 페이지에 하단 내비가 없어 DESIGN.md 14절의 "내비와 겹침" 문제는 생기지 않는다.
 */
export function LandingMobileCta() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const targets = document.querySelectorAll('[data-mobile-cta-hide]');
    if (targets.length === 0) return;
    const visible = new Set<Element>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) visible.add(entry.target);
        else visible.delete(entry.target);
      }
      setShow(visible.size === 0);
    });
    targets.forEach((target) => observer.observe(target));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="tm-landing-mobile-cta" data-show={show} inert={!show}>
      <LandingCtaLink className="tm-btn tm-btn-lg tm-btn-neutral" href="/matches" cta="mobile_bar_browse_matches">
        매치 보기
      </LandingCtaLink>
      <LandingCtaLink className="tm-btn tm-btn-lg tm-btn-primary" href="/login" cta="mobile_bar_signup">
        무료로 시작하기
      </LandingCtaLink>
    </div>
  );
}
