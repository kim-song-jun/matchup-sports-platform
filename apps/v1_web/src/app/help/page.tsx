import Link from 'next/link';
import {
  HelpFaqResults,
  HelpGlossaryShortcut,
  HelpGuideCards,
  HelpTopics,
} from '@/components/public-help';
import {
  PublicHelpCtaBand,
  PublicPageShell,
  PublicSearchEmpty,
  PublicSearchField,
  PublicSearchGroup,
  PublicSearchProvider,
  PublicSection,
} from '@/components/public-site';
import { FAQ_CATEGORIES, FAQ_ITEMS, faqById } from '@/lib/public-content/faq';
import { GLOSSARY_TERMS } from '@/lib/public-content/glossary';
import { GUIDES } from '@/lib/public-content/guides';
import {
  HELP_POPULAR_FAQ_IDS,
  faqSearchEntries,
  guideSearchEntries,
  termSearchEntries,
} from '@/lib/public-site/help-index';
import { HELP_SUGGESTED_QUERIES } from '@/lib/public-site/help-search';
import { fetchPublicSiteInfo } from '@/lib/public-site/site-info';
import { buildPublicMetadata } from '@/lib/seo';

const PATH = '/help';

export const metadata = buildPublicMetadata({
  title: '도움말',
  description:
    '팀밋이 처음이라면 여기서 시작하세요. 질문 검색, 매치·팀·대회·결과 이용 가이드 4편, 용어집, 문의 창구를 한곳에 모았어요.',
  path: PATH,
});

const CATEGORY_LABELS = Object.fromEntries(FAQ_CATEGORIES.map((category) => [category.id, category.label]));

/** 히어로 일러스트 옆 예시 카드 — 아래 목록에 이미 있는 질문·용어를 그대로 옮긴다. */
function heroFloats() {
  const question = faqById('match-confirmation');
  const term = GLOSSARY_TERMS.find((item) => item.id === 'pending-result');
  return [
    ...(question ? [{ tag: '자주 찾는 질문', title: question.question, body: question.answer[0] }] : []),
    ...(term ? [{ tag: '용어집', title: term.term, body: term.definition }] : []),
  ];
}

/**
 * 허브. 히어로 검색어가 아래 가이드·질문·용어를 제자리에서 걸러 낸다(서버 요청 없음).
 * FAQPage JSON-LD 는 싣지 않는다 — 질문의 원출처는 /faq 한 곳이다.
 */
export default async function HelpPage() {
  const siteInfo = await fetchPublicSiteInfo();
  const faqEntries = faqSearchEntries(FAQ_ITEMS);
  const guideEntries = guideSearchEntries(GUIDES);
  const termEntries = termSearchEntries(GLOSSARY_TERMS);
  const keys = (entries: readonly { key: string }[]) => entries.map((entry) => entry.key);

  return (
    <PublicSearchProvider entries={[...faqEntries, ...guideEntries, ...termEntries]}>
      <PublicPageShell
        currentPath={PATH}
        breadcrumbs={[{ name: '도움말', path: PATH }]}
        siteInfo={siteInfo}
        hero={{
          id: 'help',
          keyword: '도움말',
          title: (
            <>
              <span className="tm-ps-hero-line">무엇을</span>{' '}
              <span className="tm-ps-hero-line"><em>도와드릴까요?</em></span>
            </>
          ),
          lead: '매치·팀·대회·결과·환불까지, 궁금한 말을 검색하거나 주제를 골라 보세요.',
          illustration: 'auth-notice',
          floats: heroFloats(),
          children: (
            <>
              <PublicSearchField
                label="질문·가이드·용어 검색"
                placeholder="예: 환불, 명단, 결과"
                suggestions={HELP_SUGGESTED_QUERIES}
                announce
              />
              <PublicSearchEmpty>
                <p>
                  다른 낱말로 찾아보거나, <Link className="tm-ps-text-link" href="/faq">자주 묻는 질문 전체</Link>를 훑어보세요.
                  그래도 없다면 <Link className="tm-ps-text-link" href="/contact">문의 창구</Link>로 알려 주세요.
                </p>
              </PublicSearchEmpty>
            </>
          ),
          after: <HelpTopics categories={FAQ_CATEGORIES} items={FAQ_ITEMS} />,
        }}
      >
        <PublicSearchGroup keys={keys(guideEntries)}>
          <PublicSection
            id="guides"
            keyword="이용 가이드"
            title="처음이라면, 하고 싶은 일부터 골라 보세요"
            lead="가이드마다 맨 위 한 문장이 전체 흐름이에요."
          >
            <HelpGuideCards guides={GUIDES} />
          </PublicSection>
        </PublicSearchGroup>
        <PublicSearchGroup keys={[...keys(faqEntries), ...keys(termEntries)]}>
          <PublicSection
            id="popular"
            tone="muted"
            layout="split"
            keyword="자주 찾는 질문"
            title="많이 묻는 질문부터 확인해 보세요"
            headExtra={(
              <>
                <p className="tm-ps-split-more">
                  <Link className="tm-ps-text-link" href="/faq">자주 묻는 질문 전체 보기</Link>
                </p>
                <PublicSearchGroup keys={keys(termEntries)}>
                  <HelpGlossaryShortcut terms={GLOSSARY_TERMS} />
                </PublicSearchGroup>
              </>
            )}
          >
            <HelpFaqResults items={FAQ_ITEMS} popularIds={HELP_POPULAR_FAQ_IDS} categoryLabels={CATEGORY_LABELS} />
          </PublicSection>
        </PublicSearchGroup>
        <PublicHelpCtaBand email={siteInfo.contactEmail} />
      </PublicPageShell>
    </PublicSearchProvider>
  );
}
