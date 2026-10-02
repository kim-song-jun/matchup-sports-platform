import Link from 'next/link';
import type { FaqItem } from '@/lib/public-content/faq';
import type { PublicTable } from '@/lib/public-content/types';
import { helpSearchKey } from '@/lib/public-site/help-search';
import { PublicFaqHashOpener } from './public-faq-hash-opener';
import { PublicSearchItem } from './public-search';

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
 * 질문 제자리 펼침 목록. 서버에서 <details>/<summary> 로 렌더해 닫혀 있어도 답이 HTML 에 있다(크롤러·JS 없는 환경).
 * `searchable` 이면 페이지 검색어(PublicSearchProvider)에 맞지 않는 질문을 hidden 으로만 가린다 — DOM 에서 빼지 않는다.
 * `categoryLabels` 를 주면 질문 앞에 주제 이름을 붙인다(여러 주제가 섞인 목록용). FAQPage 와 대조하는
 * 질문 이름은 제목(.tm-ps-faq-question)의 글자다 — summary 전체가 아니다.
 */
export function PublicFaqList({
  items,
  searchable = false,
  headingLevel = 'h3',
  categoryLabels,
  appearance = 'list',
}: {
  items: readonly FaqItem[];
  searchable?: boolean;
  headingLevel?: 'h2' | 'h3' | 'h4';
  categoryLabels?: Readonly<Record<string, string>>;
  appearance?: 'list' | 'cards';
}) {
  const Heading = headingLevel;
  return (
    <div className="tm-ps-faq" data-appearance={appearance}>
      {items.map((item) => {
        const details = (
          <details key={item.id} id={item.id} className="tm-ps-faq-item">
            <summary className="tm-ps-faq-summary">
              {categoryLabels?.[item.category] ? (
                <span className="tm-ps-faq-cat">{categoryLabels[item.category]}</span>
              ) : null}
              <Heading className="tm-ps-faq-question">{item.question}</Heading>
              <span className="tm-ps-faq-chevron" aria-hidden="true" />
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
        );
        return searchable ? (
          <PublicSearchItem key={item.id} as="div" matchKey={helpSearchKey('faq', item.id)}>{details}</PublicSearchItem>
        ) : details;
      })}
      <PublicFaqHashOpener />
    </div>
  );
}
