import { absoluteSiteUrl } from '@/lib/seo';
import { organizationId, websiteId, type JsonLdNode } from '@/lib/structured-data';
import type { AudiencePage } from '@/lib/public-content/audiences';

/**
 * 대상별 안내(/for/*) WebPage. name·description 은 화면의 H1·리드 문장과 같은 값을 읽는다.
 * FAQPage 는 싣지 않는다 — 같은 Q&A 의 원출처는 /faq 한 곳이고, 여기는 /faq#id 로 연결만 한다.
 */
export function buildAudiencePageLd(page: AudiencePage): JsonLdNode {
  const url = absoluteSiteUrl(page.path);
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': `${url}#webpage`,
    url,
    name: page.title,
    description: page.lead,
    inLanguage: 'ko-KR',
    dateModified: page.updatedAt,
    isPartOf: { '@id': websiteId() },
    publisher: { '@id': organizationId() },
    audience: { '@type': 'Audience', audienceType: page.audienceType },
  };
}
