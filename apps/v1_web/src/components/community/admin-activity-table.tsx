import Link from 'next/link';
import type { AdminActivityItemModel } from './admin.types';

export function AdminActivityTable({ items }: { readonly items: readonly AdminActivityItemModel[] }) {
  if (items.length === 0) return <div className="tm-admin-empty">표시할 업무 이력이 없습니다.</div>;
  return (
    <div className="tm-admin-table" role="table" aria-label="업무 이력">
      <div className="tm-admin-table-row tm-admin-table-row-head" role="row">
        <span>업무</span>
        <span>구분</span>
        <span>상세</span>
        <span>일시</span>
      </div>
      {items.map((item) => (
        <div key={item.id} className="tm-admin-table-row tm-admin-table-row-link" role="row" data-tone={item.tone}>
          <Link className="tm-admin-table-row-anchor" href={item.href}>
            <span>{item.title}</span>
            <span>{item.sourceLabel}</span>
            <span>{item.detail}</span>
            <span>{item.occurredAt}</span>
          </Link>
        </div>
      ))}
    </div>
  );
}
