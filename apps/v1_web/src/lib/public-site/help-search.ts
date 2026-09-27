/** 클라이언트 컴포넌트가 읽는 검색 도우미. 콘텐츠 데이터를 import 하지 않는다 — 색인 생성은 help-index.ts(서버). */
import type { FaqItem } from '@/lib/public-content/faq';

export type HelpSearchKind = 'faq' | 'guide' | 'term';

/** 도움말 검색 한 줄. 서버가 만들어 클라이언트 검색 컴포넌트에 props 로 넘긴다(서버 요청 없음). */
export type HelpSearchEntry = {
  readonly kind: HelpSearchKind;
  readonly href: string;
  readonly title: string;
  readonly context: string;
  readonly haystack: string;
};

export const HELP_SEARCH_KIND_LABEL: Readonly<Record<HelpSearchKind, string>> = {
  faq: '질문',
  guide: '가이드',
  term: '용어',
};

/** 허브 추천 검색어. 버튼 글자가 곧 검색어다(라벨과 실제 검색어가 어긋나지 않게). */
export const HELP_SUGGESTED_QUERIES = ['환불', '명단', '결과', '팀장'] as const;

export function faqAnchorPath(item: Pick<FaqItem, 'id'>): string {
  return `/faq#${item.id}`;
}

export function faqCategorySectionId(categoryId: string): string {
  return `cat-${categoryId}`;
}

export function normalizeHelpText(value: string): string {
  return value.toLocaleLowerCase('ko-KR').replace(/\s+/g, '');
}

/** 띄어쓰기로 나뉜 낱말이 모두 들어 있는 항목만 남긴다. 낱말 안의 띄어쓰기 차이는 무시한다. */
export function searchHelpIndex(index: readonly HelpSearchEntry[], query: string): HelpSearchEntry[] {
  const tokens = query.split(/\s+/).map(normalizeHelpText).filter(Boolean);
  if (tokens.length === 0) return [];
  return index.filter((entry) => tokens.every((token) => entry.haystack.includes(token)));
}
