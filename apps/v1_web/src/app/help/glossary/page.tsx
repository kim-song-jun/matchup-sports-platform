import Link from 'next/link';
import { HelpQuestionLinks } from '@/components/public-help';
import {
  PublicGroupedBrowser,
  PublicHelpCtaBand,
  PublicPageShell,
  PublicSearchField,
  PublicSearchItem,
  PublicSearchProvider,
  PublicUpdatedAt,
} from '@/components/public-site';
import { JsonLd } from '@/components/seo/json-ld';
import { faqsByIds } from '@/lib/public-content/faq';
import { GLOSSARY_GROUPS, GLOSSARY_TERMS, GLOSSARY_UPDATED_AT } from '@/lib/public-content/glossary';
import { termSearchEntries } from '@/lib/public-site/help-index';
import { helpSearchKey } from '@/lib/public-site/help-search';
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

/** 용어는 분류 순서대로 놓여 있어(content.test) 화면 순서와 DefinedTermSet 순서가 같다. */
export default async function GlossaryPage() {
  const siteInfo = await fetchPublicSiteInfo();
  const groups = GLOSSARY_GROUPS.map((group) => {
    const terms = GLOSSARY_TERMS.filter((term) => term.group === group.id);
    return {
      id: group.id,
      sectionId: `group-${group.id}`,
      label: group.label,
      keys: terms.map((term) => helpSearchKey('term', term.id)),
      children: (
        <ul className="tm-help-terms">
          {terms.map((term) => (
            <PublicSearchItem key={term.id} id={term.id} className="tm-help-term" matchKey={helpSearchKey('term', term.id)}>
              <h3 className="tm-help-term-name">{term.term}</h3>
              {term.aliases?.length ? (
                <p className="tm-help-term-alias">같은 뜻: {term.aliases.join(', ')}</p>
              ) : null}
              <p className="tm-help-term-def">{term.definition}</p>
              {term.detail?.map((paragraph) => <p key={paragraph} className="tm-help-term-detail">{paragraph}</p>)}
              {term.relatedFaqIds?.length ? (
                <HelpQuestionLinks items={faqsByIds(term.relatedFaqIds)} label={`${term.term} 관련 질문`} />
              ) : null}
            </PublicSearchItem>
          ))}
        </ul>
      ),
    };
  });

  return (
    <PublicSearchProvider entries={termSearchEntries(GLOSSARY_TERMS)}>
      <PublicPageShell
        currentPath={PATH}
        breadcrumbs={[{ name: '도움말', path: '/help' }, { name: '용어집', path: PATH }]}
        siteInfo={siteInfo}
        hero={{
          id: 'glossary',
          keyword: '용어집',
          title: '팀밋에서 쓰는 말, 한 문장으로 풀었어요',
          lead: '대회·리그·결과 화면에서 자주 보이는 말의 뜻이에요. 이름이 비슷한 말도 여기서 구분해 두었어요.',
          illustration: 'journey-done',
          children: (
            <>
              <PublicSearchField label="용어 검색" placeholder="예: 승강, 확정 전, 명단" />
              <PublicUpdatedAt date={GLOSSARY_UPDATED_AT} />
            </>
          ),
        }}
      >
        <section className="tm-ps-section tm-help-browse" aria-label="분류별 용어">
          <div className="tm-ps-container">
            <PublicGroupedBrowser
              filterLabel="분류로 좁혀 보기"
              noun="용어"
              groups={groups}
              emptyHint={
                <p>
                  다른 낱말로 찾아보거나 <Link className="tm-ps-text-link" href="/faq">자주 묻는 질문</Link>에서 찾아보세요.
                </p>
              }
            />
          </div>
        </section>
        <PublicHelpCtaBand email={siteInfo.contactEmail} />
        <JsonLd data={buildDefinedTermSetLd(GLOSSARY_TERMS, PATH, SET_NAME)} />
      </PublicPageShell>
    </PublicSearchProvider>
  );
}
