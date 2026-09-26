'use client';

import { useEffect, useState } from 'react';
import { PublicFaqList, PublicResultCount } from '@/components/public-site';
import type { FaqCategory, FaqCategoryId, FaqItem } from '@/lib/public-content/faq';
import { faqCategorySectionId } from '@/lib/public-site/help-search';

type Filter = 'all' | FaqCategoryId;

/**
 * /faq 본문. 서버 렌더 기본값은 "전체"라 모든 질문·답이 HTML 에 실린다(FAQPage JSON-LD 와 1:1).
 * 주제 칩은 다른 주제 묶음을 hidden 으로 가릴 뿐 DOM 에서 빼지 않는다.
 */
export function FaqBrowser({
  categories,
  items,
}: {
  categories: readonly FaqCategory[];
  items: readonly FaqItem[];
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const groups = categories.map((category) => ({
    category,
    items: items.filter((item) => item.category === category.id),
  }));
  const visibleCount = groups
    .filter((group) => filter === 'all' || group.category.id === filter)
    .reduce((sum, group) => sum + group.items.length, 0);

  // 필터로 가려진 질문을 딥링크(#id)로 가리키면 전체로 되돌려 그 질문이 보이게 한다.
  useEffect(() => {
    const revealHashTarget = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id) return;
      const target = document.getElementById(id);
      if (target?.closest('[hidden]')) setFilter('all');
    };
    revealHashTarget();
    window.addEventListener('hashchange', revealHashTarget);
    return () => window.removeEventListener('hashchange', revealHashTarget);
  }, []);

  const chips: { id: Filter; label: string }[] = [
    { id: 'all', label: '전체' },
    ...categories.map((category) => ({ id: category.id, label: category.label })),
  ];

  return (
    <div className="tm-help-faq">
      <div className="tm-help-filter" role="group" aria-label="주제로 좁혀 보기">
        {chips.map((chip) => (
          <button
            key={chip.id}
            type="button"
            className={filter === chip.id ? 'tm-chip tm-chip-active' : 'tm-chip'}
            aria-pressed={filter === chip.id}
            onClick={() => setFilter(chip.id)}
          >
            {chip.label}
          </button>
        ))}
      </div>
      <PublicResultCount count={visibleCount} />
      {groups.map(({ category, items: groupItems }) => {
        const sectionId = faqCategorySectionId(category.id);
        return (
          <section
            key={category.id}
            id={sectionId}
            className="tm-help-group"
            aria-labelledby={`${sectionId}-heading`}
            hidden={filter !== 'all' && filter !== category.id ? true : undefined}
          >
            <h2 id={`${sectionId}-heading`} className="tm-help-group-title">{category.label}</h2>
            <p className="tm-help-group-desc">{category.description}</p>
            <PublicFaqList items={groupItems} headingLevel="h3" />
          </section>
        );
      })}
    </div>
  );
}
