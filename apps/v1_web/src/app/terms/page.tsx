import type { Metadata } from 'next';
import { TermsClient, type FooterTermsFirstValue } from '@/components/auth/terms-client';
import { LEGAL_DOCUMENT_TITLES, legalDocumentForQuery } from '@/components/auth/legal-documents';
import { firstSearchParam } from '@/lib/public-list-seed';
import { fetchPublicV1 } from '@/lib/seo';
import type { V1CurrentTerms } from '@/types/api';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

async function legalDocumentForRequest(searchParams: SearchParams) {
  const params = await searchParams;
  return legalDocumentForQuery(firstSearchParam(params.document), firstSearchParam(params.mode));
}

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const document = await legalDocumentForRequest(searchParams);
  return document ? { title: LEGAL_DOCUMENT_TITLES[document] } : {};
}

// 법적 문서라 새 판을 게시한 직후 옛 판이 나가지 않게 캐시 없이 받는다. 실패하면 첫 값 없이 두고
// 브라우저가 같은 조회를 다시 한다 — 서버 조회 실패가 화면 오류가 되지 않는다.
async function fetchFooterTerms(): Promise<FooterTermsFirstValue | undefined> {
  try {
    const data = await fetchPublicV1<V1CurrentTerms>('/terms/current?context=footer', { cache: 'no-store' });
    if (data === null) {
      console.error('[terms] 약관 서버 조회 404 — 브라우저가 다시 받는다');
      return undefined;
    }
    return { data, fetchedAt: Date.now() };
  } catch (error) {
    console.error('[terms] 약관 서버 조회 실패 — 브라우저가 다시 받는다', error);
    return undefined;
  }
}

export default async function TermsPage({ searchParams }: { searchParams: SearchParams }) {
  // 가입 동의 단계(mode)는 개인별 동의 상태를 다루므로 서버에서 받지 않는다.
  const initialFooterTerms = (await legalDocumentForRequest(searchParams)) ? await fetchFooterTerms() : undefined;
  return <TermsClient initialFooterTerms={initialFooterTerms} />;
}
