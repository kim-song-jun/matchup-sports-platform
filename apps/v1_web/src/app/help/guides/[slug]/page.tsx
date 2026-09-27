import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { HelpContactCta, HelpGuideCards, HelpQuestionLinks } from '@/components/public-help';
import { PublicPageShell, PublicSection, PublicUpdatedAt } from '@/components/public-site';
import { JsonLd } from '@/components/seo/json-ld';
import { faqsByIds } from '@/lib/public-content/faq';
import { GUIDES, guideBySlug, guidePath } from '@/lib/public-content/guides';
import { buildGuideArticleLd } from '@/lib/public-site/help-ld';
import { fetchPublicSiteInfo } from '@/lib/public-site/site-info';
import { buildPublicMetadata, metadataDescription } from '@/lib/seo';

type Params = { params: Promise<{ slug: string }> };

// 4편만 빌드 때 만든다. 목록 밖 slug 는 렌더를 시도하지 않고 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return GUIDES.map((guide) => ({ slug: guide.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const guide = guideBySlug((await params).slug);
  if (!guide) return {};
  return buildPublicMetadata({
    title: guide.title,
    description: metadataDescription(guide.summary, guide.title),
    path: guidePath(guide.slug),
    type: 'article',
  });
}

export default async function HelpGuidePage({ params }: Params) {
  const guide = guideBySlug((await params).slug);
  if (!guide) notFound();
  const siteInfo = await fetchPublicSiteInfo();
  const path = guidePath(guide.slug);
  return (
    <PublicPageShell
      currentPath={path}
      breadcrumbs={[{ name: '도움말', path: '/help' }, { name: guide.title, path }]}
      siteInfo={siteInfo}
    >
      <PublicSection id="guide" as="h1" keyword="이용 가이드" title={guide.title}>
        <div className="tm-help-article">
          <p className="tm-help-answer">{guide.summary}</p>
          <p className="tm-help-meta">대상: {guide.audience} · {guide.steps.length}단계</p>
          <PublicUpdatedAt date={guide.updatedAt} />

          <h2 id="guide-steps" className="tm-help-h2">순서대로 따라 해 보세요</h2>
          <ol className="tm-help-steps" role="list" aria-labelledby="guide-steps">
            {guide.steps.map((step) => (
              <li key={step.title} className="tm-help-step">
                <h3 className="tm-help-step-title">{step.title}</h3>
                <p className="tm-help-step-body">{step.body}</p>
              </li>
            ))}
          </ol>

          {guide.notes.length > 0 ? (
            <>
              <h2 className="tm-help-h2">알아 두면 좋아요</h2>
              {guide.notes.map((note) => (
                <div key={note.title} className="tm-help-note">
                  <h3 className="tm-help-note-title">{note.title}</h3>
                  {note.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                </div>
              ))}
            </>
          ) : null}

          <h2 className="tm-help-h2">관련 질문</h2>
          <HelpQuestionLinks items={faqsByIds(guide.relatedFaqIds)} label="관련 질문" />

          <h2 className="tm-help-h2">다른 가이드</h2>
          <HelpGuideCards guides={GUIDES.filter((other) => other.slug !== guide.slug)} />
        </div>
      </PublicSection>
      <div className="tm-ps-container tm-help-cta-wrap">
        <HelpContactCta />
      </div>
      <JsonLd data={buildGuideArticleLd(guide)} />
    </PublicPageShell>
  );
}
