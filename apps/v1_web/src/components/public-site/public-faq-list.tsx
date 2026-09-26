import Link from 'next/link';
import type { FaqItem } from '@/lib/public-content/faq';
import type { PublicTable } from '@/lib/public-content/types';
import { PublicFaqHashOpener } from './public-faq-hash-opener';

export function PublicContentTable({ table }: { table: PublicTable }) {
  return (
    <div className="tm-ps-table-wrap">
      <table className="tm-ps-table">
        <caption>{table.caption}</caption>
        <thead>
          <tr>{table.columns.map((column) => <th key={column} scope="col">{column}</th>)}</tr>
        </thead>
        <tbody>
          {table.rows.map((row) => (
            <tr key={row.header}>
              <th scope="row">{row.header}</th>
              {row.cells.map((cell, index) => <td key={`${row.header}-${index}`}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * FAQ 아코디언. 서버에서 <details>/<summary> 로 렌더해 닫혀 있어도 답이 HTML 에 있다(크롤러·JS 없는 환경).
 * `hiddenIds` 는 클라이언트 필터가 숨길 질문 — DOM 에서 빼지 않고 hidden 으로만 가린다.
 */
export function PublicFaqList({
  items,
  hiddenIds,
  headingLevel = 'h3',
}: {
  items: readonly FaqItem[];
  hiddenIds?: ReadonlySet<string>;
  headingLevel?: 'h2' | 'h3' | 'h4';
}) {
  const Heading = headingLevel;
  return (
    <div className="tm-ps-faq">
      {items.map((item) => (
        <details key={item.id} id={item.id} className="tm-ps-faq-item" hidden={hiddenIds?.has(item.id) || undefined}>
          <summary className="tm-ps-faq-summary">
            <Heading className="tm-ps-faq-question">{item.question}</Heading>
          </summary>
          <div className="tm-ps-faq-answer">
            {item.answer.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            {item.table ? <PublicContentTable table={item.table} /> : null}
            {item.links?.length ? (
              <ul className="tm-ps-faq-links">
                {item.links.map((link) => (
                  <li key={link.href}><Link className="tm-ps-text-link" href={link.href}>{link.label}</Link></li>
                ))}
              </ul>
            ) : null}
          </div>
        </details>
      ))}
      <PublicFaqHashOpener />
    </div>
  );
}
