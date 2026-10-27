import { groupPrizeRows, PRIZE_CATEGORIES, formatPrizeRowValue, isPrizeAmountValue, type PrizeRow } from '@/lib/prize-breakdown';
import { SectionTitle } from '@/components/v1-ui/primitives';

/** 상세·시상 결과·어드민 미리보기가 같은 시상 묶음을 표시한다. */
export function GroupedPrizes({ rows, teamByPosition = {} }: {
  rows: readonly PrizeRow[];
  teamByPosition?: Readonly<Partial<Record<number, string>>>;
}) {
  const groups = groupPrizeRows(rows);
  return (
    <div style={{ display: 'grid', gap: 24 }}>
      {PRIZE_CATEGORIES.map((category) => {
        const items = groups.filter((group) => group.category === category);
        if (!items.length) return null;
        return (
          <section key={category} aria-label={category}>
            <SectionTitle title={category} compact />
            <dl style={{ margin: 0 }}>
              {items.map((group, index) => {
                const teamName = group.position !== null ? teamByPosition[group.position] : undefined;
                return (
                  <div key={group.label} style={{ padding: '12px 0', borderTop: index ? '1px solid var(--border)' : undefined, overflowWrap: 'anywhere' }}>
                    <dt style={{ color: 'var(--text-strong)', fontSize: 'var(--font-size-body)', fontWeight: 700 }}>{group.label}</dt>
                    <dd style={{ margin: '6px 0 0', display: 'grid', gap: 4 }}>
                      {teamName && <div style={{ fontSize: 'var(--font-size-label)', fontWeight: 600, color: 'var(--blue700)' }}>{teamName}</div>}
                      {group.amounts.map((amount, itemIndex) => (
                        <div key={itemIndex} style={{ fontSize: 'var(--font-size-body)', fontWeight: isPrizeAmountValue(amount) ? 700 : 400, color: isPrizeAmountValue(amount) ? 'var(--text-strong)' : 'var(--text-body)' }}>
                          {formatPrizeRowValue(amount)}
                        </div>
                      ))}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </section>
        );
      })}
    </div>
  );
}
