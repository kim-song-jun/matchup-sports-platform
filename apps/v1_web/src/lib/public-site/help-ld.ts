import { absoluteSiteUrl } from '@/lib/seo';
import { organizationId, type JsonLdNode } from '@/lib/structured-data';
import { guidePath, type Guide } from '@/lib/public-content/guides';

/**
 * 이용 가이드 Article. HowTo 는 싣지 않는다 — 구글이 HowTo 리치 결과를 없앴고, 단계는 화면의
 * 번호 목록으로 충분하다. 게시일은 기록이 없어 지어내지 않고 수정일만 싣는다.
 */
export function buildGuideArticleLd(guide: Guide): JsonLdNode {
  const url = absoluteSiteUrl(guidePath(guide.slug));
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    '@id': `${url}#article`,
    headline: guide.title,
    description: guide.summary,
    url,
    mainEntityOfPage: url,
    inLanguage: 'ko-KR',
    dateModified: guide.updatedAt,
    author: { '@id': organizationId() },
    publisher: { '@id': organizationId() },
  };
}
