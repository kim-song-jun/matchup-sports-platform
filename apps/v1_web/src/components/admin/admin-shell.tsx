'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Fragment, useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import { useV1AdminInquiriesPendingCount } from '@/hooks/use-v1-api';
import { CommandPalette } from './command-palette';
import {
  Inbox,
  LayoutDashboard,
  Search,
  Users,
  Swords,
  UsersRound,
  Trophy,
  ListOrdered,
  Medal,
  Activity,
  Megaphone,
  PanelsTopLeft,
  MessageSquareText,
  ShieldCheck,
  Settings,
  Star,
  Send,
  ScrollText,
  ChevronLeft,
  Menu,
  X,
  Radio,
  Gauge,
  Gavel,
} from 'lucide-react';

// ── Nav items (reviews/notifications removed per task-97 IA) ───────────────
interface NavItem {
  label: string;
  href: string;
  icon: ReactNode;
  exact?: boolean;
  /** Numeric pill badge rendered at the end of the link (e.g. pending inquiry count). Hidden when 0/undefined. */
  badgeCount?: number;
  /** Accessible description appended to the link's aria-label when badgeCount > 0, e.g. "미확인 문의 3건" */
  badgeAriaLabel?: string;
  /**
   * 같은 구획 안의 소구획 라벨. 값이 바뀌는 지점에 얇은 구분선과 캡션을 그린다.
   *
   * 구획을 하나 더 만들지 않고 소구획으로 나눈 이유: 사이드바는 이미 20개 넘는 항목 + 4구획
   * 헤더라 헤더를 늘리면 1080p 에서 첫 화면에 보이는 항목이 더 줄어든다. '운영' 이라는
   * 목적지 이름은 유지한 채 그 안에서 읽기와 쓰기를 가른다.
   */
  subgroup?: string;
  /**
   * 누르면 사용자에게 즉시 영향이 가는 항목(발송·킬스위치). 색만으로 알리지 않는다 —
   * 소구획 캡션('제어 · 발송')이 글자로 같은 사실을 말하고, 톤은 그 위에 얹는 강조다.
   */
  tone?: 'control';
}

/**
 * 사이드바 구획. `label`이 없는 그룹은 구획 헤더 없이 항목만 렌더된다(최상단 "개요").
 *
 * 19개 항목을 평면으로 나열하던 구조를 4구획으로 묶는다 — 성격이 다른 목적지(플랫폼 데이터
 * 관리 / 콘텐츠 / 운영 도구 / 설정)가 같은 시각적 무게로 붙어 있어 운영자가 목적지를 기억으로
 * 찾아야 했다. 항목 자체와 경로는 그대로라 이동 동선은 바뀌지 않는다.
 */
interface NavGroup {
  /** 구획 헤더 텍스트. 없으면 헤더를 그리지 않는다. */
  label?: string;
  items: NavItem[];
}

const BASE_NAV_GROUPS: NavGroup[] = [
  {
    items: [
      { label: '개요', href: '/admin', icon: <LayoutDashboard size={18} />, exact: true },
      { label: '할 일', href: '/admin/hub', icon: <Inbox size={18} /> },
    ],
  },
  {
    label: '플랫폼',
    items: [
      { label: '회원', href: '/admin/users', icon: <Users size={18} /> },
      { label: '매치', href: '/admin/matches', icon: <Swords size={18} /> },
      { label: '팀', href: '/admin/teams', icon: <UsersRound size={18} /> },
      { label: '팀매치', href: '/admin/team-matches', icon: <Trophy size={18} /> },
      // '리그 체계'는 2026-08-25 리그 허브(B안)로 흡수 — /admin/league-matches?tab=series.
      // '결과 이의'는 사용자 확정(2026-08-24)대로 독립 유지.
      { label: '정규 리그', href: '/admin/league-matches', icon: <ListOrdered size={18} /> },
      { label: '결과 이의', href: '/admin/league-match-disputes', icon: <Gavel size={18} /> },
      { label: '대회', href: '/admin/tournaments', icon: <Medal size={18} /> },
    ],
  },
  {
    label: '콘텐츠',
    items: [
      { label: '공지사항', href: '/admin/notices', icon: <Megaphone size={18} /> },
      { label: '팝업', href: '/admin/popups', icon: <PanelsTopLeft size={18} /> },
      { label: '약관', href: '/admin/terms', icon: <ScrollText size={18} /> },
      { label: '문의', href: '/admin/inquiries', icon: <MessageSquareText size={18} /> },
    ],
  },
  {
    label: '운영',
    items: [
      // 살펴보는 화면(위)과 누르면 사용자에게 즉시 영향이 가는 화면(아래 '제어 · 발송')을
      // 분리한다. 감시 4화면(에러·푸시 실패·SMS 실패·감사)은 2026-08-25 모니터링 허브
      // (/admin/monitoring 탭)로 통합됐고 구 URL 은 리다이렉트로 보존된다.
      { label: '대회 현장 운영', href: '/admin/ops/tournaments', icon: <Activity size={18} /> },
      { label: '모니터링', href: '/admin/monitoring', icon: <Gauge size={18} /> },
      { label: '웹 푸시 발송', href: '/admin/ops/push-send', icon: <Send size={18} />, subgroup: '제어 · 발송', tone: 'control' },
      { label: '경기 운영 플래그', href: '/admin/ops/operation-flags', icon: <Radio size={18} />, subgroup: '제어 · 발송', tone: 'control' },
    ],
  },
  {
    label: '설정',
    items: [
      { label: '연동 설정', href: '/admin/settings/integrations', icon: <Settings size={18} /> },
      { label: '후기 정책', href: '/admin/settings/reviews', icon: <Star size={18} /> },
    ],
  },
];

