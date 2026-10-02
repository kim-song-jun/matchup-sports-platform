'use client';

import { useState, type ReactNode } from 'react';
import { PublicResultCount } from './public-sections';
import { PublicFilterChips, usePublicSearch, useRevealHashTarget } from './public-search';

export type PublicBrowserGroup = {
  readonly id: string;
  /** 묶음 section 의 id(딥링크 앵커). */
  readonly sectionId: string;
  readonly label: string;
  readonly description?: string;
  /** 이 묶음에 든 항목의 검색 key. 검색어가 있으면 맞는 개수를 세고, 0이면 묶음을 가린다. */
  readonly keys: readonly string[];
  /** 서버가 그린 항목 목록. 항목마다 PublicSearchItem 으로 감싸야 검색어에 맞춰 가려진다. */
  readonly children: ReactNode;
};

const ALL = 'all';

/**
 * 분류별 묶음 목록(/faq·용어집). 서버 렌더 기본값은 "전체 · 검색어 없음"이라 모든 항목이 HTML 에 실리고,
 * 분류 칩과 검색어는 다른 묶음·항목을 hidden 으로 가릴 뿐 DOM 에서 빼지 않는다.
 * 가려진 항목을 #id 딥링크로 가리키면 분류·검색어를 풀어 그 항목이 보이게 한다.
 */
export function PublicGroupedBrowser({
  filterLabel,
  noun,
  groups,
  layout = 'chips',
  side,
  emptyHint,
}: {
  filterLabel: string;
  /** 결과 개수 문구의 명사(질문 N개 / 용어 N개). */
  noun: string;
  groups: readonly PublicBrowserGroup[];
  layout?: 'chips' | 'rail';
  /** 레일 아래 보조 링크(1024+ 레일 배치에서만 옆에 붙는다). */
  side?: ReactNode;
  /** 검색 결과 0건일 때 목록 자리에 보일 안내. */
  emptyHint?: ReactNode;
}) {
  const [filter, setFilter] = useState<string>(ALL);
  const { active, isMatch, setQuery } = usePublicSearch();
  useRevealHashTarget(() => {
    setFilter(ALL);
    setQuery('');
  });

  const hits = groups.map((group) => group.keys.filter(isMatch).length);
  const total = hits.reduce((sum, count) => sum + count, 0);
  const shown = (index: number) => filter === ALL || filter === groups[index].id;
  const visibleCount = hits.reduce((sum, count, index) => sum + (shown(index) ? count : 0), 0);
  const options = [
    { id: ALL, label: '전체', count: total },
    ...groups.map((group, index) => ({ id: group.id, label: group.label, count: hits[index] })),
  ];

  return (
    <div className="tm-ps-browser" data-layout={layout}>
      <div className="tm-ps-browser-side">
        <PublicFilterChips label={filterLabel} options={options} value={filter} onChange={setFilter} layout={layout} />
        {side}
      </div>
      <div className="tm-ps-browser-main">
        <PublicResultCount count={visibleCount} noun={noun} />
        {active && visibleCount === 0 && emptyHint ? <div className="tm-ps-search-empty">{emptyHint}</div> : null}
        <div className="tm-ps-browser-groups">
          {groups.map((group, index) => {
            const headingId = `${group.sectionId}-heading`;
            const hidden = !shown(index) || (active && hits[index] === 0);
            return (
              <section
                key={group.id}
                id={group.sectionId}
                className="tm-ps-browser-group"
                aria-labelledby={headingId}
                hidden={hidden ? true : undefined}
              >
                <div className="tm-ps-browser-group-head">
                  <h2 id={headingId} className="tm-ps-browser-group-title">{group.label}</h2>
                  {group.description ? <p className="tm-ps-browser-group-desc">{group.description}</p> : null}
                </div>
                {group.children}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
