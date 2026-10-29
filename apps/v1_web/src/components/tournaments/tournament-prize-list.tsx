'use client';

import { useId, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { formatPrizeRowValue, groupPrizeRows, PRIZE_CATEGORIES, type PrizeRow } from '@/lib/prize-breakdown';

/** The public detail keeps team rewards visible and discloses the remaining categories. */
export function TournamentPrizeList({ rows }: { rows: readonly PrizeRow[] }) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const groups = groupPrizeRows(rows);
  const hasTeamPrizes = groups.some((group) => group.category === '팀 시상');
  let index = 0;
  const awards = groups.map((group) => ({
    ...group,
    amounts: group.amounts.map((amount) => ({ amount, preview: hasTeamPrizes ? group.category === '팀 시상' : index++ < 3 })),
  }));
  const total = awards.reduce((count, group) => count + group.amounts.length, 0);
  const canExpand = awards.some((group) => group.amounts.some((item) => !item.preview));
  const categories = PRIZE_CATEGORIES.map((category) => ({
    category,
    awards: awards.filter((group) => group.category === category && group.amounts.some((item) => expanded || item.preview)),
  })).filter((group) => group.awards.length > 0);
  const Chevron = expanded ? ChevronUp : ChevronDown;
  if (!total) return null;

  return (
    <div>
      <div id={listId} role="group" aria-label="상품 상세 목록">
        {categories.map(({ category, awards: categoryAwards }, categoryIndex) => (
          <section key={category} aria-label={category} style={{ marginBottom: 16, borderTop: categoryIndex ? '1px solid var(--tint-orange-border)' : undefined, paddingTop: categoryIndex ? 16 : undefined }}>
            <h3 className="tm-text-label" style={{ margin: '0 0 12px', color: 'var(--text-strong)', fontWeight: 700 }}>{category}</h3>
            {categoryAwards.map((award) => (
              <div key={award.label} style={{ marginBottom: 12 }}>
                <strong className="tm-text-caption" style={{ display: 'block', color: 'var(--text-strong)', marginBottom: 8 }}>{award.label}</strong>
                <ul aria-label={`${category} · ${award.label}`} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 8, margin: 0, padding: 0, listStyle: 'none' }}>
                  {award.amounts.slice().sort((a, b) => formatPrizeRowValue(a.amount).length - formatPrizeRowValue(b.amount).length).map(({ amount, preview }, itemIndex) => (
                    <li key={itemIndex} hidden={!expanded && !preview} className="tm-on-tint tm-text-caption" style={{ display: !expanded && !preview ? 'none' : undefined, flex: '0 1 auto', minWidth: 0, maxWidth: '100%', padding: '4px 12px', borderRadius: 'var(--radius-container)', background: 'var(--tint-orange)', border: '1px solid var(--tint-orange-border)', color: 'var(--text-body)', overflowWrap: 'anywhere', wordBreak: 'keep-all', whiteSpace: 'normal', lineHeight: 1.6 }}>
                      {formatPrizeRowValue(amount)}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        ))}
      </div>
      {canExpand && (
        <button type="button" aria-expanded={expanded} aria-controls={listId} onClick={() => setExpanded((value) => !value)} className="tm-text-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', minHeight: 44, background: 'transparent', border: 0, borderTop: '1px solid var(--tint-orange-border)', color: 'var(--orange700)', fontWeight: 700, cursor: 'pointer' }}>
          {expanded ? '접기' : `상품 전체 보기 (총 ${total}개)`}
          <Chevron size={16} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
