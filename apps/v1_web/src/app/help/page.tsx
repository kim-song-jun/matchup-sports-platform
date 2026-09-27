import Link from 'next/link';
import { HelpContactCta, HelpGuideCards, HelpQuestionLinks, HelpSearch } from '@/components/public-help';
import { PublicPageShell, PublicSection } from '@/components/public-site';
import { FAQ_CATEGORIES } from '@/lib/public-content/faq';
import { GUIDES } from '@/lib/public-content/guides';
import { buildHelpSearchIndex, popularFaqs } from '@/lib/public-site/help-index';
import { HELP_SUGGESTED_QUERIES, faqCategorySectionId } from '@/lib/public-site/help-search';
import { fetchPublicSiteInfo } from '@/lib/public-site/site-info';
import { buildPublicMetadata } from '@/lib/seo';

const PATH = '/help';

export const metadata = buildPublicMetadata({
  title: '도움말',
  description:
    '팀밋이 처음이라면 여기서 시작하세요. 질문 검색, 매치·팀·대회·결과 이용 가이드 4편, 용어집, 문의 창구를 한곳에 모았어요.',
  path: PATH,
});

/** 허브는 FAQPage JSON-LD 를 싣지 않는다 — 인기 질문은 /faq 문항으로 가는 링크뿐이다. */
export default async function HelpPage() {
  const siteInfo = await fetchPublicSiteInfo();
  return (
    <PublicPageShell currentPath={PATH} breadcrumbs={[{ name: '도움말', path: PATH }]} siteInfo={siteInfo}>
      <PublicSection
        id="help"
        as="h1"
        keyword="도움말"
        title="무엇을 도와드릴까요?"
        lead="매치·팀·대회·결과·환불까지, 궁금한 말을 검색하거나 주제를 골라 보세요."
      >
        <HelpSearch index={buildHelpSearchIndex()} suggestions={HELP_SUGGESTED_QUERIES} />
        <nav className="tm-help-topics" aria-label="주제별 질문">
          <ul>
            {FAQ_CATEGORIES.map((category) => (
              <li key={category.id}>
                <Link className="tm-chip" href={`/faq#${faqCategorySectionId(category.id)}`}>{category.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
      </PublicSection>
      <PublicSection
        id="guides"
        keyword="이용 가이드"
        title="처음이라면, 하고 싶은 일부터 골라 보세요"
        lead="가이드마다 맨 위 한 문장이 전체 흐름이에요."
      >
        <HelpGuideCards guides={GUIDES} />
      </PublicSection>
      <PublicSection id="popular" keyword="자주 찾는 질문" title="많이 묻는 질문부터 확인해 보세요" tone="muted">
        <HelpQuestionLinks items={popularFaqs()} label="자주 찾는 질문" />
        <ul className="tm-help-more-links">
          <li><Link className="tm-ps-text-link" href="/faq">자주 묻는 질문 전체 보기</Link></li>
          <li><Link className="tm-ps-text-link" href="/help/glossary">용어집에서 말뜻 찾기</Link></li>
        </ul>
      </PublicSection>
      <div className="tm-ps-container tm-help-cta-wrap">
        <HelpContactCta showFaqLink={false} />
      </div>
    </PublicPageShell>
  );
}
