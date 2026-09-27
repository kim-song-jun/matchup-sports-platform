import Link from 'next/link';
import { BrandMark } from '@/components/v1-ui/brand-logo';
import { LandingThemeToggle } from '@/components/landing/landing-nav-controls';
import { PublicSiteAudienceMenu, PublicSiteMobileMenu } from './public-site-menus';
import { PUBLIC_NAV_ABOUT, PUBLIC_NAV_CONTACT, PUBLIC_NAV_HELP, isCurrentNav } from './public-site-nav';

function HeaderLink({ href, label, currentPath }: { href: string; label: string; currentPath?: string }) {
  return (
    <Link className="tm-ps-nav-link" href={href} aria-current={isCurrentNav(href, currentPath) ? 'page' : undefined}>
      {label}
    </Link>
  );
}

/**
 * 공개 소개·도움말 페이지 공용 헤더. 테마 토글은 랜딩과 같은 컴포넌트라 앱과 한 설정(tm-theme)을 공유한다.
 * 1024+ 는 가로 메뉴, 그 아래는 메뉴 버튼 하나로 접는다.
 */
export function PublicSiteHeader({ currentPath }: { currentPath?: string }) {
  return (
    <header className="tm-ps-header">
      <div className="tm-ps-header-inner">
        <Link className="tm-ps-brand" href="/landing" aria-label="teameet 홈">
          <BrandMark size={28} />
          teameet
        </Link>
        <nav className="tm-ps-nav" aria-label="주요 메뉴">
          <ul className="tm-ps-nav-list">
            <li><HeaderLink {...PUBLIC_NAV_ABOUT} currentPath={currentPath} /></li>
            <li><PublicSiteAudienceMenu currentPath={currentPath} /></li>
            <li><HeaderLink {...PUBLIC_NAV_HELP} currentPath={currentPath} /></li>
            <li><HeaderLink {...PUBLIC_NAV_CONTACT} currentPath={currentPath} /></li>
          </ul>
        </nav>
        <div className="tm-ps-header-actions">
          <LandingThemeToggle />
          <Link className="tm-btn tm-btn-sm tm-btn-ghost tm-ps-login" href="/login">로그인</Link>
          <Link className="tm-btn tm-btn-sm tm-btn-neutral" href="/login">시작하기</Link>
          <PublicSiteMobileMenu currentPath={currentPath} />
        </div>
      </div>
    </header>
  );
}
