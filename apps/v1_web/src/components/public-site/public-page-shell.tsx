import Link from 'next/link';
import type { ReactNode } from 'react';
import { JsonLd } from '@/components/seo/json-ld';
import { buildBreadcrumbLd, type BreadcrumbItem } from '@/lib/structured-data';
import { publicBreadcrumbs } from '@/lib/public-site/structured-data';
import type { PublicSiteInfo } from '@/lib/public-site/site-info';
import { PublicSiteFooter } from './public-site-footer';
import { PublicSiteHeader } from './public-site-header';

/** 화면의 이동 경로와 BreadcrumbList JSON-LD 가 같은 배열을 읽는다. 마지막 항목이 현재 페이지다. */
export function PublicBreadcrumb({ items }: { items: readonly BreadcrumbItem[] }) {
  return (
    <nav className="tm-ps-breadcrumb" aria-label="이동 경로">
      <ol>
        {items.map((item, index) => (
          <li key={item.path}>
            {index === items.length - 1
              ? <span aria-current="page">{item.name}</span>
              : <Link href={item.path}>{item.name}</Link>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/**
 * 공개 페이지 셸. `breadcrumbs` 에는 홈(팀밋 → /landing)을 뺀 나머지만 넘긴다.
 * `siteInfo` 는 페이지(서버 컴포넌트)가 `fetchPublicSiteInfo()` 로 받아 넘긴다.
 */
export function PublicPageShell({
  currentPath,
  breadcrumbs,
  siteInfo,
  children,
}: {
  currentPath: string;
  breadcrumbs: readonly BreadcrumbItem[];
  siteInfo: PublicSiteInfo;
  children: ReactNode;
}) {
  const trail = publicBreadcrumbs(...breadcrumbs);
  return (
    <div className="tm-ps">
      <a className="tm-ps-skip-link" href="#main">본문 바로가기</a>
      <PublicSiteHeader currentPath={currentPath} />
      <main id="main" className="tm-ps-main" tabIndex={-1}>
        <div className="tm-ps-container">
          <PublicBreadcrumb items={trail} />
        </div>
        {children}
      </main>
      <PublicSiteFooter siteInfo={siteInfo} />
      <JsonLd data={buildBreadcrumbLd(trail)} />
    </div>
  );
}
