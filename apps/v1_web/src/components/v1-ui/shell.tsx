import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  BellIcon,
  ChevronLeftIcon,
  HomeIcon,
  MatchIcon,
  MyIcon,
  PlusIcon,
  SearchIcon,
  TeamMatchIcon,
  TeamsIcon,
} from './icons';

export type V1NavTab = 'home' | 'matches' | 'teamMatches' | 'teams' | 'my';
export type V1AdminNavTab = 'admin' | 'audit';

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
  { id: 'admin', label: '운영 상태', href: '/admin', Icon: TeamMatchIcon },
  { id: 'audit', label: '감사 로그', href: '/admin/audit', Icon: BellIcon },
];

type AppChromeProps = {
  title: ReactNode;
  children: ReactNode;
  floatingSlot?: ReactNode;
  activeTab?: V1NavTab;
  desktopNav?: 'app' | 'admin';
  adminActiveTab?: V1AdminNavTab;
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
      {desktopNav === 'admin' ? <AdminDesktopNav activeTab={adminActiveTab} inert={modalOpen} /> : <DesktopNav activeTab={activeTab} inert={modalOpen} />}
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
      className="tm-desktop-nav tm-desktop-nav-admin"
      aria-hidden={inert ? true : undefined}
      aria-label="관리자 메뉴"
      inert={inert ? true : undefined}
    >
      <Link className="tm-desktop-brand" href="/admin" aria-label="Teameet 관리자">
        <span className="tm-desktop-brand-mark">T</span>
        <span>Teameet 운영</span>
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
