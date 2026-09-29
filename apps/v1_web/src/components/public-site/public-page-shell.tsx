import type { ReactNode } from 'react';
import { JsonLd } from '@/components/seo/json-ld';
import { buildBreadcrumbLd, type BreadcrumbItem } from '@/lib/structured-data';
import { publicBreadcrumbs } from '@/lib/public-site/structured-data';
import type { PublicSiteInfo } from '@/lib/public-site/site-info';
import { PublicBreadcrumb } from './public-breadcrumb';
import { PublicPageHero, type PublicPageHeroProps } from './public-page-hero';
import { PublicSiteFooter } from './public-site-footer';
import { PublicSiteGnb } from './public-site-gnb';
import { PublicSiteRoot } from './public-site-root';

/**
 * 공개 페이지 셸. `breadcrumbs` 에는 홈(팀밋 → /landing)을 뺀 나머지만 넘긴다.
 * `siteInfo` 는 페이지(서버 컴포넌트)가 `fetchPublicSiteInfo()` 로 받아 넘긴다.
 * `hero` 를 주면 이동 경로가 히어로 지면 안으로 들어간다(화면과 BreadcrumbList 가 같은 배열을 읽는다).
 */
export function PublicPageShell({
  currentPath,
  breadcrumbs,
  siteInfo,
  hero,
  children,
}: {
  currentPath: string;
  breadcrumbs: readonly BreadcrumbItem[];
  siteInfo: PublicSiteInfo;
  hero?: PublicPageHeroProps;
  children: ReactNode;
}) {
  const trail = publicBreadcrumbs(...breadcrumbs);
  return (
    <PublicSiteRoot>
      <a className="tm-ps-skip-link" href="#main">본문 바로가기</a>
      <PublicSiteGnb currentPath={currentPath} />
      <main id="main" className="tm-ps-main" tabIndex={-1}>
        {hero ? (
          <PublicPageHero {...hero} trail={trail} />
        ) : (
          <div className="tm-ps-container">
            <PublicBreadcrumb items={trail} />
          </div>
        )}
        {children}
      </main>
      <PublicSiteFooter siteInfo={siteInfo} />
      <JsonLd data={buildBreadcrumbLd(trail)} />
    </PublicSiteRoot>
  );
}
