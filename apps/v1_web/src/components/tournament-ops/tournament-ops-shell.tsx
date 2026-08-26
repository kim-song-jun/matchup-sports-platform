'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ChevronLeft,
  ClipboardCheck,
  Film,
  LayoutDashboard,
  Menu,
  PencilLine,
  ShieldCheck,
  X,
} from 'lucide-react';
import type { V1TournamentStaffRole } from '@/types/api';
import type { TournamentOpsOrigin } from '@/lib/session-storage';
import { resolveTournamentLiveBase } from '@/lib/tournament-live-routes';
import { staffRoleLabel } from './badges';

// ── 대회 아이덴티티 배지 ──────────────────────────────────────────────────
/**
 * 셸 전체가 대회마다 똑같이 생긴 문제(고정된 파란 클립보드 아이콘 + 작은 텍스트뿐)를
 * 고친다. 커버 이미지가 있으면 그대로 쓰고, 없으면 대회 id를 해시해 고정된 색상 +
 * 이니셜을 보여준다 — 같은 대회는 새로고침해도 항상 같은 색이 나오고, 대회가
 * 바뀌면 다른 색이 나와서 "지금 어느 대회 안에 있는지"가 사이드바 색만 봐도 구분된다.
 */
const IDENTITY_PALETTE = [
  { className: 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300' },
  { className: 'bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300' },
  { className: 'bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-300' },
  { className: 'bg-purple-50 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300' },
  { className: 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300' },
  { className: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300' },
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
      className={palette.className}
      style={{
        width: size,
        height: size,
        borderRadius: 8,
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
  /** D-16 — 숨기지 않고 비활성 + 사유로 보여줄 때만 채운다. */
  disabled?: boolean;
  disabledReason?: string;
}

const RESULT_MANAGEMENT_DISABLED_REASON = '결과 검토·정정은 대회 운영자(디렉터)·플랫폼 운영자만 이용할 수 있어요.';

/**
 * 배정 인식 내비게이션(assignment-aware navigation) — 이 셸에 진입할 수 있는 역할은
 * platform_ops/tournament_director/support_readonly뿐이다(field_operator는 대회 전역
 * 리소스 read 권한이 없어 게이트에서 걸러진다. `_gate.tsx` 참고).
 *
 * 운영 보드·스태프는 세 역할 전부 조회 가능하므로 항상 노출한다. 결과 검토·결과 정정은
 * 원장(screens A-03/A-04)이 tournament_director / platform_ops 로 제한하므로 그 두 역할에만
 * 활성 링크로 노출한다. T6-5(D-16): support_readonly 에게 이 항목을 통째로 숨기는 대신
 * "보여주되 비활성 + 이유"로 통일한다 — admin 대회 상세의 바로가기(D-16)와 같은 원칙이다.
 *
 * 이 두 항목은 원래 여기 없었다. 라우트는 존재하는데 진입 링크가 어디에도 없어 URL 을 직접
 * 아는 사람만 갈 수 있는 고아 라우트였다(여정 검수 major 2건). 화면을 만들 때 셸의 nav 를
 * 함께 갱신하지 않으면 같은 일이 반복되므로, 라우트를 추가하는 쪽에서 이 목록도 같이 본다.
 */
function buildNavItems(basePath: string, role: V1TournamentStaffRole): NavItem[] {
  const base = basePath;
  const canManageResults = role === 'TOURNAMENT_DIRECTOR' || role === 'PLATFORM_OPS';
  const resultGate = canManageResults ? {} : { disabled: true, disabledReason: RESULT_MANAGEMENT_DISABLED_REASON };
  return [
    {
      label: '운영 보드',
      href: `${base}/operations`,
      icon: <LayoutDashboard size={18} aria-hidden="true" />,
    },
    {
      label: '결과 검토',
      href: `${base}/result-review`,
      icon: <ClipboardCheck size={18} aria-hidden="true" />,
      ...resultGate,
    },
    {
      label: '결과 정정',
      href: `${base}/records/corrections`,
      icon: <PencilLine size={18} aria-hidden="true" />,
      ...resultGate,
    },
    {
      // 영상 등록·삭제는 서버에서 event_append 권한을 요구한다 — 지원 담당은 조회만 되므로
      // 링크는 열어 두되(목록은 볼 수 있다) 화면 안에서 등록·삭제 버튼이 사라진다.
      label: '경기 영상',
      href: `${base}/videos`,
      icon: <Film size={18} aria-hidden="true" />,
    },
    {
      label: '스태프',
      href: `${base}/staff`,
      icon: <ShieldCheck size={18} aria-hidden="true" />,
    },
  ];
}

// 공용 비활성 행 — Drawer/데스크톱 사이드바 둘 다에서 쓴다.
function NavItemDisabledRow({ item, dense }: { item: NavItem; dense?: boolean }) {
  return (
    <button
      type="button"
      disabled
      aria-disabled="true"
      title={item.disabledReason}
      className={[
        'flex w-full items-center gap-3 px-4 min-h-[44px] text-sm text-left border-l-2 border-transparent',
        'text-gray-300 dark:text-gray-600 cursor-not-allowed',
        dense ? 'py-3' : 'py-2.5',
      ].join(' ')}
    >
      <span className="text-gray-300 dark:text-gray-600" aria-hidden="true">{item.icon}</span>
      <span className="flex flex-col items-start">
        <span>{item.label}</span>
        {item.disabledReason ? (
          <span className="text-[length:var(--font-size-micro)] font-normal text-gray-400 dark:text-gray-500">{item.disabledReason}</span>
        ) : null}
      </span>
    </button>
  );
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
  /** T6-2 — admin에서 들어왔으면 복귀 링크가 그리로 향한다(`_gate.tsx`가 계산해 내려준다). */
  origin: TournamentOpsOrigin;
}

/** T6-2 — 진입 출처별 복귀 목적지. `_gate.tsx`가 계산한 `origin`을 그대로 받는다. */
const RETURN_TARGET: Record<TournamentOpsOrigin, (tournamentId: string) => { href: string; label: string }> = {
  admin: (tournamentId) => ({ href: `/admin/tournaments/${encodeURIComponent(tournamentId)}`, label: '대회 관리로 돌아가기' }),
  home: () => ({ href: '/home', label: '서비스로 돌아가기' }),
};

// ── Mobile drawer ─────────────────────────────────────────────────────────
interface DrawerProps {
  open: boolean;
  onClose: () => void;
  tournamentId: string;
  tournamentTitle?: string;
  tournamentCoverImageUrl?: string | null;
  role: V1TournamentStaffRole;
  pathname: string;
  /** 지금 표면(스태프/어드민)의 nav base — 경로를 하드코딩하면 다른 표면으로 튕긴다. */
  basePath: string;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  returnHref: string;
  returnLabel: string;
}

function Drawer({ open, onClose, tournamentId, tournamentTitle, tournamentCoverImageUrl, role, pathname, basePath, triggerRef, returnHref, returnLabel }: DrawerProps) {
  const isActive = useIsActive(pathname);
  const navItems = buildNavItems(basePath, role);
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
          'bg-[var(--card-surface)]',
          'shadow-[4px_0_24px_rgba(20,28,45,0.12)]',
          'transition-transform motion-reduce:transition-none',
          open ? 'translate-x-0 visible' : '-translate-x-full invisible',
        ].join(' ')}
      >
        <div className="flex items-center justify-between px-4 h-[52px] border-b border-[var(--border)] shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <TournamentEmblem tournamentId={tournamentId} coverImageUrl={tournamentCoverImageUrl} title={tournamentTitle} size={28} />
            <div className="flex flex-col min-w-0">
              {/* 목업처럼 접두어가 긴 이름은 뒤쪽 식별자가 통째로 잘려 어느 대회인지
                  구분이 안 된다("(목업) 0818-0641 조..."). truncate 는 유지하되 전체
                  이름을 title 로 남겨 확인할 방법을 준다. */}
              <span
                className="text-[length:var(--font-size-label)] font-bold text-[var(--text-strong)] truncate"
                title={tournamentTitle ?? '대회 운영'}
              >
                {tournamentTitle ?? '대회 운영'}
              </span>
              {/* [알파 감사 C] ops shell 역할 배지 "플랫폼 운영자" — 알파 실측 지적(10px → 12px). */}
              <span className="text-[length:var(--font-size-caption)] font-semibold text-[var(--blue700)] bg-[var(--blue50)] rounded-full px-1.5 py-0.5 w-fit mt-0.5">
                {staffRoleLabel(role)}
              </span>
            </div>
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

        <nav className="flex-1 py-1.5 overflow-y-auto" aria-label="주 메뉴">
          {navItems.map((item) => {
            const active = isActive(item);
            if (item.disabled) return <NavItemDisabledRow key={item.href} item={item} dense />;
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
                    ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-500/10 text-[var(--blue700)] font-semibold'
                    : 'border-transparent text-[var(--text-muted)] hover:bg-[var(--surface-soft)] hover:text-[var(--text-strong)]',
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

        <div className="px-4 py-4 border-t border-[var(--border)] shrink-0">
          <Link
            href={returnHref}
            onClick={onClose}
            className="flex items-center gap-1.5 text-[length:var(--font-size-label)] text-gray-400 hover:text-[var(--text-muted)] transition-colors min-h-[44px] focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 rounded"
          >
            <ChevronLeft size={14} aria-hidden="true" />
            {returnLabel}
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
export function TournamentOpsShell({ children, tournamentId, tournamentTitle, tournamentCoverImageUrl, role, origin }: TournamentOpsShellProps) {
  const pathname = usePathname();
  const isActive = useIsActive(pathname);
  const basePath = resolveTournamentLiveBase(pathname, tournamentId);
  const navItems = buildNavItems(basePath, role);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const returnTarget = RETURN_TARGET[origin](tournamentId);

  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  const sectionLabel = navItems.find((item) => isActive(item))?.label ?? '대회 운영';

  return (
    <div className="min-h-screen bg-[var(--surface-soft)] flex">
      {/* ── Desktop sidebar (lg+) ─────────────────────────────────────── */}
      <aside
        className="hidden lg:flex w-[240px] min-h-screen bg-[var(--card-surface)] border-r border-[var(--border)] flex-col fixed top-0 left-0 h-screen overflow-y-auto z-30 shrink-0"
        aria-label="대회 운영 사이드바"
      >
        <div className="px-5 py-4 border-b border-[var(--border)] flex items-center gap-2.5 min-h-[64px]">
          <TournamentEmblem tournamentId={tournamentId} coverImageUrl={tournamentCoverImageUrl} title={tournamentTitle} size={34} />
          <div className="flex flex-col min-w-0">
            <span
              className="text-[length:var(--font-size-body)] font-bold text-[var(--text-strong)] leading-tight truncate"
              title={tournamentTitle ?? '대회 운영'}
            >
              {tournamentTitle ?? '대회 운영'}
            </span>
            {/* [알파 감사 C] ops shell 역할 배지 "플랫폼 운영자" — 알파 실측 지적(10px → 12px). */}
            <span className="text-[length:var(--font-size-caption)] font-semibold text-[var(--blue700)] bg-[var(--blue50)] rounded-full px-1.5 py-0.5 w-fit mt-0.5">
              {staffRoleLabel(role)}
            </span>
          </div>
        </div>

        <nav className="flex-1 py-1.5" aria-label="주 메뉴">
          {navItems.map((item) => {
            const active = isActive(item);
            if (item.disabled) return <NavItemDisabledRow key={item.href} item={item} />;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={[
                  'flex items-center gap-3 px-4 py-2.5 min-h-[44px] text-sm transition-colors border-l-2',
                  'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-[-2px]',
                  active
                    ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-500/10 text-[var(--blue700)] font-semibold'
                    : 'border-transparent text-[var(--text-muted)] hover:bg-[var(--surface-soft)] hover:text-[var(--text-strong)]',
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

        <div className="px-4 py-4 border-t border-[var(--border)] shrink-0">
          <Link
            href={returnTarget.href}
            className="flex items-center gap-1.5 text-[length:var(--font-size-label)] text-gray-400 hover:text-[var(--text-muted)] transition-colors min-h-[44px] focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 rounded"
          >
            <ChevronLeft size={14} aria-hidden="true" />
            {returnTarget.label}
          </Link>
        </div>
      </aside>

      {/* ── Mobile off-canvas drawer (<lg) ──────────────────────────────── */}
      <div className="lg:hidden">
        <Drawer
          open={drawerOpen}
          onClose={closeDrawer}
          basePath={basePath}
          tournamentId={tournamentId}
          tournamentTitle={tournamentTitle}
          tournamentCoverImageUrl={tournamentCoverImageUrl}
          role={role}
          pathname={pathname}
          triggerRef={hamburgerRef}
          returnHref={returnTarget.href}
          returnLabel={returnTarget.label}
        />
      </div>

      {/* ── Right column ─────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 lg:pl-[240px]">
        <header className="lg:hidden sticky top-0 z-20 bg-[var(--card-surface)] border-b border-[var(--border)] h-[52px] flex items-center px-2">
          <button
            ref={hamburgerRef}
            onClick={openDrawer}
            aria-label="메뉴 열기"
            aria-expanded={drawerOpen}
            aria-controls="tournament-ops-drawer"
            className="flex items-center justify-center w-[44px] h-[44px] rounded-lg text-[var(--text-muted)] hover:text-[var(--text-body)] hover:bg-[var(--surface-soft)] transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
          >
            <Menu size={20} aria-hidden="true" />
          </button>
          <span className="flex-1 text-center text-[length:var(--font-size-body)] font-bold text-[var(--text-strong)] truncate px-2">
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
