import Link from 'next/link';
import type { BreadcrumbItem } from '@/lib/structured-data';

/** 화면의 이동 경로와 BreadcrumbList JSON-LD 가 같은 배열을 읽는다. 마지막 항목이 현재 페이지다. */
export function PublicBreadcrumb({ items }: { items: readonly BreadcrumbItem[] }) {
  return (
    <nav className="tm-ps-breadcrumb" aria-label="이동 경로">
      <ol>
        {items.map((item, index) => (
          <li key={item.path}>
            {index === items.length - 1
              ? <span aria-current="page">{item.name}</span>
              : <Link href={item.path}>{item.name}</Link>}
          </li>
        ))}
      </ol>
    </nav>
  );
}
