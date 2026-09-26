import { absoluteSiteUrl } from '@/lib/seo';
import { organizationId, websiteId, type JsonLdNode } from '@/lib/structured-data';

/**
 * ContactPage. 연락처(contactPoint)는 전역 Organization 한 곳에만 두고 여기서는 `@id` 로 가리킨다 —
 * 새 Organization 을 정의하면 검색엔진이 같은 회사를 두 엔티티로 본다.
 * `name`·`description` 은 화면의 제목·소개 문장과 같은 값을 넘긴다.
 */
export function buildContactPageLd({ path, name, description }: { path: string; name: string; description: string }): JsonLdNode {
  const url = absoluteSiteUrl(path);
  return {
    '@context': 'https://schema.org',
    '@type': 'ContactPage',
    '@id': `${url}#contactpage`,
    url,
    name,
    description,
    inLanguage: 'ko-KR',
    isPartOf: { '@id': websiteId() },
    about: { '@id': organizationId() },
    mainEntity: { '@id': organizationId() },
  };
}
