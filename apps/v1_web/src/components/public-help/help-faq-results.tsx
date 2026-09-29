'use client';

import { PublicFaqList, usePublicSearch } from '@/components/public-site';
import type { FaqItem } from '@/lib/public-content/faq';
import { helpSearchKey } from '@/lib/public-site/help-search';

/**
 * 허브의 질문 목록. 검색어가 없으면 인기 질문, 있으면 전체 질문 가운데 맞는 것을 제자리 펼침으로 보인다.
 * 서버 HTML 에는 인기 질문(답 포함)만 실린다 — 전체 답의 원출처·FAQPage 는 /faq 다.
 */
export function HelpFaqResults({
  items,
  popularIds,
  categoryLabels,
}: {
  items: readonly FaqItem[];
  popularIds: readonly string[];
  categoryLabels: Readonly<Record<string, string>>;
}) {
  const { active, isMatch, query } = usePublicSearch();
  const shown = active
    ? items.filter((item) => isMatch(helpSearchKey('faq', item.id)))
    : popularIds.flatMap((id) => items.filter((item) => item.id === id));

  if (shown.length === 0) return <p className="tm-help-faq-none">검색어에 맞는 질문이 없어요.</p>;
  return (
    <div className="tm-help-faq-results">
      {active ? (
        <p className="tm-help-faq-caption">‘{query.trim()}’에 맞는 질문 {shown.length}개</p>
      ) : null}
      <PublicFaqList items={shown} categoryLabels={categoryLabels} appearance="cards" headingLevel="h3" />
    </div>
  );
}
