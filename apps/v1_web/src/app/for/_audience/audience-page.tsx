import Link from 'next/link';
import type { Metadata } from 'next';
import {
  PublicContentTable,
  PublicHonestNote,
  PublicPageShell,
  PublicSection,
  PublicUpdatedAt,
} from '@/components/public-site';
import { JsonLd } from '@/components/seo/json-ld';
import { AUDIENCE_PAGES, audienceBySlug, type AudiencePage, type AudienceSlug } from '@/lib/public-content/audiences';
import { faqsByIds } from '@/lib/public-content/faq';
import { guideBySlug, guidePath } from '@/lib/public-content/guides';
import { buildAudiencePageLd } from '@/lib/public-site/audience-ld';
import type { PublicSiteInfo } from '@/lib/public-site/site-info';
import { buildPublicMetadata } from '@/lib/seo';

/** 페이지 파일의 정적 `metadata` export 용. 세션·요청에 기대지 않는다. */
export function audienceMetadata(slug: AudienceSlug): Metadata {
  const page = audienceBySlug(slug);
  return buildPublicMetadata({ title: page.metaTitle, description: page.metaDescription, path: page.path });
}

function PointList({ points }: { points: AudiencePage['points'] }) {
  return (
    <ul className="tm-ps-aud-points">
      {points.map((point) => (
        <li key={point.title} className="tm-ps-aud-point">
          <h3 className="tm-ps-aud-point-title">{point.title}</h3>
          <p>{point.body}</p>
        </li>
      ))}
    </ul>
  );
}

function StepList({ steps }: { steps: AudiencePage['steps'] }) {
  return (
    <ol className="tm-ps-aud-steps" role="list">
      {steps.map((step, index) => (
        <li key={step.title} className="tm-ps-aud-step">
          <span className="tm-ps-aud-step-num" aria-hidden="true">{index + 1}</span>
          <div>
            <h3 className="tm-ps-aud-point-title">{step.title}</h3>
            <p>{step.body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function CtaRow({ page }: { page: AudiencePage }) {
  const [primary, ...rest] = page.ctas;
  return (
    <div className="tm-ps-aud-ctas">
      <Link className="tm-btn tm-btn-lg tm-btn-primary" href={primary.href}>{primary.label}</Link>
      {rest.map((cta) => (
        <Link key={cta.href} className="tm-btn tm-btn-lg tm-btn-outline" href={cta.href}>{cta.label}</Link>
      ))}
    </div>
  );
}

export function AudiencePageView({ slug, siteInfo }: { slug: AudienceSlug; siteInfo: PublicSiteInfo }) {
  const page = audienceBySlug(slug);
  const faqs = faqsByIds(page.relatedFaqIds);
  const guide = guideBySlug(page.relatedGuideSlug);
  if (!guide) throw new Error(`Unknown guide: ${page.relatedGuideSlug}`);
  const others = AUDIENCE_PAGES.filter((item) => item.slug !== page.slug);

  return (
    <PublicPageShell currentPath={page.path} breadcrumbs={[{ name: page.metaTitle, path: page.path }]} siteInfo={siteInfo}>
      <div className="tm-ps-aud">
        <PublicSection id="intro" as="h1" keyword={page.keyword} title={page.title} lead={page.lead}>
          <CtaRow page={page} />
          {page.heroNote ? <p className="tm-ps-aud-note">{page.heroNote}</p> : null}
          <dl className="tm-ps-aud-facts">
            {page.facts.map((fact) => (
              <div key={fact.label} className="tm-ps-aud-fact">
                <dt>{fact.label}</dt>
                <dd>{fact.value}</dd>
              </div>
            ))}
          </dl>
          <PublicUpdatedAt date={page.updatedAt} />
        </PublicSection>

        <PublicSection id="what" keyword={page.pointsHead.keyword} title={page.pointsHead.title} lead={page.pointsHead.lead}>
          <PointList points={page.points} />
        </PublicSection>

        {page.roleTable ? (
          <PublicSection id="roles" keyword={page.roleTable.keyword} title={page.roleTable.title} lead={page.roleTable.lead}>
            <PublicContentTable table={page.roleTable.table} />
            {page.roleTable.note ? <p className="tm-ps-aud-note">{page.roleTable.note}</p> : null}
          </PublicSection>
        ) : null}

        <PublicSection id="start" tone="muted" keyword={page.stepsHead.keyword} title={page.stepsHead.title} lead={page.stepsHead.lead}>
          <StepList steps={page.steps} />
          <PublicHonestNote items={page.notYet} />
          <CtaRow page={page} />
        </PublicSection>

        <PublicSection id="faq" keyword="자주 묻는 질문" title="먼저 많이 물어보는 것들이에요">
          <ul className="tm-ps-aud-faq">
            {faqs.map((faq) => (
              <li key={faq.id}>
                <h3 className="tm-ps-aud-point-title">
                  <Link className="tm-ps-aud-faq-link" href={`/faq#${faq.id}`}>{faq.question}</Link>
                </h3>
                <p>{faq.answer[0]}</p>
              </li>
            ))}
          </ul>
          <ul className="tm-ps-aud-more">
            <li><Link className="tm-ps-text-link" href={guidePath(guide.slug)}>가이드: {guide.title}</Link></li>
            <li><Link className="tm-ps-text-link" href="/faq">자주 묻는 질문 전체 보기</Link></li>
          </ul>
        </PublicSection>

        <PublicSection id="others" keyword="다른 이용 대상" title="다른 입장에서도 살펴보세요">
          <ul className="tm-ps-aud-others">
            {others.map((other) => (
              <li key={other.slug}>
                <Link className="tm-ps-aud-other" href={other.path}>
                  <span className="tm-ps-aud-other-label">{other.metaTitle}</span>
                  <span>{other.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        </PublicSection>
      </div>

      <JsonLd data={buildAudiencePageLd(page)} />
    </PublicPageShell>
  );
}
