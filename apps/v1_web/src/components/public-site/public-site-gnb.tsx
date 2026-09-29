import Link from 'next/link';
import type { ReactNode } from 'react';
import { LandingCtaLink, type LandingCtaId } from '@/components/landing/landing-cta-link';
import { LandingMotionToggle, LandingThemeToggle } from '@/components/landing/landing-nav-controls';
import { BrandMark } from '@/components/v1-ui/brand-logo';
import { PublicSiteDropdown, PublicSiteMobileMenu } from './public-site-menus';
import { PUBLIC_NAV_GUIDE_LABEL, PUBLIC_NAV_GUIDES, PUBLIC_NAV_SERVICES, currentNavHref } from './public-site-nav';

const GUIDE_GROUPS = [{ label: PUBLIC_NAV_GUIDE_LABEL, links: PUBLIC_NAV_GUIDES }];

/** 공개 페이지에서는 계측하지 않는다 — landing_cta_click 은 랜딩 대시보드가 cta 값으로 집계한다. */
function GnbCta({ landing, cta, className, children }: {
  landing: boolean;
  cta: LandingCtaId;
  className: string;
  children: ReactNode;
}) {
  return landing
    ? <LandingCtaLink className={className} href="/login" cta={cta}>{children}</LandingCtaLink>
    : <Link className={className} href="/login">{children}</Link>;
}

/**
 * 공개 페이지(/help·/faq·/contact·/for/*)와 랜딩 v4 가 함께 쓰는 GNB. 테마 토글은 앱과 한 설정(tm-theme)을 공유한다.
 * `landing` 은 랜딩 전용 장치(움직임 멈추기·CTA 계측·스크롤 진행 바)를 켠다.
 * 1024+ 는 매치·대회·팀 + 이용 안내 드롭다운, 그 아래는 메뉴 버튼 하나로 접는다.
 */
export function PublicSiteGnb({ currentPath, landing = false }: { currentPath?: string; landing?: boolean }) {
  const serviceCurrent = currentNavHref(PUBLIC_NAV_SERVICES.map((service) => service.href), currentPath);
  return (
    <header className="tm-landing-nav">
      <div className="tm-landing-nav-inner">
        <Link className="tm-landing-brand" href="/landing" aria-label="teameet 홈">
          <BrandMark size={28} />
          teameet
        </Link>
        <nav className="tm-landing-nav-links" aria-label="주요 메뉴">
          {PUBLIC_NAV_SERVICES.map((service) => (
            <Link
              key={service.href}
              className="tm-landing-nav-link"
              href={service.href}
              aria-current={service.href === serviceCurrent ? 'page' : undefined}
            >
              {service.label}
            </Link>
          ))}
        </nav>
        <nav className="tm-landing-nav-site" aria-label={PUBLIC_NAV_GUIDE_LABEL}>
          <PublicSiteDropdown label={PUBLIC_NAV_GUIDE_LABEL} links={PUBLIC_NAV_GUIDES} currentPath={currentPath} />
        </nav>
        <div className="tm-landing-nav-ctas">
          {landing ? <LandingMotionToggle /> : null}
          <LandingThemeToggle />
          <GnbCta landing={landing} cta="nav_login" className="tm-btn tm-btn-sm tm-btn-ghost tm-landing-nav-login">
            로그인
          </GnbCta>
          <GnbCta landing={landing} cta="nav_signup" className="tm-btn tm-btn-sm tm-btn-neutral tm-landing-nav-signup">
            무료로 시작
          </GnbCta>
          <PublicSiteMobileMenu currentPath={currentPath} primary={PUBLIC_NAV_SERVICES} groups={GUIDE_GROUPS} />
        </div>
      </div>
      {landing ? <span className="tm-landing-progress" aria-hidden="true" /> : null}
    </header>
  );
}
