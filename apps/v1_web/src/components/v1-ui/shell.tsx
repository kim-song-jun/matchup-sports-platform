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
