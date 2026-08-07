'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ChevronLeft,
  ClipboardCheck,
  LayoutDashboard,
  Menu,
  PencilLine,
  ShieldCheck,
  X,
} from 'lucide-react';
import type { V1TournamentStaffRole } from '@/types/api';
import { staffRoleLabel } from './badges';

// ── 대회 아이덴티티 배지 ──────────────────────────────────────────────────
/**
 * 셸 전체가 대회마다 똑같이 생긴 문제(고정된 파란 클립보드 아이콘 + 작은 텍스트뿐)를
 * 고친다. 커버 이미지가 있으면 그대로 쓰고, 없으면 대회 id를 해시해 고정된 색상 +
 * 이니셜을 보여준다 — 같은 대회는 새로고침해도 항상 같은 색이 나오고, 대회가
 * 바뀌면 다른 색이 나와서 "지금 어느 대회 안에 있는지"가 사이드바 색만 봐도 구분된다.
 */
const IDENTITY_PALETTE = [
  { bg: '#EAF2FF', fg: '#1B64DA' },
  { bg: '#FDF0E7', fg: '#B4530A' },
  { bg: '#EAF9F1', fg: '#0F8A56' },
  { bg: '#F5EEFB', fg: '#7C3FC9' },
  { bg: '#FDEEF0', fg: '#C23A56' },
  { bg: '#EAF6FA', fg: '#0B7A94' },
];

function hashToIndex(id: string, size: number): number {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return hash % size;
}

function TournamentEmblem({
  tournamentId,
  coverImageUrl,
  title,
  size = 32,
}: {
  tournamentId: string;
  coverImageUrl?: string | null;
  title?: string;
  size?: number;
}) {
  if (coverImageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- 대회 커버는 외부 업로드 URL, next/image 도메인 화이트리스트 밖일 수 있어 원본 태그를 유지한다.
      <img
        src={coverImageUrl}
        alt=""
        aria-hidden="true"
        width={size}
        height={size}
        style={{ width: size, height: size, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }}
      />
    );
  }
  const palette = IDENTITY_PALETTE[hashToIndex(tournamentId, IDENTITY_PALETTE.length)];
  const initial = title?.trim()?.[0] ?? '대';
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: 8,
        background: palette.bg,
        color: palette.fg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.45,
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {initial}
    </span>
  );
}

// ── Nav ───────────────────────────────────────────────────────────────────
interface NavItem {
  label: string;
  href: string;
  icon: ReactNode;
}

/**
 * 배정 인식 내비게이션(assignment-aware navigation) — 이 셸에 진입할 수 있는 역할은
 * platform_ops/tournament_director/support_readonly뿐이다(field_operator는 대회 전역
 * 리소스 read 권한이 없어 게이트에서 걸러진다. `_gate.tsx` 참고).
 *
 * 운영 보드·스태프는 세 역할 전부 조회 가능하므로 항상 노출한다. 결과 검토·결과 정정은
 * 원장(screens A-03/A-04)이 tournament_director / platform_ops 로 제한하므로 그 두 역할에만
 * 노출한다 — support_readonly 에게 열어두면 열자마자 막히는 링크가 된다.
 *
 * 이 두 항목은 원래 여기 없었다. 라우트는 존재하는데 진입 링크가 어디에도 없어 URL 을 직접
 * 아는 사람만 갈 수 있는 고아 라우트였다(여정 검수 major 2건). 화면을 만들 때 셸의 nav 를
 * 함께 갱신하지 않으면 같은 일이 반복되므로, 라우트를 추가하는 쪽에서 이 목록도 같이 본다.
 */
function buildNavItems(tournamentId: string, role: V1TournamentStaffRole): NavItem[] {
  const base = `/tournament-ops/tournaments/${tournamentId}`;
  const canManageResults = role === 'TOURNAMENT_DIRECTOR' || role === 'PLATFORM_OPS';
  return [
    {
      label: '운영 보드',
      href: `${base}/operations`,
      icon: <LayoutDashboard size={18} aria-hidden="true" />,
    },
    ...(canManageResults
      ? [
          {
            label: '결과 검토',
            href: `${base}/result-review`,
            icon: <ClipboardCheck size={18} aria-hidden="true" />,
          },
          {
            label: '결과 정정',
            href: `${base}/records/corrections`,
            icon: <PencilLine size={18} aria-hidden="true" />,
          },
        ]
      : []),
    {
      label: '스태프',
      href: `${base}/staff`,
      icon: <ShieldCheck size={18} aria-hidden="true" />,
    },
  ];
}

