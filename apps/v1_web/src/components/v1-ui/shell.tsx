import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  BellIcon,
  ChevronLeftIcon,
  ClipboardIcon,
  GridIcon,
  HistoryIcon,
  HomeIcon,
  MatchIcon,
  MyIcon,
  PlusIcon,
  SearchIcon,
  StarIcon,
  TeamMatchIcon,
  TeamsIcon,
} from './icons';

export type V1NavTab = 'home' | 'matches' | 'teamMatches' | 'teams' | 'my';
export type V1AdminNavTab = 'admin' | 'matches' | 'teamMatches' | 'teams' | 'reviews' | 'notifications' | 'audit';
export type V1OpsNavTab = 'overview' | 'reports' | 'disputes' | 'payments' | 'settlements' | 'audit';

const tabs: Array<{
  id: V1NavTab;
  label: string;
  href: string;
  Icon: typeof HomeIcon;
}> = [
  { id: 'home', label: '홈', href: '/home', Icon: HomeIcon },
  { id: 'matches', label: '매치', href: '/matches', Icon: MatchIcon },
  { id: 'teamMatches', label: '팀매치', href: '/team-matches', Icon: TeamMatchIcon },
  { id: 'teams', label: '팀', href: '/teams', Icon: TeamsIcon },
  { id: 'my', label: '마이', href: '/my', Icon: MyIcon },
];

const adminTabs: Array<{
  id: V1AdminNavTab;
  label: string;
  href: string;
  Icon: typeof HomeIcon;
}> = [
  { id: 'admin', label: '워크스페이스', href: '/admin', Icon: GridIcon },
  { id: 'matches', label: '개인 매치', href: '/admin/matches', Icon: MatchIcon },
  { id: 'teamMatches', label: '팀매치', href: '/admin/team-matches', Icon: TeamMatchIcon },
  { id: 'teams', label: '팀 운영', href: '/admin/teams', Icon: TeamsIcon },
  { id: 'reviews', label: '리뷰', href: '/admin/reviews', Icon: StarIcon },
  { id: 'notifications', label: '알림', href: '/admin/notifications', Icon: BellIcon },
  { id: 'audit', label: '업무 이력', href: '/admin/audit', Icon: HistoryIcon },
];

const opsTabs: Array<{
  id: V1OpsNavTab;
  label: string;
  href: string;
  Icon: typeof HomeIcon;
}> = [
  { id: 'overview', label: '상황판', href: '/ops', Icon: TeamMatchIcon },
  { id: 'reports', label: '신고', href: '/ops/reports', Icon: BellIcon },
  { id: 'disputes', label: '분쟁', href: '/ops/disputes', Icon: MyIcon },
  { id: 'payments', label: '결제·환불', href: '/ops/payments', Icon: MatchIcon },
  { id: 'settlements', label: '정산·지급', href: '/ops/settlements', Icon: TeamsIcon },
  { id: 'audit', label: '감사 이력', href: '/ops/audit', Icon: BellIcon },
];

type AppChromeProps = {
  title: ReactNode;
  children: ReactNode;
  floatingSlot?: ReactNode;
  activeTab?: V1NavTab;
  desktopNav?: 'app' | 'admin' | 'ops';
  adminActiveTab?: V1AdminNavTab;
  opsActiveTab?: V1OpsNavTab;
  showSearch?: boolean;
  showNotifications?: boolean;
  hasNewNotification?: boolean;
  topbarActions?: ReactNode;
  bottomNav?: boolean;
  topBar?: boolean;
  backHref?: string;
  centerTitle?: boolean;
  modalOpen?: boolean;
  wide?: boolean;
};

export function AppChrome({
  title,
  children,
  floatingSlot,
  activeTab = 'home',
  desktopNav = 'app',
  adminActiveTab = 'admin',
  opsActiveTab = 'overview',
  showSearch,
  showNotifications = true,
  hasNewNotification = false,
  topbarActions,
  bottomNav = true,
  topBar = true,
  backHref,
  centerTitle = false,
  modalOpen = false,
}: AppChromeProps) {
  const frameClassName = [
    'tm-app-frame',
    'tm-app-frame-wide',
    topBar ? '' : 'tm-app-frame-no-topbar',
    bottomNav ? '' : 'tm-app-frame-no-bottom',
  ].filter(Boolean).join(' ');
  const showSearchSurface = showSearch ?? bottomNav;

  return (
    <div className={frameClassName}>
      {desktopNav === 'admin' ? (
        <AdminDesktopNav activeTab={adminActiveTab} inert={modalOpen} />
      ) : desktopNav === 'ops' ? (
        <OpsDesktopNav activeTab={opsActiveTab} inert={modalOpen} />
      ) : (
        <DesktopNav activeTab={activeTab} inert={modalOpen} />
      )}
      {topBar ? (
        <header
          className={centerTitle ? 'tm-topbar tm-topbar-centered' : 'tm-topbar'}
          aria-hidden={modalOpen ? true : undefined}
          inert={modalOpen ? true : undefined}
        >
          <div className="tm-topbar-title">
            {backHref ? (
              <Link className="tm-btn tm-btn-icon tm-btn-ghost" href={backHref} aria-label="뒤로가기">
                <ChevronLeftIcon size={22} strokeWidth={2.2} />
              </Link>
            ) : null}
            <div className="tm-text-body-lg tm-topbar-heading" style={{ color: 'var(--text-strong)' }}>{title}</div>
          </div>
          {showSearchSurface ? (
            <form className="tm-desktop-search" action="/search">
              <SearchIcon size={18} strokeWidth={2} />
              <input aria-label="통합 검색" name="q" placeholder="종목, 지역, 팀 이름으로 검색하기" type="search" />
            </form>
          ) : null}
          <div className="tm-topbar-actions">
            {topbarActions ?? (
              <>
                {showSearchSurface ? (
                  <Link className="tm-btn tm-btn-icon tm-btn-ghost" href="/search" aria-label="검색">
                    <SearchIcon size={21} strokeWidth={2} />
                  </Link>
                ) : null}
                {showNotifications ? (
                  <Link className="tm-btn tm-btn-icon tm-btn-ghost" href="/notifications" aria-label="알림">
                    <BellIcon size={21} strokeWidth={2} />
                    {hasNewNotification ? <span className="tm-unread-dot" /> : null}
                  </Link>
                ) : null}
              </>
            )}
          </div>
        </header>
      ) : null}
      <main className="tm-scroll-area" style={{ paddingBottom: bottomNav ? 'var(--v1-shell-scroll-bottom-pad)' : 0 }}>
        {children}
      </main>
      {floatingSlot ? (
        <div aria-hidden={modalOpen ? true : undefined} inert={modalOpen ? true : undefined}>
          {floatingSlot}
        </div>
      ) : null}
      {bottomNav ? <BottomNav activeTab={activeTab} inert={modalOpen} /> : null}
    </div>
  );
}

