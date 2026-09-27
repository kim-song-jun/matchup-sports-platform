import Link from 'next/link';
import {
  isCurrentNav,
  PUBLIC_NAV_GUIDE_LABEL,
  PUBLIC_NAV_GUIDES,
  PUBLIC_NAV_SERVICES,
  PublicSiteDropdown,
  PublicSiteMobileMenu,
} from '@/components/public-site';
import { BrandMark } from '@/components/v1-ui/brand-logo';
import { LandingCtaLink } from '../landing-cta-link';
import { LandingMotionToggle, LandingThemeToggle } from '../landing-nav-controls';

/* 이 페이지 자체 경로가 아니라 정본(/landing)을 currentPath 로 둔다 — 로고·활성 표시 규약은
 * A안 LandingNav 와 같다. 매치/대회/팀·이용 안내 링크는 이 페이지와 겹치지 않아 항상 비활성이다. */
const LANDING_PATH = '/landing';

export function LandingV4Nav() {
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
              aria-current={isCurrentNav(service.href, LANDING_PATH) ? 'page' : undefined}
            >
              {service.label}
            </Link>
          ))}
        </nav>
        <nav className="tm-landing-nav-site" aria-label="이용 안내">
          <PublicSiteDropdown label={PUBLIC_NAV_GUIDE_LABEL} links={PUBLIC_NAV_GUIDES} currentPath={LANDING_PATH} />
        </nav>
        <div className="tm-landing-nav-ctas">
          <LandingMotionToggle />
          <LandingThemeToggle />
          <LandingCtaLink className="tm-btn tm-btn-sm tm-btn-ghost tm-landing-nav-login" href="/login" cta="nav_login">
            로그인
          </LandingCtaLink>
          <LandingCtaLink className="tm-btn tm-btn-sm tm-btn-neutral tm-landing-nav-signup" href="/login" cta="nav_signup">
            무료로 시작
          </LandingCtaLink>
          <PublicSiteMobileMenu
            currentPath={LANDING_PATH}
            primary={PUBLIC_NAV_SERVICES}
            groups={[{ label: PUBLIC_NAV_GUIDE_LABEL, links: PUBLIC_NAV_GUIDES }]}
          />
        </div>
      </div>
      <span className="tm-landing-progress" aria-hidden="true" />
    </header>
  );
}