const OWNER_NAV_ITEM: NavItem = {
  label: '관리자',
  href: '/admin/admins',
  icon: <ShieldCheck size={18} />,
};

// ── Props ─────────────────────────────────────────────────────────────────
interface AdminShellProps {
  children: ReactNode;
  /** Admin display name shown in footer identity slot */
  adminName?: string;
  /** Role label shown next to brand e.g. "owner" | "ops" | "support" */
  adminRoleLabel?: string;
  /**
   * When true the "관리자" nav item (/admin/admins) is rendered.
   * Should be set to `true` only for `adminRole === 'owner'`.
   */
  canManageAdmins?: boolean;
  /**
   * 표가 넓은 화면(대진 관리 등)에서 본문 폭 상한을 푼다.
   * 기본값을 넓히지 않는 이유: 대부분의 어드민 화면은 텍스트 문단·폼이라 한 줄이 길어지면
   * 오히려 읽기 어려워진다. 넓힐 이유가 있는 화면만 켠다.
   */
  wide?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────
function useIsActive(pathname: string) {
  return (item: NavItem) =>
    item.exact ? pathname === item.href : pathname.startsWith(item.href);
}

/**
 * Builds the grouped nav, appending the owner-only "관리자" item to the 설정 group and
 * injecting the "문의" pending-count badge.
 */
function buildNavGroups(canManageAdmins: boolean, pendingInquiryCount?: number): NavGroup[] {
  const hasBadge = typeof pendingInquiryCount === 'number' && pendingInquiryCount > 0;
  return BASE_NAV_GROUPS.map((group) => {
    const items = group.items.map((item) =>
      hasBadge && item.href === '/admin/inquiries'
        ? { ...item, badgeCount: pendingInquiryCount, badgeAriaLabel: `미확인 문의 ${pendingInquiryCount}건` }
        : item,
    );
    return group.label === '설정' && canManageAdmins
      ? { ...group, items: [...items, OWNER_NAV_ITEM] }
      : { ...group, items };
  });
}

/** Flattens the grouped nav — used for pathname → label lookup. */
function buildNavItems(canManageAdmins: boolean, pendingInquiryCount?: number): NavItem[] {
  return buildNavGroups(canManageAdmins, pendingInquiryCount).flatMap((group) => group.items);
}

/** Current section label derived from pathname (for mobile appbar title) */
function useSectionLabel(pathname: string, canManageAdmins: boolean): string {
  const items = buildNavItems(canManageAdmins);
  const match = items.find((item) =>
    item.exact ? pathname === item.href : pathname.startsWith(item.href),
  );
  return match?.label ?? '관리';
}

/**
 * Sidebar / drawer section heading. Purely visual — the list semantics stay on the links.
 *
 * 높이를 아끼는 이유: 사이드바는 항목 19개(19×44px)만으로도 이미 1080p 뷰포트를 넘긴다.
 * 구획 라벨을 44px(터치 타겟 크기)로 두면 4구획이 176px를 더해 넘침이 두 배가 된다 —
 * 라벨은 클릭 대상이 아니므로 44px 규칙 대상이 아니고, 읽히는 최소 높이만 준다.
 */
function NavGroupLabel({ label }: { label: string }) {
  return (
    <p className="px-4 pt-3 pb-1 leading-none text-[length:var(--font-size-caption)] font-bold tracking-wide text-[var(--text-caption)]">
      {label}
    </p>
  );
}

/** 구획 안의 소구획 캡션. 구획 헤더보다 한 단계 약하게 — 새 목적지가 아니라 경계 표시다. */
function NavSubgroupLabel({ label }: { label: string }) {
  return (
    <p className="mt-2 border-t border-[var(--border)] px-4 pt-2 pb-1 leading-none text-[length:var(--font-size-micro)] font-semibold text-[var(--text-caption)]">
      {label}
    </p>
  );
}

/** Numeric pill badge shown at the end of a nav link. Caps the visible number at 99+. */
function NavBadge({ count }: { count: number }) {
  return (
    <span
      aria-hidden="true"
      className="ml-auto inline-flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-blue-500 px-1.5 text-[length:var(--font-size-caption)] font-semibold leading-none text-white tabular-nums"
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

// ── Sidebar nav link (desktop) ────────────────────────────────────────────
function SidebarLink({ item, active }: { item: NavItem; active: boolean }) {
  const hasBadge = typeof item.badgeCount === 'number' && item.badgeCount > 0;
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      aria-label={hasBadge && item.badgeAriaLabel ? `${item.label} (${item.badgeAriaLabel})` : undefined}
      className={[
        'flex items-center gap-3 px-4 py-2.5 min-h-[44px] text-sm transition-colors border-l-2',
        'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-[-2px]',
        active
          ? 'border-blue-500 bg-[var(--blue50)]/60 text-[var(--blue700)] font-semibold'
          : 'border-transparent text-[var(--text-muted)] hover:bg-[var(--surface-soft)] hover:text-[var(--text-strong)]',
      ].join(' ')}
    >
      <span
        className={active ? 'text-blue-500' : item.tone === 'control' ? 'text-[var(--orange700)]' : 'text-[var(--text-muted)]'}
        aria-hidden="true"
      >
        {item.icon}
      </span>
      <span>{item.label}</span>
      {hasBadge && <NavBadge count={item.badgeCount!} />}
    </Link>
  );
}

// ── Off-canvas drawer (mobile) ────────────────────────────────────────────
interface DrawerProps {
  open: boolean;
  onClose: () => void;
  adminName?: string;
  adminRoleLabel?: string;
  pathname: string;
  canManageAdmins: boolean;
  /** Pending (received/reviewing) 문의 count shown as a badge next to the "문의" nav item */
  pendingInquiryCount?: number;
  /** Ref to the hamburger button — focus is restored here when the drawer closes (WCAG 2.4.3) */
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}

function Drawer({
  open,
  onClose,
  adminName,
  adminRoleLabel,
  pathname,
  canManageAdmins,
  pendingInquiryCount,
  triggerRef,
}: DrawerProps) {
  const isActive = useIsActive(pathname);
  const navGroups = buildNavGroups(canManageAdmins, pendingInquiryCount);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Focus the close button when the drawer opens; restore focus to the trigger when it closes (WCAG 2.4.3)
  useEffect(() => {
    if (open) {
      // Slight delay to ensure CSS transition has started
      const id = setTimeout(() => closeButtonRef.current?.focus(), 50);
      return () => clearTimeout(id);
    } else {
      // Return focus to the element that opened the drawer
      triggerRef.current?.focus();
    }
  }, [open, triggerRef]);

  // Apply/remove the `inert` attribute via DOM ref to avoid JSX type conflicts (WCAG 2.1.1)
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    if (open) {
      panel.removeAttribute('inert');
    } else {
      panel.setAttribute('inert', '');
    }
  }, [open]);

