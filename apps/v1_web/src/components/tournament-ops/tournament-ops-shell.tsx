'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ArrowLeftRight,
  ChevronLeft,
  Film,
  Flag,
  LayoutDashboard,
  Menu,
  Users,
  X,
} from 'lucide-react';
import type { V1CompetitionKind, V1TournamentStaffRole } from '@/types/api';
import type { TournamentOpsOrigin } from '@/lib/session-storage';
import { fixtureIdFromConsolePath, resolveTournamentLiveBase } from '@/lib/tournament-live-routes';
import { competitionOpsTitle } from '@/lib/competition-kind';
import { useV1Tournament, useV1TournamentFields } from '@/hooks/use-v1-api';
import { staffRoleLabel } from './badges';
import { consoleContextLabel, resolveOpsBridge, type OpsBridge } from './ops-bridge';
import { canManageTournamentResults } from './role-context';
import { usePendingResultCount } from './result-partition';
import { useOverlayHistory } from '@/components/v1-ui/use-overlay-history';
import { useTopmostEscape } from '@/components/v1-ui/use-topmost-escape';
import { overlayLinkClick } from '@/lib/overlay-history';
import { displayInitials } from '@/lib/display-initials';
import { lockBodyScroll } from '@/lib/body-scroll-lock';
import { optimizedImageSrc } from '@/lib/assets';

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
      // eslint-disable-next-line @next/next/no-img-element -- 커버는 외부 URL 일 수 있어 <img> 를 유지하고, 업로드만 optimizedImageSrc 로 줄여 받는다.
      <img
        src={optimizedImageSrc(coverImageUrl, size)}
        alt=""
        aria-hidden="true"
        width={size}
        height={size}
        style={{ width: size, height: size, borderRadius: 'var(--radius-chip)', objectFit: 'cover', flexShrink: 0 }}
      />
    );
  }
  const palette = IDENTITY_PALETTE[hashToIndex(tournamentId, IDENTITY_PALETTE.length)];
  const initial = displayInitials(title, { fallback: '대' });
  return (
    <span
      aria-hidden="true"
      className={palette.className}
      style={{
        width: size,
        height: size,
        borderRadius: 'var(--radius-chip)',
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
  /** 메뉴 옆 숫자 배지(확정 대기 수). 0 이면 그리지 않는다. */
  count?: number;
  countLabel?: string;
}

const RESULT_MANAGEMENT_DISABLED_REASON = '결과 확정·고치기는 대회 운영자·플랫폼 운영자만 할 수 있어요.';

/**
 * 이 셸에 들어올 수 있는 역할은 플랫폼 운영자·대회 운영자·지원(보기만)이다(구장 담당자는 대회 전역 읽기 권한이
 * 없어 게이트에서 걸러진다). 운영 보드·스태프·영상은 셋 모두 열려 있고, 결과는 확정·고치기 권한이 있는 두 역할만
 * 연다 — 지원에게는 숨기지 않고 잠금 + 이유로 보여 준다(D-16). 라우트를 더하면 이 목록도 같이 본다.
 */
function buildNavItems(basePath: string, role: V1TournamentStaffRole, pendingResults: number): NavItem[] {
  const canResults = canManageTournamentResults(role);
  return [
    { label: '운영 보드', href: `${basePath}/operations`, icon: <LayoutDashboard size={18} aria-hidden="true" /> },
    {
      label: '결과',
      href: `${basePath}/results`,
      icon: <Flag size={18} aria-hidden="true" />,
      ...(canResults
        ? { count: pendingResults, countLabel: `확정 대기 ${pendingResults}` }
        : { disabled: true, disabledReason: RESULT_MANAGEMENT_DISABLED_REASON }),
    },
    { label: '스태프·구장', href: `${basePath}/staff`, icon: <Users size={18} aria-hidden="true" /> },
    // 영상 등록·삭제는 서버가 event_append 권한을 요구한다 — 지원은 목록만 보고 버튼은 화면 안에서 사라진다.
    { label: '영상', href: `${basePath}/videos`, icon: <Film size={18} aria-hidden="true" /> },
  ];
}

const NAV_ROW = 'flex items-center gap-3 rounded-lg px-3 min-h-[44px] text-[length:var(--font-size-body-sm)] transition-colors';
const NAV_FOCUS = 'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2';

function NavCount({ item }: { item: NavItem }) {
  if (!item.count) return null;
  return (
    <span
      aria-label={item.countLabel}
      className="ml-auto rounded-full bg-[var(--tint-orange)] px-2 py-0.5 text-[length:var(--font-size-caption)] font-semibold tabular-nums text-[var(--orange700)]"
    >
      {item.count}
    </span>
  );
}

// 잠긴 메뉴 줄 — 사이드바와 폰 시트가 같이 쓴다.
function NavItemDisabledRow({ item }: { item: NavItem }) {
  return (
    <button
      type="button"
      disabled
      aria-disabled="true"
      title={item.disabledReason}
      className={`${NAV_ROW} w-full cursor-not-allowed py-3 text-left text-gray-300 dark:text-gray-600`}
    >
      <span className="text-gray-300 dark:text-gray-600" aria-hidden="true">{item.icon}</span>
      <span className="flex flex-col items-start">
        <span>{item.label}</span>
        {item.disabledReason ? (
          <span className="text-[length:var(--font-size-micro)] font-normal text-[var(--text-muted)] dark:text-gray-500">{item.disabledReason}</span>
        ) : null}
      </span>
    </button>
  );
}

function NavList({ items, isActive, onNavigate, pathname }: { items: NavItem[]; isActive: (item: NavItem) => boolean; onNavigate?: () => void; pathname: string }) {
  return (
    <>
      {items.map((item) => {
        if (item.disabled) return <NavItemDisabledRow key={item.href} item={item} />;
        const active = isActive(item);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            onClick={onNavigate ? overlayLinkClick(item.href, pathname, onNavigate) : undefined}
            className={[
              NAV_ROW,
              NAV_FOCUS,
              active
                ? 'bg-[var(--blue50)] font-semibold text-[var(--blue700)]'
                : 'text-[var(--text-muted)] hover:bg-[var(--surface-soft)] hover:text-[var(--text-strong)]',
            ].join(' ')}
          >
            <span className={active ? 'text-[var(--blue700)]' : 'text-[var(--text-muted)]'} aria-hidden="true">
              {item.icon}
            </span>
            <span>{item.label}</span>
            <NavCount item={item} />
          </Link>
        );
      })}
    </>
  );
}

function useIsActive(pathname: string) {
  return (item: NavItem) => pathname.startsWith(item.href);
}

const PICK_ANOTHER_HREF = '/admin/ops/tournaments?pick=1';

function PickAnotherLink({ onNavigate, pathname }: { onNavigate?: () => void; pathname: string }) {
  return (
    <Link
      href={PICK_ANOTHER_HREF}
      onClick={onNavigate ? overlayLinkClick(PICK_ANOTHER_HREF, pathname, onNavigate) : undefined}
      className={`${NAV_ROW} ${NAV_FOCUS} text-[var(--text-muted)] hover:bg-[var(--surface-soft)] hover:text-[var(--text-strong)]`}
    >
      <ArrowLeftRight size={18} aria-hidden="true" />
      다른 대회 고르기
    </Link>
  );
}

// ── 돌아가기 줄 ───────────────────────────────────────────────────────────
function BridgeLink({ bridge }: { bridge: OpsBridge }) {
  return (
    <Link
      href={bridge.href}
      className={`inline-flex min-h-[44px] shrink-0 items-center gap-1 rounded text-[length:var(--font-size-label)] font-medium text-[var(--blue700)] hover:underline ${NAV_FOCUS}`}
    >
      <ChevronLeft size={14} aria-hidden="true" />
      {bridge.label}
    </Link>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────
interface TournamentOpsShellProps {
  children: ReactNode;
  tournamentId: string;
  tournamentTitle?: string;
  tournamentCoverImageUrl?: string | null;
  role: V1TournamentStaffRole;
  /** 진입 출처 — 돌아가기 목적지가 여기서 갈린다(`_gate.tsx`가 계산해 내려준다). */
  origin: TournamentOpsOrigin;
  /**
   * 리그면 어드민 돌아가기가 리그 관리로 간다. `undefined` = 아직 모름(공개 상세 조회 중) → 어드민 목적지를 잠시
   * 숨긴다. `null` = 옛 대회 행(`kind` 미기입은 대회 쪽이다) 또는 조회 실패 → 대회 관리.
   */
  tournamentKind?: V1CompetitionKind | null;
}

// ── Mobile menu sheet ─────────────────────────────────────────────────────
interface SheetProps {
  open: boolean;
  onClose: () => void;
  tournamentId: string;
  tournamentTitle?: string;
  tournamentCoverImageUrl?: string | null;
  role: V1TournamentStaffRole;
  pathname: string;
  navItems: NavItem[];
  showPickAnother: boolean;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}

/** 폰 메뉴. 아래에서 올라오는 시트이고, 상단 막대와 돌아가기 줄은 덮지 않는다. */
function MenuSheet({ open, onClose, tournamentId, tournamentTitle, tournamentCoverImageUrl, role, pathname, navItems, showPickAnother, triggerRef }: SheetProps) {
  const isActive = useIsActive(pathname);
  const panelRef = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      const id = setTimeout(() => panelRef.current?.querySelector<HTMLElement>('a[href], button:not([disabled])')?.focus(), 50);
      return () => clearTimeout(id);
    }
    if (wasOpen.current) {
      wasOpen.current = false;
      triggerRef.current?.focus();
    }
  }, [open, triggerRef]);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    if (open) panel.removeAttribute('inert');
    else panel.setAttribute('inert', '');
  }, [open]);

  useOverlayHistory({ open, onClose });
  useTopmostEscape({ open, onEscape: onClose });

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
    if (!open) return;
    return lockBodyScroll();
  }, [open]);

  return (
    <>
      <div
        aria-hidden="true"
        onClick={onClose}
        style={{ top: 'var(--tournament-ops-mobile-header-offset)' }}
        className={[
          'fixed bottom-0 left-0 right-0 z-40 bg-gray-900/40 backdrop-blur-[2px] transition-opacity motion-reduce:transition-none',
          open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0',
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
          'fixed bottom-0 left-0 right-0 z-50 flex max-h-[calc(100dvh-var(--tournament-ops-mobile-header-offset))] flex-col rounded-t-2xl',
          'bg-[var(--card-surface)] shadow-[0_-4px_24px_rgba(20,28,45,0.12)]',
          'transition-transform motion-reduce:transition-none',
          open ? 'visible translate-y-0' : 'invisible translate-y-full',
        ].join(' ')}
      >
        <div aria-hidden="true" className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-[var(--border)]" />
        <div className="flex shrink-0 items-center gap-3 px-4 py-3">
          <TournamentEmblem tournamentId={tournamentId} coverImageUrl={tournamentCoverImageUrl} title={tournamentTitle} size={28} />
          <div className="flex min-w-0 flex-col">
            {/* 접두어가 긴 이름은 뒤쪽 식별자가 잘려 어느 대회인지 구분이 안 된다 — 전체 이름을 title 로 남긴다. */}
            <span className="truncate text-[length:var(--font-size-label)] font-bold text-[var(--text-strong)]" title={tournamentTitle ?? '대회 운영'}>
              {tournamentTitle ?? '대회 운영'}
            </span>
            <span className="mt-0.5 w-fit rounded-full bg-[var(--blue50)] px-2 py-0.5 text-[length:var(--font-size-caption)] font-semibold text-[var(--blue700)]">
              {staffRoleLabel(role)}
            </span>
          </div>
        </div>
        <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 pb-2" aria-label="주 메뉴">
          <NavList items={navItems} isActive={isActive} onNavigate={onClose} pathname={pathname} />
          {showPickAnother ? (
            <div className="mt-1 border-t border-[var(--border)] pt-1">
              <PickAnotherLink onNavigate={onClose} pathname={pathname} />
            </div>
          ) : null}
        </nav>
        <div className="shrink-0 px-3 pb-[calc(var(--spacing-3)+var(--v1-shell-safe-bottom))] pt-2">
          <button
            type="button"
            onClick={onClose}
            className={`min-h-[44px] w-full rounded-xl bg-[var(--surface-soft)] text-[length:var(--font-size-body-sm)] font-semibold text-[var(--text-body)] ${NAV_FOCUS}`}
          >
            닫기
          </button>
        </div>
      </div>
    </>
  );
}

