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
  title: string;
  children: ReactNode;
  floatingSlot?: ReactNode;
  activeTab?: V1NavTab;
  showSearch?: boolean;
  hasNewNotification?: boolean;
  bottomNav?: boolean;
  topBar?: boolean;
  backHref?: string;
};

export function AppChrome({
  title,
  children,
  floatingSlot,
  activeTab = 'home',
  showSearch = false,
  hasNewNotification = false,
  bottomNav = true,
  topBar = true,
  backHref,
}: AppChromeProps) {
  const frameClassName = [
    'tm-app-frame',
    topBar ? '' : 'tm-app-frame-no-topbar',
    bottomNav ? '' : 'tm-app-frame-no-bottom',
  ].filter(Boolean).join(' ');

  return (
    <div className={frameClassName}>
      <StatusBar />
      {topBar ? (
        <header className="tm-topbar">
          <div className="tm-topbar-title">
            {backHref ? (
              <Link className="tm-btn tm-btn-icon tm-btn-ghost" href={backHref} aria-label="뒤로가기">
                <ChevronLeftIcon size={22} strokeWidth={2.2} />
              </Link>
            ) : null}
            <div className="tm-text-body-lg" style={{ color: 'var(--text-strong)' }}>{title}</div>
          </div>
          <div className="tm-topbar-actions">
            {showSearch ? (
              <Link className="tm-btn tm-btn-icon tm-btn-ghost" href="/search" aria-label="검색">
                <SearchIcon size={21} strokeWidth={2} />
              </Link>
            ) : null}
            <Link className="tm-btn tm-btn-icon tm-btn-ghost" href="/notifications" aria-label="알림">
              <BellIcon size={21} strokeWidth={2} />
              {hasNewNotification ? <span className="tm-unread-dot" /> : null}
            </Link>
          </div>
        </header>
      ) : null}
      <main className="tm-scroll-area" style={{ paddingBottom: bottomNav ? 12 : 0 }}>
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

function StatusBar() {
  return (
    <div className="tm-status-bar" aria-hidden="true">
      <span>9:41</span>
      <span className="tm-status-icons">
        <svg width="18" height="10" viewBox="0 0 18 10" fill="currentColor">
          <path d="M1 8 L1 9 M5 6 L5 9 M9 4 L9 9 M13 2 L13 9 M17 0 L17 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        <svg width="15" height="11" viewBox="0 0 15 11" fill="currentColor">
          <path d="M7.5 3.5 A 5 5 0 0 1 11 5 M7.5 1 A 7.5 7.5 0 0 1 13 3 M7.5 6 A 2.5 2.5 0 0 1 9 6.5 M7.5 8.5 L 7.5 8.6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none" />
        </svg>
        <svg width="25" height="12" viewBox="0 0 25 12">
          <rect x="0.5" y="0.5" width="21" height="11" rx="2.5" stroke="currentColor" fill="none" strokeWidth="1" />
          <rect x="22.5" y="3.5" width="1.5" height="5" rx="0.5" fill="currentColor" />
          <rect x="2" y="2" width="15" height="8" rx="1" fill="currentColor" />
        </svg>
      </span>
    </div>
  );
}
