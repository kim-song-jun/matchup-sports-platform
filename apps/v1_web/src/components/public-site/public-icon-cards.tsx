import type { CSSProperties, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export type PublicIconCard = {
  readonly key: string;
  readonly icon: LucideIcon;
  readonly title: ReactNode;
  readonly body?: ReactNode;
};

/**
 * 아이콘 → 제목 → 본문 카드 목록. 768+ 에서 `columns` 칸(1024+ 에서 3칸은 3칸, 그 아래 2칸)으로 채운다.
 * 카드마다 스크롤 등장(data-reveal)을 걸고 한 줄 안에서만 순서대로 늦춘다.
 */
export function PublicIconCards({
  items,
  columns = 3,
  headingLevel = 'h3',
  label,
}: {
  items: readonly PublicIconCard[];
  columns?: 2 | 3;
  headingLevel?: 'h3' | 'h4';
  label?: string;
}) {
  const Heading = headingLevel;
  return (
    <ul className="tm-ps-cards" data-columns={columns} aria-label={label}>
      {items.map((item, index) => {
        const Icon = item.icon;
        return (
          <li key={item.key} data-reveal style={{ '--i': index % columns } as CSSProperties}>
            <div className="tm-ps-card">
              <span className="tm-ps-card-icon" aria-hidden="true"><Icon size={22} /></span>
              <Heading className="tm-ps-card-title">{item.title}</Heading>
              {item.body ? <div className="tm-ps-card-body">{item.body}</div> : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
