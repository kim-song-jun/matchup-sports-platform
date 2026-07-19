'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import { useV1AdminInquiriesPendingCount } from '@/hooks/use-v1-api';
import {
  LayoutDashboard,
  Users,
  Swords,
  UsersRound,
  Trophy,
  Medal,
  Megaphone,
  PanelsTopLeft,
  MessageSquareText,
  ClipboardList,
  ShieldCheck,
  Settings,
  BellRing,
  ChevronLeft,
  Menu,
  X,
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
}

const BASE_NAV_ITEMS: NavItem[] = [
  { label: '개요', href: '/admin', icon: <LayoutDashboard size={18} />, exact: true },
  { label: '회원', href: '/admin/users', icon: <Users size={18} /> },
  { label: '매치', href: '/admin/matches', icon: <Swords size={18} /> },
  { label: '팀', href: '/admin/teams', icon: <UsersRound size={18} /> },
  { label: '팀매치', href: '/admin/team-matches', icon: <Trophy size={18} /> },
  { label: '대회', href: '/admin/tournaments', icon: <Medal size={18} /> },
  { label: '공지사항', href: '/admin/notices', icon: <Megaphone size={18} /> },
  { label: '팝업', href: '/admin/popups', icon: <PanelsTopLeft size={18} /> },
  { label: '문의', href: '/admin/inquiries', icon: <MessageSquareText size={18} /> },
  { label: '감사 로그', href: '/admin/audit', icon: <ClipboardList size={18} /> },
  { label: '웹 푸시 실패', href: '/admin/ops/push-failures', icon: <BellRing size={18} /> },
  { label: '연동 설정', href: '/admin/settings/integrations', icon: <Settings size={18} /> },
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
}

// ── Helpers ───────────────────────────────────────────────────────────────
function useIsActive(pathname: string) {
  return (item: NavItem) =>
    item.exact ? pathname === item.href : pathname.startsWith(item.href);
}

/** Builds the nav list, optionally appending the owner-only item and the "문의" pending-count badge */
function buildNavItems(canManageAdmins: boolean, pendingInquiryCount?: number): NavItem[] {
  const items = canManageAdmins ? [...BASE_NAV_ITEMS, OWNER_NAV_ITEM] : [...BASE_NAV_ITEMS];
  if (typeof pendingInquiryCount === 'number' && pendingInquiryCount > 0) {
    return items.map((item) =>
      item.href === '/admin/inquiries'
        ? { ...item, badgeCount: pendingInquiryCount, badgeAriaLabel: `미확인 문의 ${pendingInquiryCount}건` }
        : item,
    );
  }
  return items;
}

/** Current section label derived from pathname (for mobile appbar title) */
function useSectionLabel(pathname: string, canManageAdmins: boolean): string {
  const items = buildNavItems(canManageAdmins);
  const match = items.find((item) =>
    item.exact ? pathname === item.href : pathname.startsWith(item.href),
  );
  return match?.label ?? '관리';
}

