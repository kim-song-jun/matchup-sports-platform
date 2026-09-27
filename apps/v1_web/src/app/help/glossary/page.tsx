import { HelpContactCta, HelpQuestionLinks } from '@/components/public-help';
import { PublicPageShell, PublicSection, PublicUpdatedAt } from '@/components/public-site';
import { JsonLd } from '@/components/seo/json-ld';
import { faqsByIds } from '@/lib/public-content/faq';
import { GLOSSARY_TERMS, GLOSSARY_UPDATED_AT } from '@/lib/public-content/glossary';
import { fetchPublicSiteInfo } from '@/lib/public-site/site-info';
import { buildDefinedTermSetLd } from '@/lib/public-site/structured-data';
import { buildPublicMetadata } from '@/lib/seo';

const PATH = '/help/glossary';
const SET_NAME = '팀밋 용어집';

export const metadata = buildPublicMetadata({
  title: '용어집',
  description:
    '정규 대회·정규 리그·리그 방식 대회·확정 전·명단처럼 팀밋 대회와 경기 화면에서 쓰는 말의 뜻을 한 문장으로 풀었어요.',
  path: PATH,
});

export default async function GlossaryPage() {
  const siteInfo = await fetchPublicSiteInfo();
  return (
    <PublicPageShell
      currentPath={PATH}
      breadcrumbs={[{ name: '도움말', path: '/help' }, { name: '용어집', path: PATH }]}
      siteInfo={siteInfo}
    >
      <PublicSection
        id="glossary"
        as="h1"
        keyword="용어집"
        title="팀밋에서 쓰는 말, 한 문장으로 풀었어요"
        lead="대회·리그·결과 화면에서 자주 보이는 말의 뜻이에요. 이름이 비슷한 말도 여기서 구분해 두었어요."
      >
        <PublicUpdatedAt date={GLOSSARY_UPDATED_AT} />
        <nav className="tm-help-toc" aria-label="용어 바로가기">
          <ul>
            {GLOSSARY_TERMS.map((term) => (
              <li key={term.id}><a className="tm-help-toc-link" href={`#${term.id}`}>{term.term}</a></li>
            ))}
          </ul>
        </nav>
        <ul className="tm-help-terms">
          {GLOSSARY_TERMS.map((term) => (
            <li key={term.id} id={term.id} className="tm-help-term">
              <h2 className="tm-help-term-name">{term.term}</h2>
              {term.aliases?.length ? (
                <p className="tm-help-term-alias">같은 뜻: {term.aliases.join(', ')}</p>
              ) : null}
              <p className="tm-help-term-def">{term.definition}</p>
              {term.detail?.map((paragraph) => <p key={paragraph} className="tm-help-term-detail">{paragraph}</p>)}
              {term.relatedFaqIds?.length ? (
                <HelpQuestionLinks items={faqsByIds(term.relatedFaqIds)} label={`${term.term} 관련 질문`} />
              ) : null}
            </li>
          ))}
        </ul>
      </PublicSection>
      <div className="tm-ps-container tm-help-cta-wrap">
        <HelpContactCta />
      </div>
      <JsonLd data={buildDefinedTermSetLd(GLOSSARY_TERMS, PATH, SET_NAME)} />
    </PublicPageShell>
  );
}