function useIsActive(pathname: string) {
  return (item: NavItem) => pathname.startsWith(item.href);
}

// ── Props ─────────────────────────────────────────────────────────────────
interface TournamentOpsShellProps {
  children: ReactNode;
  tournamentId: string;
  tournamentTitle?: string;
  tournamentCoverImageUrl?: string | null;
  role: V1TournamentStaffRole;
}

// ── Mobile drawer ─────────────────────────────────────────────────────────
interface DrawerProps {
  open: boolean;
  onClose: () => void;
  tournamentId: string;
  tournamentTitle?: string;
  tournamentCoverImageUrl?: string | null;
  role: V1TournamentStaffRole;
  pathname: string;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}

function Drawer({ open, onClose, tournamentId, tournamentTitle, tournamentCoverImageUrl, role, pathname, triggerRef }: DrawerProps) {
  const isActive = useIsActive(pathname);
  const navItems = buildNavItems(tournamentId, role);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) {
      const id = setTimeout(() => closeButtonRef.current?.focus(), 50);
      return () => clearTimeout(id);
    }
    triggerRef.current?.focus();
  }, [open, triggerRef]);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    if (open) panel.removeAttribute('inert');
    else panel.setAttribute('inert', '');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', trap);
    return () => document.removeEventListener('keydown', trap);
  }, [open]);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <>
      <div
        aria-hidden="true"
        onClick={onClose}
        className={[
          'fixed inset-0 z-40 bg-gray-900/40 backdrop-blur-[2px] transition-opacity motion-reduce:transition-none',
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        ].join(' ')}
      />
      <div
        ref={panelRef}
        id="tournament-ops-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="대회 운영 메뉴"
        aria-hidden={!open}
        className={[
          'fixed inset-y-0 left-0 z-50 w-[280px] flex flex-col',
          'bg-white dark:bg-gray-900',
          'shadow-[4px_0_24px_rgba(20,28,45,0.12)]',
          'transition-transform motion-reduce:transition-none',
          open ? 'translate-x-0 visible' : '-translate-x-full invisible',
        ].join(' ')}
      >
        <div className="flex items-center justify-between px-4 h-[52px] border-b border-gray-100 dark:border-white/10 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <TournamentEmblem tournamentId={tournamentId} coverImageUrl={tournamentCoverImageUrl} title={tournamentTitle} size={28} />
            <div className="flex flex-col min-w-0">
              <span className="text-[13px] font-bold text-gray-900 dark:text-white truncate">
                {tournamentTitle ?? '대회 운영'}
              </span>
              <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-300 bg-blue-50 dark:bg-blue-500/15 rounded-full px-1.5 py-0.5 w-fit mt-0.5">
                {staffRoleLabel(role)}
              </span>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            aria-label="메뉴 닫기"
            className="flex items-center justify-center w-[44px] h-[44px] rounded-lg text-gray-500 dark:text-gray-300 hover:text-gray-700 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-white/10 transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <nav className="flex-1 py-1.5 overflow-y-auto" aria-label="주 메뉴">
          {navItems.map((item) => {
            const active = isActive(item);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                onClick={onClose}
                className={[
                  'flex items-center gap-3 px-4 py-3 min-h-[44px] text-sm transition-colors border-l-2',
                  'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-[-2px]',
                  active
                    ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-500/10 text-blue-600 dark:text-blue-300 font-semibold'
                    : 'border-transparent text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white',
                ].join(' ')}
              >
                <span className={active ? 'text-blue-500 dark:text-blue-300' : 'text-gray-400'} aria-hidden="true">
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="px-4 py-4 border-t border-gray-100 dark:border-white/10 shrink-0">
          <Link
            href="/home"
            onClick={onClose}
            className="flex items-center gap-1.5 text-[13px] text-gray-400 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors min-h-[44px] focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 rounded"
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
/**
 * 3밀도 반응형 셸: 모바일(<lg)은 오프캔버스 드로어 + 상단 앱바, lg+는 고정 사이드바.
 * `/admin`의 AdminShell과 같은 뼈대를 쓰되(components/admin/admin-shell.tsx), 이 셸은
 * `/admin`과 완전히 분리된 별도 인증 경로다 — admin이 아닌 tournament_director/
 * support_readonly/platform_ops(대회 스코프)가 대상이다.
 */
export function TournamentOpsShell({ children, tournamentId, tournamentTitle, tournamentCoverImageUrl, role }: TournamentOpsShellProps) {
  const pathname = usePathname();
  const isActive = useIsActive(pathname);
  const navItems = buildNavItems(tournamentId, role);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const hamburgerRef = useRef<HTMLButtonElement>(null);

  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  const sectionLabel = navItems.find((item) => isActive(item))?.label ?? '대회 운영';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex">
      {/* ── Desktop sidebar (lg+) ─────────────────────────────────────── */}
      <aside
        className="hidden lg:flex w-[240px] min-h-screen bg-white dark:bg-gray-900 border-r border-gray-100 dark:border-white/10 flex-col fixed top-0 left-0 h-screen overflow-y-auto z-30 shrink-0"
        aria-label="대회 운영 사이드바"
      >
        <div className="px-5 py-4 border-b border-gray-100 dark:border-white/10 flex items-center gap-2.5 min-h-[64px]">
          <TournamentEmblem tournamentId={tournamentId} coverImageUrl={tournamentCoverImageUrl} title={tournamentTitle} size={34} />
          <div className="flex flex-col min-w-0">
            <span className="text-[15px] font-bold text-gray-900 dark:text-white leading-tight truncate">
              {tournamentTitle ?? '대회 운영'}
            </span>
            <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-300 bg-blue-50 dark:bg-blue-500/15 rounded-full px-1.5 py-0.5 w-fit mt-0.5">
              {staffRoleLabel(role)}
            </span>
          </div>
        </div>

        <nav className="flex-1 py-1.5" aria-label="주 메뉴">
          {navItems.map((item) => {
            const active = isActive(item);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={[
                  'flex items-center gap-3 px-4 py-2.5 min-h-[44px] text-sm transition-colors border-l-2',
                  'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-[-2px]',
                  active
                    ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-500/10 text-blue-600 dark:text-blue-300 font-semibold'
                    : 'border-transparent text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white',
                ].join(' ')}
              >
                <span className={active ? 'text-blue-500 dark:text-blue-300' : 'text-gray-400'} aria-hidden="true">
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="px-4 py-4 border-t border-gray-100 dark:border-white/10 shrink-0">
          <Link
            href="/home"
            className="flex items-center gap-1.5 text-[13px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors min-h-[44px] focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 rounded"
          >
            <ChevronLeft size={14} aria-hidden="true" />
            서비스로 돌아가기
          </Link>
        </div>
      </aside>

      {/* ── Mobile off-canvas drawer (<lg) ──────────────────────────────── */}
      <div className="lg:hidden">
        <Drawer
          open={drawerOpen}
          onClose={closeDrawer}
          tournamentId={tournamentId}
          tournamentTitle={tournamentTitle}
          tournamentCoverImageUrl={tournamentCoverImageUrl}
          role={role}
          pathname={pathname}
          triggerRef={hamburgerRef}
        />
      </div>

      {/* ── Right column ─────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 lg:pl-[240px]">
        <header className="lg:hidden sticky top-0 z-20 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-white/10 h-[52px] flex items-center px-2">
          <button
            ref={hamburgerRef}
            onClick={openDrawer}
            aria-label="메뉴 열기"
            aria-expanded={drawerOpen}
            aria-controls="tournament-ops-drawer"
            className="flex items-center justify-center w-[44px] h-[44px] rounded-lg text-gray-500 dark:text-gray-300 hover:text-gray-700 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-white/10 transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
          >
            <Menu size={20} aria-hidden="true" />
          </button>
          <span className="flex-1 text-center text-[15px] font-bold text-gray-900 dark:text-white truncate px-2">
            {sectionLabel}
          </span>
          <div className="w-[44px]" aria-hidden="true" />
        </header>

        <main className="flex-1 px-4 md:px-6 lg:px-8 py-5 md:py-6 lg:py-8">
          <div className="max-w-[1200px] xl:max-w-[1320px] mx-auto w-full">{children}</div>
        </main>
      </div>
    </div>
  );
}