  // ESC to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Focus trap
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;

    const focusableSelectors =
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

    const trapFocus = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(focusableSelectors));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', trapFocus);
    return () => document.removeEventListener('keydown', trapFocus);
  }, [open]);

  // Prevent body scroll while drawer is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className={[
          'fixed inset-0 z-40 bg-gray-900/40 backdrop-blur-[2px] transition-opacity',
          'motion-reduce:transition-none',
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        ].join(' ')}
      />

      {/* Panel — hidden from AT and keyboard when closed (WCAG 2.1.1 / 2.4.3) */}
      <div
        ref={panelRef}
        id="admin-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="관리자 메뉴"
        aria-hidden={!open}
        className={[
          'fixed inset-y-0 left-0 z-50 w-[280px] bg-[var(--card-surface)] flex flex-col',
          'shadow-[var(--shadow-sidebar)]',
          'transition-transform motion-reduce:transition-none',
          open ? 'translate-x-0 visible' : '-translate-x-full invisible',
        ].join(' ')}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-4 h-[52px] border-b border-[var(--border)] shrink-0">
          <div className="flex items-center gap-2">
            <LayoutDashboard size={17} className="text-blue-500" aria-hidden="true" />
            <span className="text-[15px] font-bold text-[var(--text-strong)]">Teameet 운영</span>
            {/* [알파 감사 C] ops shell 역할 배지 — 알파 실측 지적(10px → 12px). */}
            {adminRoleLabel && (
              <span className="text-[length:var(--font-size-caption)] font-semibold text-[var(--blue700)] bg-[var(--blue50)] rounded-full px-1.5 py-0.5">
                {adminRoleLabel}
              </span>
            )}
          </div>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            aria-label="메뉴 닫기"
            className="flex items-center justify-center w-[44px] h-[44px] rounded-lg text-[var(--text-muted)] hover:text-[var(--text-body)] hover:bg-[var(--surface-soft)] transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-1.5 overflow-y-auto" aria-label="주 메뉴">
          {navGroups.map((group, index) => (
            <div
              key={group.label ?? `nav-group-${index}`}
              role={group.label ? 'group' : undefined}
              aria-label={group.label}
            >
              {group.label && <NavGroupLabel label={group.label} />}
              {group.items.map((item, itemIndex) => {
                const active = isActive(item);
                const hasBadge = typeof item.badgeCount === 'number' && item.badgeCount > 0;
                const subgroupStart =
                  item.subgroup && item.subgroup !== group.items[itemIndex - 1]?.subgroup
                    ? item.subgroup
                    : null;
                return (
                  <Fragment key={item.href}>
                  {subgroupStart && <NavSubgroupLabel label={subgroupStart} />}
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    aria-label={hasBadge && item.badgeAriaLabel ? `${item.label} (${item.badgeAriaLabel})` : undefined}
                    onClick={onClose}
                    className={[
                      'flex items-center gap-3 px-4 py-3 min-h-[44px] text-sm transition-colors border-l-2',
                      'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-[-2px]',
                      active
                        ? 'border-blue-500 bg-[var(--blue50)]/60 text-[var(--blue700)] font-semibold'
                        : 'border-transparent text-[var(--text-muted)] hover:bg-[var(--surface-soft)] hover:text-[var(--text-strong)]',
                    ].join(' ')}
                  >
                    <span
                      className={active ? 'text-blue-500' : item.tone === 'control' ? 'text-[var(--orange700)]' : 'text-[var(--text-muted)]'}
                      aria-hidden="true"
                    >
                      {item.icon}
                    </span>
                    <span>{item.label}</span>
                    {hasBadge && <NavBadge count={item.badgeCount!} />}
                  </Link>
                  </Fragment>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-4 py-4 border-t border-[var(--border)] shrink-0">
          {adminName && (
            <p className="text-[12px] text-[var(--text-muted)] mb-2 truncate">{adminName}</p>
          )}
          <Link
            href="/home"
            onClick={onClose}
            className="flex items-center gap-1.5 text-[13px] text-[var(--text-muted)] hover:text-[var(--text-strong)] transition-colors min-h-[44px] focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 rounded"
          >
            <ChevronLeft size={14} aria-hidden="true" />
            서비스로 돌아가기
          </Link>
        </div>
      </div>
    </>
  );
}

// ── Shell ─────────────────────────────────────────────────────────────────
export function AdminShell({ children, adminName, adminRoleLabel, canManageAdmins = false, wide = false }: AdminShellProps) {
  const pathname = usePathname();
  const isActive = useIsActive(pathname);
  const { data: pendingInquiries } = useV1AdminInquiriesPendingCount();
  const navGroups = buildNavGroups(canManageAdmins, pendingInquiries?.count);
  const sectionLabel = useSectionLabel(pathname, canManageAdmins);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  /** Ref for the hamburger button so focus can be restored when the drawer closes (WCAG 2.4.3) */
  const hamburgerRef = useRef<HTMLButtonElement>(null);

  // ⌘K / Ctrl+K — 어드민 어디서든 전역 검색 팔레트를 연다
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  // Close drawer on route change
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  return (
    <div className="min-h-screen bg-[var(--bg)] flex">
      {/* ── Desktop sidebar (lg+) ─────────────────────────────────────────── */}
      <aside
        className="hidden lg:flex w-[240px] min-h-screen bg-[var(--card-surface)] border-r border-[var(--border)] flex-col fixed top-0 left-0 h-screen overflow-y-auto z-30 shrink-0"
        aria-label="관리자 사이드바"
      >
        {/* Brand */}
        <div className="px-5 py-4 border-b border-[var(--border)] flex items-center gap-2 min-h-[64px]">
          <LayoutDashboard size={18} className="text-blue-500 shrink-0" aria-hidden="true" />
          <div className="flex flex-col min-w-0">
            <span className="text-[15px] font-bold text-[var(--text-strong)] leading-tight">Teameet 운영</span>
            {/* [알파 감사 C] ops shell 역할 배지 — 알파 실측 지적(10px → 12px). */}
            {adminRoleLabel && (
              <span className="text-[length:var(--font-size-caption)] font-semibold text-[var(--blue700)] bg-[var(--blue50)] rounded-full px-1.5 py-0.5 w-fit mt-0.5">
                {adminRoleLabel}
              </span>
            )}
          </div>
        </div>

        {/* 전역 검색 트리거 */}
        <div className="px-3 pt-3">
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            aria-label="전역 검색 열기 (Cmd+K)"
            className="flex w-full items-center gap-2 min-h-[40px] rounded-lg border border-[var(--border)] bg-[var(--surface-soft)] px-3 text-[13px] text-[var(--text-muted)] hover:border-blue-300 hover:text-[var(--text-body)] transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
          >
            <Search size={14} aria-hidden="true" />
            <span className="flex-1 text-left">회원·팀·매치 검색</span>
            <kbd className="rounded border border-[var(--border)] bg-[var(--card-surface)] px-1.5 py-0.5 text-[length:var(--font-size-micro)]">⌘K</kbd>
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-1.5" aria-label="주 메뉴">
          {navGroups.map((group, index) => (
            <div
              key={group.label ?? `nav-group-${index}`}
              role={group.label ? 'group' : undefined}
              aria-label={group.label}
            >
              {group.label && <NavGroupLabel label={group.label} />}
              {group.items.map((item, itemIndex) => (
                <Fragment key={item.href}>
                  {item.subgroup && item.subgroup !== group.items[itemIndex - 1]?.subgroup && (
                    <NavSubgroupLabel label={item.subgroup} />
                  )}
                  <SidebarLink item={item} active={isActive(item)} />
                </Fragment>
              ))}
            </div>
          ))}
        </nav>

        {/* Footer identity + back link */}
        <div className="px-4 py-4 border-t border-[var(--border)] shrink-0">
          {adminName && (
            <p className="text-[12px] text-gray-400 mb-2 truncate">{adminName}</p>
          )}
          <Link
            href="/home"
            className="flex items-center gap-1.5 text-[13px] text-gray-400 hover:text-[var(--text-muted)] transition-colors min-h-[44px] focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 rounded"
          >
            <ChevronLeft size={14} aria-hidden="true" />
            서비스로 돌아가기
          </Link>
        </div>
      </aside>

      {/* ── Mobile off-canvas drawer (<lg) ────────────────────────────────── */}
      <div className="lg:hidden">
        <Drawer
          open={drawerOpen}
          onClose={closeDrawer}
          adminName={adminName}
          adminRoleLabel={adminRoleLabel}
          pathname={pathname}
          canManageAdmins={canManageAdmins}
          pendingInquiryCount={pendingInquiries?.count}
          triggerRef={hamburgerRef}
        />
      </div>

      {/* ── Right column: appbar + main ───────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 lg:pl-[240px]">
        {/* Mobile sticky appbar (<lg) */}
        <header className="lg:hidden sticky top-0 z-20 bg-[var(--card-surface)] border-b border-[var(--border)] h-[52px] flex items-center px-2">
          <button
            ref={hamburgerRef}
            onClick={openDrawer}
            aria-label="메뉴 열기"
            aria-expanded={drawerOpen}
            aria-controls="admin-drawer"
            className="flex items-center justify-center w-[44px] h-[44px] rounded-lg text-[var(--text-muted)] hover:text-[var(--text-body)] hover:bg-[var(--surface-soft)] transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
          >
            <Menu size={20} aria-hidden="true" />
          </button>
          <span className="flex-1 text-center text-[15px] font-bold text-[var(--text-strong)]">
            {sectionLabel}
          </span>
          {/* Right slot: 전역 검색 (제목 중앙 정렬 유지 — 좌측 햄버거와 같은 44px) */}
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            aria-label="전역 검색 열기"
            className="flex items-center justify-center w-[44px] h-[44px] rounded-lg text-[var(--text-muted)] hover:text-[var(--text-body)] hover:bg-[var(--surface-soft)] transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
          >
            <Search size={19} aria-hidden="true" />
          </button>
        </header>

        {/* Page content */}
        <main className="flex-1 px-4 md:px-6 lg:px-8 py-5 md:py-6 lg:py-8">
          <div className={`${wide ? 'max-w-none' : 'max-w-[1200px] xl:max-w-[1320px]'} mx-auto w-full`}>{children}</div>
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
