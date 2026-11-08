'use client';
import { useEffect, useRef } from 'react';

type Item = { id: string; label: string; colorIndex?: number };
/** Native horizontal swipe, with selection reveal confined to this row. */
export function BracketFilterRow({ label, items, activeId, onSelect, showLabel = false, padded = true }: {
  label: string; items: readonly Item[]; activeId: string; onSelect: (id: string) => void; showLabel?: boolean; padded?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  const itemKeys = JSON.stringify(items.map(item => item.id));
  useEffect(() => {
    const row = ref.current;
    const selected = row?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!row || !selected) return;
    const outer = row.getBoundingClientRect(), inner = selected.getBoundingClientRect();
    if (inner.left < outer.left) row.scrollLeft += inner.left - outer.left;
    else if (inner.right > outer.right) row.scrollLeft += inner.right - outer.right;
  }, [activeId, itemKeys]);
  return <div className="tm-bracket-filter-row" style={padded ? undefined : { padding: 0 }}>
    {showLabel ? <p className="tm-text-caption text-[var(--text-muted)]">{label}</p> : null}
    <nav ref={ref} aria-label={label} className="tm-bracket-filter-scroll">
      {items.map(item => <button key={item.id} type="button" className={'tm-chip'+(activeId === item.id ? ' tm-chip-active' : '')} aria-pressed={activeId === item.id} onClick={() => onSelect(item.id)}>
        {item.colorIndex !== undefined ? <span aria-hidden="true" className={'tm-bracket-filter-dot tm-final-color-'+(item.colorIndex % 10)} /> : null}{item.label}
      </button>)}
    </nav>
  </div>;
}
