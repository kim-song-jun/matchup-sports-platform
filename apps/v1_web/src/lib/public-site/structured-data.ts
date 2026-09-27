import { absoluteSiteUrl } from '@/lib/seo';
import { organizationId, type BreadcrumbItem, type JsonLdNode } from '@/lib/structured-data';
import type { FaqItem } from '@/lib/public-content/faq';
import type { GlossaryTerm } from '@/lib/public-content/glossary';

/** 공개 페이지 이동 경로의 첫 칸. 공개 사이트의 "홈"은 소개 페이지(/landing)다. */
export const PUBLIC_SITE_HOME: BreadcrumbItem = { name: '팀밋', path: '/landing' };

/** 홈을 앞에 붙인 이동 경로. 마지막 항목이 현재 페이지다. */
export function publicBreadcrumbs(...items: readonly BreadcrumbItem[]): BreadcrumbItem[] {
  return [PUBLIC_SITE_HOME, ...items];
}

/**
 * FAQPage. 화면에 실제로 렌더되는 질문·답과 1:1 이어야 한다 — 페이지에 보이는 항목만 넘긴다.
 * 답은 본문 문단만 싣는다(링크 라벨·표는 싣지 않는다).
 */
export function buildFaqPageLd(items: readonly FaqItem[], path: string): JsonLdNode {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    url: absoluteSiteUrl(path),
    publisher: { '@id': organizationId() },
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      url: absoluteSiteUrl(`${path}#${item.id}`),
      acceptedAnswer: { '@type': 'Answer', text: item.answer.join(' ') },
    })),
  };
}

export function buildDefinedTermSetLd(terms: readonly GlossaryTerm[], path: string, name: string): JsonLdNode {
  const setUrl = absoluteSiteUrl(path);
  return {
    '@context': 'https://schema.org',
    '@type': 'DefinedTermSet',
    '@id': `${setUrl}#terms`,
    name,
    url: setUrl,
    publisher: { '@id': organizationId() },
    hasDefinedTerm: terms.map((term) => ({
      '@type': 'DefinedTerm',
      '@id': `${setUrl}#${term.id}`,
      name: term.term,
      ...(term.aliases?.length ? { alternateName: [...term.aliases] } : {}),
      description: term.definition,
      inDefinedTermSet: { '@id': `${setUrl}#terms` },
    })),
  };
}
