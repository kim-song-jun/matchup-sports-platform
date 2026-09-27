import { FaqBrowser, HelpContactCta } from '@/components/public-help';
import { PublicPageShell, PublicSection, PublicUpdatedAt } from '@/components/public-site';
import { JsonLd } from '@/components/seo/json-ld';
import { FAQ_CATEGORIES, FAQ_ITEMS, FAQ_UPDATED_AT } from '@/lib/public-content/faq';
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

/** FAQPage JSON-LD 는 사이트에서 이 페이지에만 싣는다 — 다른 페이지는 여기 문항으로 딥링크한다. */
export default async function FaqPage() {
  const siteInfo = await fetchPublicSiteInfo();
  return (
    <PublicPageShell
      currentPath={PATH}
      breadcrumbs={[{ name: '도움말', path: '/help' }, { name: '자주 묻는 질문', path: PATH }]}
      siteInfo={siteInfo}
    >
      <PublicSection
        id="faq"
        as="h1"
        keyword="자주 묻는 질문"
        title="궁금한 점, 질문 하나에 답 하나로 정리했어요"
        lead="질문을 누르면 답이 펼쳐져요. 주제를 골라 좁혀 볼 수도 있어요."
      >
        <PublicUpdatedAt date={FAQ_UPDATED_AT} />
        <FaqBrowser categories={FAQ_CATEGORIES} items={FAQ_ITEMS} />
      </PublicSection>
      <div className="tm-ps-container tm-help-cta-wrap">
        <HelpContactCta showFaqLink={false} />
      </div>
      <JsonLd data={buildFaqPageLd(FAQ_ITEMS, PATH)} />
    </PublicPageShell>
  );
}
