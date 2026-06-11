import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  BellIcon,
  ChevronLeftIcon,
  HomeIcon,
  MatchIcon,
  MyIcon,
  SearchIcon,
  TeamMatchIcon,
  TeamsIcon,
} from './icons';

export type V1NavTab = 'home' | 'matches' | 'teamMatches' | 'teams' | 'my';

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

type AppChromeProps = {
  title: ReactNode;
  children: ReactNode;
  floatingSlot?: ReactNode;
  activeTab?: V1NavTab;
  showSearch?: boolean;
  showNotifications?: boolean;
  hasNewNotification?: boolean;
  topbarActions?: ReactNode;
  bottomNav?: boolean;
  topBar?: boolean;
  backHref?: string;
  centerTitle?: boolean;
};

export function AppChrome({
  title,
  children,
  floatingSlot,
  activeTab = 'home',
  showSearch = false,
  showNotifications = true,
  hasNewNotification = false,
  topbarActions,
  bottomNav = true,
  topBar = true,
  backHref,
  centerTitle = false,
}: AppChromeProps) {
  const frameClassName = [
    'tm-app-frame',
    topBar ? '' : 'tm-app-frame-no-topbar',
    bottomNav ? '' : 'tm-app-frame-no-bottom',
  ].filter(Boolean).join(' ');

  return (
    <div className={frameClassName}>
      <DesktopNav activeTab={activeTab} hasNewNotification={hasNewNotification} />
      {topBar ? (
        <header className={centerTitle ? 'tm-topbar tm-topbar-centered' : 'tm-topbar'}>
          <div className="tm-topbar-title">
            {backHref ? (
              <Link className="tm-btn tm-btn-icon tm-btn-ghost" href={backHref} aria-label="뒤로가기">
                <ChevronLeftIcon size={22} strokeWidth={2.2} />
              </Link>
            ) : null}
            <div className="tm-text-body-lg tm-topbar-heading" style={{ color: 'var(--text-strong)' }}>{title}</div>
          </div>
          <div className="tm-topbar-actions">
            {topbarActions ?? (
              <>
                {showSearch ? (
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
      {floatingSlot}
      {bottomNav ? <BottomNav activeTab={activeTab} /> : null}
    </div>
  );
}

function BottomNav({ activeTab }: { activeTab: V1NavTab }) {
  return (
    <nav className="tm-bottom-nav" aria-label="주요 메뉴">
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

// Persistent desktop top navigation. Always rendered; CSS hides it below 1024px
// (`.tm-desktop-nav` in src/app/desktop/_shell.css). It is the primary nav on
// desktop, replacing the mobile topbar + bottom-nav.
function DesktopNav({
  activeTab,
  hasNewNotification,
}: {
  activeTab: V1NavTab;
  hasNewNotification: boolean;
}) {
  return (
    <nav className="tm-desktop-nav" aria-label="데스크톱 주요 메뉴">
      <Link className="tm-desktop-nav-brand" href="/home">
        teameet
      </Link>
      <div className="tm-desktop-nav-tabs">
        {tabs.map(({ id, label, href, Icon }) => {
          const active = id === activeTab;
          return (
            <Link
              key={id}
              className="tm-desktop-nav-tab"
              href={href}
              aria-current={active ? 'page' : undefined}
              data-active={active}
            >
              <Icon size={18} strokeWidth={active ? 2.2 : 1.7} />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
      <div className="tm-desktop-nav-actions">
        <Link className="tm-desktop-nav-action" href="/search" aria-label="검색">
          <SearchIcon size={20} strokeWidth={2} />
        </Link>
        <Link className="tm-desktop-nav-action" href="/notifications" aria-label="알림">
          <BellIcon size={20} strokeWidth={2} />
          {hasNewNotification ? <span className="tm-desktop-nav-dot" /> : null}
        </Link>
      </div>
    </nav>
  );
}