// ── Shell ─────────────────────────────────────────────────────────────────
/**
 * 반응형 셸: 폰(<lg)은 상단 막대 + 늘 보이는 돌아가기 줄 + 아래 시트 메뉴, lg+ 는 돌아가기 줄이 맨 위인 고정 사이드바.
 * `/admin` 의 AdminShell 과 같은 뼈대지만 인증 경로가 따로다 — 어드민이 아닌 대회 운영자·지원·플랫폼 운영자(대회 범위)가 대상이다.
 */
export function TournamentOpsShell({ children, tournamentId, tournamentTitle, tournamentCoverImageUrl, role, origin, tournamentKind }: TournamentOpsShellProps) {
  const pathname = usePathname();
  const isActive = useIsActive(pathname);
  const basePath = resolveTournamentLiveBase(pathname, tournamentId);
  const consoleFixtureId = fixtureIdFromConsolePath(pathname, tournamentId);
  const isFixtureConsole = consoleFixtureId !== null;
  const pendingResults = usePendingResultCount(tournamentId, canManageTournamentResults(role));
  const navItems = buildNavItems(basePath, role, pendingResults);
  const showPickAnother = role === 'PLATFORM_OPS' && basePath.startsWith('/admin/');
  const [menuOpen, setMenuOpen] = useState(false);
  const hamburgerRef = useRef<HTMLButtonElement>(null);

  const bridge = resolveOpsBridge({ origin, role, kind: tournamentKind, tournamentId, basePath, isConsole: isFixtureConsole });
  // 콘솔 돌아가기 줄 옆에 어느 경기인지 알린다. 대회 상세는 같은 화면들이 이미 받아 둔 캐시를 쓴다.
  const tournament = useV1Tournament(tournamentId);
  const fields = useV1TournamentFields(tournamentId, { enabled: isFixtureConsole });
  const contextLabel =
    consoleFixtureId === null || !tournament.data
      ? null
      : consoleContextLabel({
          fixtureId: consoleFixtureId,
          fixtures: tournament.data.fixtures ?? [],
          leagueFixtures: tournament.data.leagueFixtures ?? [],
          fields: fields.data?.items ?? [],
        });

  const openMenu = useCallback(() => setMenuOpen(true), []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const sectionLabel = isFixtureConsole ? '경기 콘솔' : (navItems.find((item) => isActive(item))?.label ?? competitionOpsTitle(tournamentKind));

  // 문서가 스크롤하는 표면이다. Android 앱은 하단 시스템 바 뒤까지 웹을 그리므로 root 한 곳에서만
  // 스크롤 끝에 그 높이(--v1-shell-safe-bottom)를 더한다 — main 여백에 다시 더하면 두 번 쌓인다.
  // 폰의 고정 머리 높이 = 막대 52px + 돌아가기 줄 44px. 본문 안 sticky 요소가 이 값 아래에 붙는다.
  return (
    <div className="tm-fullbleed-sheet-host min-h-screen bg-[var(--surface-soft)] flex pb-[var(--v1-shell-safe-bottom)] [--tournament-ops-mobile-header-offset:96px] lg:[--tournament-ops-mobile-header-offset:0px]">
      {/* ── Desktop sidebar (lg+) ─────────────────────────────────────── */}
      <aside
        className="hidden lg:flex w-[240px] min-h-screen bg-[var(--card-surface)] border-r border-[var(--border)] flex-col fixed top-0 left-0 h-screen overflow-y-auto z-30 shrink-0"
        aria-label="대회 운영 사이드바"
      >
        <div className="min-h-[44px] px-4 pt-2">
          {bridge ? <BridgeLink bridge={bridge} /> : null}
          {contextLabel ? <p className="truncate pl-4 text-[length:var(--font-size-caption)] text-[var(--text-muted)]">{contextLabel}</p> : null}
        </div>
        <div className="px-5 py-4 border-b border-[var(--border)] flex items-center gap-3 min-h-[64px]">
          <TournamentEmblem tournamentId={tournamentId} coverImageUrl={tournamentCoverImageUrl} title={tournamentTitle} size={34} />
          <div className="flex flex-col min-w-0">
            <span
              className="text-[length:var(--font-size-body)] font-bold text-[var(--text-strong)] leading-tight truncate"
              title={tournamentTitle ?? '대회 운영'}
            >
              {tournamentTitle ?? '대회 운영'}
            </span>
            <span className="text-[length:var(--font-size-caption)] font-semibold text-[var(--blue700)] bg-[var(--blue50)] rounded-full px-2 py-0.5 w-fit mt-0.5">
              {staffRoleLabel(role)}
            </span>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-3 py-2" aria-label="주 메뉴">
          <NavList items={navItems} isActive={isActive} pathname={pathname} />
        </nav>
        {showPickAnother ? (
          <div className="border-t border-[var(--border)] px-3 py-2">
            <PickAnotherLink pathname={pathname} />
          </div>
        ) : null}
      </aside>

      {/* ── Mobile menu sheet (<lg) ─────────────────────────────────────── */}
      <div className="lg:hidden">
        <MenuSheet
          open={menuOpen}
          onClose={closeMenu}
          navItems={navItems}
          showPickAnother={showPickAnother}
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
        <div className="lg:hidden sticky top-0 z-20">
          <header className="bg-[var(--card-surface)] border-b border-[var(--border)] h-[52px] flex items-center px-2">
            <button
              ref={hamburgerRef}
              onClick={menuOpen ? closeMenu : openMenu}
              aria-label={menuOpen ? '메뉴 닫기' : '메뉴 열기'}
              aria-expanded={menuOpen}
              aria-controls="tournament-ops-drawer"
              className={`flex items-center justify-center w-[44px] h-[44px] rounded-lg text-[var(--text-muted)] hover:text-[var(--text-body)] hover:bg-[var(--surface-soft)] transition-colors ${NAV_FOCUS}`}
            >
              {menuOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
            </button>
            <span className="flex-1 text-center text-[length:var(--font-size-body)] font-bold text-[var(--text-strong)] truncate px-2">
              {sectionLabel}
            </span>
            <div className="w-[44px]" aria-hidden="true" />
          </header>
          {/* 종류 조회 중에도 자리(44px)는 잡아 둬서 링크가 생길 때 본문이 밀리지 않게 한다. */}
          <div className="flex h-[44px] items-center gap-2 border-b border-[var(--border)] bg-[var(--surface-soft)] px-3">
            {bridge ? <BridgeLink bridge={bridge} /> : null}
            {contextLabel ? <span className="min-w-0 truncate text-[length:var(--font-size-label)] text-[var(--text-muted)]">· {contextLabel}</span> : null}
          </div>
        </div>

        <main className="flex-1 px-4 md:px-6 lg:px-8 py-5 md:py-6 lg:py-8">
          <div className="max-w-[1200px] xl:max-w-[1320px] mx-auto w-full">{children}</div>
        </main>
      </div>
    </div>
  );
}
