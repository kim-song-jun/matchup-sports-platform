import Link from 'next/link';
import { BrandMark } from '@/components/v1-ui/brand-logo';
import { businessInfoRows, type PublicSiteInfo } from '@/lib/public-site/site-info';
import { PUBLIC_FOOTER_GROUPS } from './public-site-nav';

/** 사업자 정보 블록. 어드민이 입력하지 않은 항목은 줄째 빠진다. */
export function PublicBusinessInfo({ siteInfo }: { siteInfo: PublicSiteInfo }) {
  const rows = businessInfoRows(siteInfo);
  return (
    <section aria-labelledby="tm-ps-business-heading">
      <h2 id="tm-ps-business-heading" className="sr-only">사업자 정보</h2>
      <dl className="tm-ps-business">
        {rows.map((row) => (
          <div key={row.key} className="tm-ps-business-row">
            <dt>{row.label}</dt>
            <dd>
              {row.key === 'contactEmail'
                ? <a className="tm-ps-footer-inline-link" href={`mailto:${row.value}`}>{row.value}</a>
                : row.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function PublicSiteFooter({ siteInfo }: { siteInfo: PublicSiteInfo }) {
  return (
    <footer className="tm-ps-footer">
      <div className="tm-ps-container">
        <div className="tm-ps-footer-top">
          <div className="tm-ps-footer-brand">
            <BrandMark size={24} />
            <span className="tm-ps-footer-name">teameet</span>
            <span>생활체육 매치·팀·대회 플랫폼</span>
          </div>
          <div className="tm-ps-footer-groups">
            {PUBLIC_FOOTER_GROUPS.map((group) => (
              <nav key={group.title} className="tm-ps-footer-group" aria-label={group.title}>
                <p className="tm-ps-footer-group-title">{group.title}</p>
                <ul>
                  {group.links.map((link) => (
                    <li key={link.href}>
                      <Link className="tm-ps-footer-link" href={link.href}>{link.label}</Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>
        <PublicBusinessInfo siteInfo={siteInfo} />
        <p className="tm-ps-footer-copy">© 2026 teameet. All rights reserved.</p>
      </div>
    </footer>
  );
}
