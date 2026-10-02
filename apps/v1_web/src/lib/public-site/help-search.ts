/** 클라이언트 컴포넌트가 읽는 검색 도우미. 콘텐츠 데이터를 import 하지 않는다 — 색인 생성은 help-index.ts(서버). */
import type { FaqItem } from '@/lib/public-content/faq';

export type HelpSearchKind = 'faq' | 'guide' | 'term';

/**
 * 검색 색인 한 줄. 서버가 만들어 클라이언트 필터에 props 로 넘긴다(서버 요청 없음).
 * FAQ 와 용어의 id 가 겹칠 수 있어(result-confirmation) key 는 종류를 앞에 붙인다.
 */
export type HelpSearchEntry = {
  readonly key: string;
  readonly haystack: string;
};

export function helpSearchKey(kind: HelpSearchKind, id: string): string {
  return `${kind}:${id}`;
}

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

/**
 * 띄어쓰기로 나뉜 낱말이 모두 들어 있는 항목의 key 만 남긴다. 낱말 안의 띄어쓰기 차이는 무시한다.
 * 검색어가 비어 있으면 null — "거르지 않음"과 "0건"을 구분한다.
 */
export function matchHelpEntries(entries: readonly HelpSearchEntry[], query: string): ReadonlySet<string> | null {
  const tokens = query.split(/\s+/).map(normalizeHelpText).filter(Boolean);
  if (tokens.length === 0) return null;
  return new Set(entries.filter((entry) => tokens.every((token) => entry.haystack.includes(token))).map((entry) => entry.key));
}