/** Numeric pill badge shown at the end of a nav link. Caps the visible number at 99+. */
function NavBadge({ count }: { count: number }) {
  return (
    <span
      aria-hidden="true"
      className="ml-auto inline-flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-blue-500 px-1.5 text-[11px] font-semibold leading-none text-white tabular-nums"
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
          ? 'border-blue-500 bg-blue-50/60 text-blue-600 font-semibold'
          : 'border-transparent text-gray-600 hover:bg-gray-50 hover:text-gray-900',
      ].join(' ')}
    >
      <span className={active ? 'text-blue-500' : 'text-gray-400'} aria-hidden="true">
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
  const navItems = buildNavItems(canManageAdmins, pendingInquiryCount);
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
          'fixed inset-y-0 left-0 z-50 w-[280px] bg-white flex flex-col',
          'shadow-[4px_0_24px_rgba(20,28,45,0.12)]',
          'transition-transform motion-reduce:transition-none',
          open ? 'translate-x-0 visible' : '-translate-x-full invisible',
        ].join(' ')}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-4 h-[52px] border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <LayoutDashboard size={17} className="text-blue-500" aria-hidden="true" />
            <span className="text-[15px] font-bold text-gray-900">Teameet 운영</span>
            {adminRoleLabel && (
              <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 rounded-full px-1.5 py-0.5">
                {adminRoleLabel}
              </span>
            )}
          </div>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            aria-label="메뉴 닫기"
            className="flex items-center justify-center w-[44px] h-[44px] rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-1.5 overflow-y-auto" aria-label="주 메뉴">
          {navItems.map((item) => {
            const active = isActive(item);
            const hasBadge = typeof item.badgeCount === 'number' && item.badgeCount > 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                aria-label={hasBadge && item.badgeAriaLabel ? `${item.label} (${item.badgeAriaLabel})` : undefined}
                onClick={onClose}
                className={[
                  'flex items-center gap-3 px-4 py-3 min-h-[44px] text-sm transition-colors border-l-2',
                  'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-[-2px]',
                  active
                    ? 'border-blue-500 bg-blue-50/60 text-blue-600 font-semibold'
                    : 'border-transparent text-gray-600 hover:bg-gray-50 hover:text-gray-900',
                ].join(' ')}
              >
                <span className={active ? 'text-blue-500' : 'text-gray-400'} aria-hidden="true">
                  {item.icon}
                </span>
                <span>{item.label}</span>
                {hasBadge && <NavBadge count={item.badgeCount!} />}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-4 py-4 border-t border-gray-100 shrink-0">
          {adminName && (
            <p className="text-[12px] text-gray-400 mb-2 truncate">{adminName}</p>
          )}
          <Link
            href="/home"
            onClick={onClose}
            className="flex items-center gap-1.5 text-[13px] text-gray-400 hover:text-gray-600 transition-colors min-h-[44px] focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 rounded"
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
export function AdminShell({ children, adminName, adminRoleLabel, canManageAdmins = false }: AdminShellProps) {
  const pathname = usePathname();
  const isActive = useIsActive(pathname);
  const { data: pendingInquiries } = useV1AdminInquiriesPendingCount();
  const navItems = buildNavItems(canManageAdmins, pendingInquiries?.count);
  const sectionLabel = useSectionLabel(pathname, canManageAdmins);
  const [drawerOpen, setDrawerOpen] = useState(false);
  /** Ref for the hamburger button so focus can be restored when the drawer closes (WCAG 2.4.3) */
  const hamburgerRef = useRef<HTMLButtonElement>(null);

  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  // Close drawer on route change
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* ── Desktop sidebar (lg+) ─────────────────────────────────────────── */}
      <aside
        className="hidden lg:flex w-[240px] min-h-screen bg-white border-r border-gray-100 flex-col fixed top-0 left-0 h-screen overflow-y-auto z-30 shrink-0"
        aria-label="관리자 사이드바"
      >
        {/* Brand */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2 min-h-[64px]">
          <LayoutDashboard size={18} className="text-blue-500 shrink-0" aria-hidden="true" />
          <div className="flex flex-col min-w-0">
            <span className="text-[15px] font-bold text-gray-900 leading-tight">Teameet 운영</span>
            {adminRoleLabel && (
              <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 rounded-full px-1.5 py-0.5 w-fit mt-0.5">
                {adminRoleLabel}
              </span>
            )}
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-1.5" aria-label="주 메뉴">
          {navItems.map((item) => (
            <SidebarLink key={item.href} item={item} active={isActive(item)} />
          ))}
        </nav>

        {/* Footer identity + back link */}
        <div className="px-4 py-4 border-t border-gray-100 shrink-0">
          {adminName && (
            <p className="text-[12px] text-gray-400 mb-2 truncate">{adminName}</p>
          )}
          <Link
            href="/home"
            className="flex items-center gap-1.5 text-[13px] text-gray-400 hover:text-gray-600 transition-colors min-h-[44px] focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 rounded"
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
        <header className="lg:hidden sticky top-0 z-20 bg-white border-b border-gray-100 h-[52px] flex items-center px-2">
          <button
            ref={hamburgerRef}
            onClick={openDrawer}
            aria-label="메뉴 열기"
            aria-expanded={drawerOpen}
            aria-controls="admin-drawer"
            className="flex items-center justify-center w-[44px] h-[44px] rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
          >
            <Menu size={20} aria-hidden="true" />
          </button>
          <span className="flex-1 text-center text-[15px] font-bold text-gray-900">
            {sectionLabel}
          </span>
          {/* Right slot placeholder (keeps title centered) */}
          <div className="w-[44px]" aria-hidden="true" />
        </header>

        {/* Page content */}
        <main className="flex-1 px-4 md:px-6 lg:px-8 py-5 md:py-6 lg:py-8">
          <div className="max-w-[1200px] xl:max-w-[1320px] mx-auto w-full">{children}</div>
        </main>
      </div>
    </div>
  );
}