function AdminDesktopNav({ activeTab, inert }: { activeTab: V1AdminNavTab; inert?: boolean }) {
  return (
    <aside
      className="tm-desktop-nav tm-desktop-nav-operations tm-desktop-nav-admin"
      aria-hidden={inert ? true : undefined}
      aria-label="운영 워크스페이스 메뉴"
      inert={inert ? true : undefined}
    >
      <Link className="tm-desktop-brand" href="/admin" aria-label="Teameet 운영 홈">
        <span className="tm-desktop-brand-mark">T</span>
        <span>teameet 운영</span>
      </Link>
      <div className="tm-desktop-tab-list">
        {adminTabs.map(({ id, label, href, Icon }) => {
          const active = id === activeTab;
          return (
            <Link key={id} className="tm-desktop-tab" href={href} aria-current={active ? 'page' : undefined} data-active={active}>
              <Icon size={20} strokeWidth={active ? 2.2 : 1.8} />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
      <div className="tm-desktop-nav-footer">
        <Link className="tm-desktop-nav-back-link" href="/home">
          <HomeIcon size={16} strokeWidth={1.8} />
          <span>서비스 홈으로</span>
        </Link>
      </div>
    </aside>
  );
}

function OpsDesktopNav({ activeTab, inert }: { activeTab: V1OpsNavTab; inert?: boolean }) {
  return (
    <aside
      className="tm-desktop-nav tm-desktop-nav-operations tm-desktop-nav-ops"
      aria-hidden={inert ? true : undefined}
      aria-label="내부 운영 콘솔 메뉴"
      inert={inert ? true : undefined}
    >
      <Link className="tm-desktop-brand" href="/ops" aria-label="Teameet 내부 운영 콘솔">
        <span className="tm-desktop-brand-mark">T</span>
        <span>teameet ops</span>
      </Link>
      <div className="tm-desktop-tab-list">
        {opsTabs.map(({ id, label, href, Icon }) => {
          const active = id === activeTab;
          return (
            <Link key={id} className="tm-desktop-tab" href={href} aria-current={active ? 'page' : undefined} data-active={active}>
              <Icon size={20} strokeWidth={active ? 2.2 : 1.8} />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </aside>
  );
}

function DesktopNav({ activeTab, inert }: { activeTab: V1NavTab; inert?: boolean }) {
  return (
    <aside
      className="tm-desktop-nav"
      aria-hidden={inert ? true : undefined}
      aria-label="데스크탑 주요 메뉴"
      inert={inert ? true : undefined}
    >
      <Link className="tm-desktop-brand" href="/home" aria-label="Teameet 홈">
        <span className="tm-desktop-brand-mark">T</span>
        <span>teameet</span>
      </Link>
      <div className="tm-desktop-tab-list">
        {tabs.map(({ id, label, href, Icon }) => {
          const active = id === activeTab;
          return (
            <Link key={id} className="tm-desktop-tab" href={href} aria-current={active ? 'page' : undefined} data-active={active}>
              <Icon size={20} strokeWidth={active ? 2.2 : 1.8} />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
      <Link className="tm-desktop-create-cta" href="/matches/new">
        <PlusIcon size={18} strokeWidth={2.4} />
        <span>매치 만들기</span>
      </Link>
    </aside>
  );
}

function BottomNav({ activeTab, inert }: { activeTab: V1NavTab; inert?: boolean }) {
  return (
    <nav className="tm-bottom-nav" aria-hidden={inert ? true : undefined} aria-label="주요 메뉴" inert={inert ? true : undefined}>
      {tabs.map(({ id, label, href, Icon }) => {
        const active = id === activeTab;
        return (
          <Link key={id} className="tm-bottom-tab" href={href} aria-current={active ? 'page' : undefined} data-active={active}>
            <Icon size={23} strokeWidth={active ? 2.2 : 1.7} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
