import Link from 'next/link';
import {
  PublicFaqList,
  PublicGroupedBrowser,
  PublicHelpCtaBand,
  PublicPageShell,
  PublicSearchField,
  PublicSearchProvider,
  PublicUpdatedAt,
} from '@/components/public-site';
import { JsonLd } from '@/components/seo/json-ld';
import { FAQ_CATEGORIES, FAQ_ITEMS, FAQ_UPDATED_AT } from '@/lib/public-content/faq';
import { faqSearchEntries } from '@/lib/public-site/help-index';
import { faqCategorySectionId, helpSearchKey } from '@/lib/public-site/help-search';
import { fetchPublicSiteInfo } from '@/lib/public-site/site-info';
import { buildFaqPageLd } from '@/lib/public-site/structured-data';
import { buildPublicMetadata } from '@/lib/seo';

const PATH = '/faq';

export const metadata = buildPublicMetadata({
  title: '자주 묻는 질문',
  description:
    '팀밋 가입, 매치 참가, 팀 운영, 대회·리그 참가 신청, 결과 확정, 참가비 환불까지 자주 묻는 질문에 한 문장씩 먼저 답했어요.',
  path: PATH,
});

/**
 * FAQPage JSON-LD 는 사이트에서 이 페이지에만 싣는다. 서버 렌더 기본값(전체 · 검색어 없음)에서
 * 모든 질문·답이 HTML 에 있고 LD 와 1:1 이다 — 분류·검색은 hidden 으로 가릴 뿐이다.
 */
export default async function FaqPage() {
  const siteInfo = await fetchPublicSiteInfo();
  const groups = FAQ_CATEGORIES.map((category) => {
    const items = FAQ_ITEMS.filter((item) => item.category === category.id);
    return {
      id: category.id,
      sectionId: faqCategorySectionId(category.id),
      label: category.label,
      description: category.description,
      keys: items.map((item) => helpSearchKey('faq', item.id)),
      children: <PublicFaqList items={items} headingLevel="h3" searchable />,
    };
  });

  return (
    <PublicSearchProvider entries={faqSearchEntries(FAQ_ITEMS)}>
      <PublicPageShell
        currentPath={PATH}
        breadcrumbs={[{ name: '도움말', path: '/help' }, { name: '자주 묻는 질문', path: PATH }]}
        siteInfo={siteInfo}
        hero={{
          id: 'faq',
          keyword: '자주 묻는 질문',
          title: '궁금한 점, 질문 하나에 답 하나로 정리했어요',
          lead: '질문을 누르면 그 자리에서 답이 펼쳐져요. 검색하거나 주제를 골라 좁혀 볼 수도 있어요.',
          illustration: 'matches-empty',
          children: (
            <>
              <PublicSearchField label="질문 검색" placeholder="예: 환불, 명단, 결과" />
              <PublicUpdatedAt date={FAQ_UPDATED_AT} />
            </>
          ),
        }}
      >
        <section className="tm-ps-section tm-help-browse" aria-label="주제별 질문과 답">
          <div className="tm-ps-container">
            <PublicGroupedBrowser
              filterLabel="주제로 좁혀 보기"
              noun="질문"
              layout="rail"
              groups={groups}
              side={
                <ul className="tm-ps-browser-links">
                  <li><Link className="tm-ps-text-link" href="/help/glossary">용어집에서 말뜻 찾기</Link></li>
                  <li><Link className="tm-ps-text-link" href="/contact">문의 창구 보기</Link></li>
                </ul>
              }
              emptyHint={
                <p>
                  다른 낱말로 찾아보거나 검색어를 지우고 전체 질문을 훑어보세요. 그래도 없다면{' '}
                  <Link className="tm-ps-text-link" href="/contact">문의 창구</Link>로 알려 주세요.
                </p>
              }
            />
          </div>
        </section>
        <PublicHelpCtaBand email={siteInfo.contactEmail} />
        <JsonLd data={buildFaqPageLd(FAQ_ITEMS, PATH)} />
      </PublicPageShell>
    </PublicSearchProvider>
  );
}
