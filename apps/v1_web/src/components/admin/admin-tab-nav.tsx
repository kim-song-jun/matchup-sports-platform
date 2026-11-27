'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { ChevronDown, ExternalLink } from 'lucide-react';
import { ActionMenu } from '@/components/v1-ui/action-menu';
import type { ActionSheetAction } from '@/components/v1-ui/action-sheet';

export interface AdminTabNavItem {
  /** `${basePath}/${slug}` 가 이 섹션의 주소다. */
  slug: string;
  label: string;
  /** 라벨 옆 숫자. 없으면 그리지 않는다. */
  count?: number;
  /** 전역 어드민 화면으로 나가는 항목의 링크. 있으면 `slug` 주소 대신 쓰고 현재 섹션으로는 표시하지 않는다. */
  externalHref?: string;
  /** 섹션 밖으로 나가는 항목을 미리 알리는 한 줄. */
  externalNote?: string;
}

export interface AdminTabNavGroup {
  label: string;
  items: AdminTabNavItem[];
}

export interface AdminTabNavMore {
  label: string;
  groups: readonly { label: string; items: readonly AdminTabNavItem[] }[];
}

export interface AdminTabNavProps {
  ariaLabel: string;
  tabs: readonly AdminTabNavItem[];
  more?: AdminTabNavMore;
  basePath: string;
  pathname: string;
  /** 섹션 링크 뒤에 붙일 쿼리(`?from=…` 처럼 섹션을 옮겨도 이어 가야 하는 값). 셸 밖으로 나가는 링크에는 붙이지 않는다. */
  query?: string;
}

/** 묶음 목록의 앞 `limit` 개를 탭으로, 나머지를 원래 묶음 이름 아래 더보기로 나눈다. 빈 묶음은 버린다. */
export function splitTabGroups(
  groups: readonly AdminTabNavGroup[],
  limit: number,
): { tabs: AdminTabNavItem[]; more: AdminTabNavGroup[] } {
  const tabs: AdminTabNavItem[] = [];
  const more: AdminTabNavGroup[] = [];
  for (const group of groups) {
    const room = Math.max(0, limit - tabs.length);
    tabs.push(...group.items.slice(0, room));
    const rest = group.items.slice(room);
    if (rest.length > 0) more.push({ label: group.label, items: rest });
  }
  return { tabs, more };
}

// 탭 줄은 `overflow-x-auto` 라 바깥으로 그리는 링이 위·아래에서 잘린다 — 안쪽으로 그린다.
const FOCUS_RING = 'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-[-2px]';

function isActive(pathname: string, basePath: string, item: AdminTabNavItem): boolean {
  if (item.externalHref) return false;
  const href = `${basePath}/${item.slug}`;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * 어드민 상세(대회·리그)의 가로 탭 줄 — 자주 쓰는 탭 몇 개와 오른쪽 「더보기」 메뉴.
 * 폰에서는 화면 위쪽에 붙고, 현재 탭은 화면 안으로 스크롤한다.
 * 붙는 위치(`--admin-sticky-top`: 앱바 높이)와 본문 좌우 패딩(`--admin-gutter`)은 호스트가 정한다 — 변수가 없으면 0 이다.
 */
export function AdminTabNav({ ariaLabel, tabs, more, basePath, pathname, query = '' }: AdminTabNavProps) {
  const activeRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    // jsdom 에는 scrollIntoView 가 없다.
    activeRef.current?.scrollIntoView?.({ inline: 'center', block: 'nearest' });
  }, [pathname]);

  const moreActions: ActionSheetAction[] = (more?.groups ?? []).flatMap((group) =>
    group.items.map((item) => ({
      key: item.slug,
      label: item.label,
      href: item.externalHref ?? `${basePath}/${item.slug}${query}`,
      groupLabel: group.label,
      description: item.externalNote,
      icon: item.externalHref ? <ExternalLink size={14} aria-hidden="true" /> : undefined,
    })),
  );
  const moreIsCurrent = (more?.groups ?? []).some((group) => group.items.some((item) => isActive(pathname, basePath, item)));

  return (
    <nav
      aria-label={ariaLabel}
      className="sticky top-[var(--admin-sticky-top,0px)] z-10 -mx-[var(--admin-gutter,0px)] border-b border-[var(--border)] bg-[var(--bg)] px-[var(--admin-gutter,0px)] lg:static lg:mx-0 lg:px-0"
    >
      <div className="flex items-stretch">
        <div className="flex min-w-0 flex-1 overflow-x-auto">
          {tabs.map((tab) => {
            const active = isActive(pathname, basePath, tab);
            const hasCount = typeof tab.count === 'number';
            return (
              <Link
                key={tab.slug}
                ref={active ? activeRef : undefined}
                href={`${basePath}/${tab.slug}${query}`}
                aria-current={active ? 'page' : undefined}
                aria-label={hasCount ? `${tab.label} ${tab.count}` : undefined}
                className={[
                  'inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center gap-1.5 border-b-2 px-3.5 text-[length:var(--font-size-body-sm)] transition-colors whitespace-nowrap',
                  FOCUS_RING,
                  active
                    ? 'border-[var(--text-strong)] font-bold text-[var(--text-strong)]'
                    : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-strong)]',
                ].join(' ')}
              >
                {tab.label}
                {hasCount ? (
                  <span aria-hidden="true" className="font-bold tabular-nums text-[var(--blue700)]">
                    {tab.count!.toLocaleString('ko-KR')}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
        {more && moreActions.length > 0 ? (
          <ActionMenu
            label={more.label}
            align="end"
            actions={moreActions}
            trigger={({ onToggle, 'aria-expanded': expanded, 'aria-haspopup': haspopup }) => (
              <button
                type="button"
                aria-expanded={expanded}
                aria-haspopup={haspopup}
                aria-current={moreIsCurrent ? true : undefined}
                onClick={onToggle}
                className={[
                  'inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center gap-1 border-b-2 px-3.5 text-[length:var(--font-size-body-sm)] transition-colors whitespace-nowrap',
                  FOCUS_RING,
                  moreIsCurrent
                    ? 'border-[var(--text-strong)] font-bold text-[var(--text-strong)]'
                    : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-strong)]',
                ].join(' ')}
              >
                {more.label}
                <ChevronDown size={14} aria-hidden="true" />
              </button>
            )}
          />
        ) : null}
      </div>
    </nav>
  );
}
