import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Lightbulb } from 'lucide-react';
import { GUIDE_ILLUSTRATION, HelpGuideCards } from '@/components/public-help';
import {
  PublicFaqList,
  PublicHelpCtaBand,
  PublicIconCards,
  PublicPageShell,
  PublicSection,
  PublicUpdatedAt,
} from '@/components/public-site';
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

/** 히어로 설명 = 가이드 요약 = meta description = Article LD description(한 문장으로 전체 흐름). */
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
      hero={{
        id: 'guide',
        keyword: '이용 가이드',
        title: guide.title,
        lead: guide.summary,
        illustration: GUIDE_ILLUSTRATION[guide.slug],
        children: (
          <>
            <ul className="tm-help-guide-facts" aria-label="가이드 정보">
              <li><span>대상</span>{guide.audience}</li>
              <li><span>단계</span>{guide.steps.length}단계</li>
            </ul>
            <PublicUpdatedAt date={guide.updatedAt} />
          </>
        ),
      }}
    >
      <PublicSection id="guide-steps" layout="split" keyword="따라 하기" title="순서대로 따라 해 보세요">
        <ol className="tm-help-steps" role="list" aria-labelledby="guide-steps-heading">
          {guide.steps.map((step) => (
            <li key={step.title} className="tm-help-step" data-reveal>
              <div className="tm-help-step-card">
                <h3 className="tm-help-step-title">{step.title}</h3>
                <p className="tm-help-step-body">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </PublicSection>

      {guide.notes.length > 0 ? (
        <PublicSection id="guide-notes" tone="muted" keyword="놓치기 쉬운 것" title="알아 두면 좋아요">
          <PublicIconCards
            columns={2}
            items={guide.notes.map((note) => ({
              key: note.title,
              icon: Lightbulb,
              title: note.title,
              body: note.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>),
            }))}
          />
        </PublicSection>
      ) : null}

      <PublicSection
        id="guide-faq"
        layout="split"
        keyword="관련 질문"
        title="이 가이드와 함께 많이 찾는 질문"
        headExtra={(
          <p className="tm-ps-split-more">
            <Link className="tm-ps-text-link" href="/faq">자주 묻는 질문 전체 보기</Link>
          </p>
        )}
      >
        <PublicFaqList items={faqsByIds(guide.relatedFaqIds)} appearance="cards" />
      </PublicSection>

      <PublicSection id="guide-others" keyword="다른 가이드" title="다른 일도 해 보고 싶다면">
        <HelpGuideCards guides={GUIDES.filter((other) => other.slug !== guide.slug)} columns={3} />
      </PublicSection>

      <PublicHelpCtaBand email={siteInfo.contactEmail} />
      <JsonLd data={buildGuideArticleLd(guide)} />
    </PublicPageShell>
  );
}
