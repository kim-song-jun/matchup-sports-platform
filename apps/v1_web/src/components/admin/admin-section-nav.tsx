'use client';

import Link from 'next/link';
import { ExternalLink } from 'lucide-react';

export interface AdminSectionNavItem {
  /** `${basePath}/${slug}` 가 이 섹션의 주소다. */
  slug: string;
  label: string;
  /** 라벨 옆 숫자. 없으면 그리지 않는다. */
  count?: number;
  /**
   * 섹션 밖(전역 어드민 화면)으로 나가는 항목의 링크. 있으면 `slug` 주소 대신 이걸 쓰고
   * 현재 섹션으로는 표시하지 않는다.
   */
  externalHref?: string;
  /** 섹션 밖으로 나가는 항목을 스크린리더에 미리 알리는 문구. */
  externalNote?: string;
}

export interface AdminSectionNavGroup {
  label: string;
  items: AdminSectionNavItem[];
}

/**
 * 어드민 상세(대회·리그)의 섹션 바. 데스크톱은 왼쪽 세로 목록, 모바일은 가로 스크롤 한 줄이다.
 * 대회와 리그가 같은 모양을 쓰도록 한 곳에 둔다 — 두 셸이 각자 그리면 한쪽만 고쳐진다.
 */
export function AdminSectionNav({
  ariaLabel,
  groups,
  basePath,
  pathname,
  query = '',
}: {
  ariaLabel: string;
  groups: AdminSectionNavGroup[];
  basePath: string;
  pathname: string;
  /** 섹션 링크 뒤에 붙일 쿼리(`?from=…` 처럼 섹션을 옮겨도 이어 가야 하는 값). */
  query?: string;
}) {
  return (
    <nav aria-label={ariaLabel} className="lg:w-[184px] lg:shrink-0 lg:sticky lg:top-4 lg:self-start">
      <div className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:gap-0 lg:overflow-visible lg:pb-0">
        {groups.map((group) => (
          <div
            key={group.label}
            role="group"
            aria-label={group.label}
            className="flex shrink-0 gap-1 lg:flex-col lg:gap-0"
          >
            <p className="hidden lg:block px-3 pt-3 pb-1 text-[length:var(--font-size-caption)] font-bold tracking-wide text-[var(--text-caption)]">
              {group.label}
            </p>
            {group.items.map((item) => {
              const sectionHref = `${basePath}/${item.slug}`;
              return (
                <SectionLink
                  key={item.slug}
                  href={item.externalHref ?? `${sectionHref}${query}`}
                  active={!item.externalHref && pathname === sectionHref}
                  label={item.label}
                  count={item.count}
                  leavesShell={Boolean(item.externalHref)}
                  externalNote={item.externalNote}
                />
              );
            })}
          </div>
        ))}
      </div>
    </nav>
  );
}

function SectionLink({
  href,
  active,
  label,
  count,
  leavesShell,
  externalNote,
}: {
  href: string;
  active: boolean;
  label: string;
  count?: number;
  /** 셸 밖(전역 어드민 화면)으로 나가는 링크 — 아이콘과 라벨로 미리 알린다. */
  leavesShell: boolean;
  externalNote?: string;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      aria-label={
        typeof count === 'number' || leavesShell
          ? [label, typeof count === 'number' ? String(count) : '', leavesShell ? (externalNote ?? '') : '']
              .filter(Boolean)
              .join(' ')
          : undefined
      }
      className={[
        'inline-flex shrink-0 items-center justify-between gap-2 min-h-[44px] px-3 rounded-lg text-[length:var(--font-size-label)] transition-colors',
        'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2',
        active
          ? 'bg-[var(--blue50)] text-[var(--blue700)] font-bold'
          : 'text-[var(--text-muted)] hover:bg-[var(--surface-soft)] hover:text-[var(--text-strong)]',
      ].join(' ')}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {leavesShell && <ExternalLink size={12} aria-hidden="true" />}
      </span>
      {typeof count === 'number' && (
        <span
          className={
            active
              ? 'font-semibold tabular-nums text-[var(--blue700)]'
              : 'font-semibold tabular-nums text-[var(--text-muted)]'
          }
          aria-hidden="true"
        >
          {count.toLocaleString('ko-KR')}
        </span>
      )}
    </Link>
  );
}
