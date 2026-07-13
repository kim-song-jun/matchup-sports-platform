import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  ChevronLeftIcon,
  HomeIcon,
  MatchIcon,
  MyIcon,
  SearchIcon,
  TeamsIcon,
  TrophyIcon,
} from './icons';
import { DesktopScrollTop } from './desktop-scroll-top';
import { BrandMark } from './brand-logo';
import { AppBackLink } from './app-back-link';
import { NotificationBellLink } from './notification-bell';

export type V1NavTab = 'home' | 'matches' | 'tournaments' | 'teams' | 'my';

const tabs: Array<{
  id: V1NavTab;
  label: string;
  href: string;
  Icon: typeof HomeIcon;
}> = [
  { id: 'home', label: '홈', href: '/home', Icon: HomeIcon },
  { id: 'matches', label: '매치', href: '/matches', Icon: MatchIcon },
  { id: 'tournaments', label: '대회', href: '/tournaments', Icon: TrophyIcon },
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
              <AppBackLink className="tm-btn tm-btn-icon tm-btn-ghost" fallbackHref={backHref}>
                <ChevronLeftIcon size={22} strokeWidth={2.2} />
              </AppBackLink>
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
                  <NotificationBellLink className="tm-btn tm-btn-icon tm-btn-ghost" forceUnread={hasNewNotification} />
                ) : null}
              </>
            )}
          </div>
        </header>
      ) : null}
      <main className="tm-scroll-area" style={{ paddingBottom: bottomNav ? 'var(--v1-shell-scroll-bottom-pad)' : 0 }}>
        {children}
      </main>
      <DesktopFooter />
      <DesktopScrollTop />
      {floatingSlot}
      {bottomNav ? <BottomNav activeTab={activeTab} /> : null}
    </div>
  );
}

// Desktop-only site footer. Hidden on mobile (.tm-desktop-footer is display:none
// below 1024px). Adds a familiar web-app footer and fills the lower viewport on
// short pages — a desktop convention that the mobile app intentionally omits.
function DesktopFooter() {
  return (
    <footer className="tm-desktop-footer" aria-label="사이트 정보">
      <div className="tm-desktop-footer-inner">
        <div className="tm-desktop-footer-brand">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <BrandMark size={22} />
            <span className="tm-desktop-footer-wordmark">teameet</span>
          </span>
          <span className="tm-desktop-footer-tagline">같이 뛸 사람을 한 번에</span>
        </div>
        <nav className="tm-desktop-footer-links" aria-label="푸터 링크">
          <Link href="/notices">공지사항</Link>
          <Link href="/terms?document=terms">서비스 이용약관</Link>
          <Link href="/terms?document=privacy">개인정보처리방침</Link>
          <Link href="/terms?document=location">위치기반서비스 이용약관</Link>
          <Link href="/terms?document=tournament-policy">대회 운영정책</Link>
          <Link href="/terms?document=support">고객센터</Link>
        </nav>
        <p className="tm-desktop-footer-copy">© 2026 Teameet</p>
      </div>
    </footer>
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
      <Link
        className="tm-desktop-nav-brand"
        href="/home"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
        aria-label="teameet 홈"
      >
        <BrandMark size={24} />
        teameet
      </Link>
      <div className="tm-desktop-nav-tabs">
        {tabs.map(({ id, label, href }) => {
          const active = id === activeTab;
          return (
            <Link
              key={id}
              className="tm-desktop-nav-tab"
              href={href}
              aria-current={active ? 'page' : undefined}
              data-active={active}
            >
              {label}
            </Link>
          );
        })}
      </div>
      <div className="tm-desktop-nav-actions">
        <Link className="tm-desktop-nav-action" href="/search" aria-label="검색">
          <SearchIcon size={20} strokeWidth={2} />
        </Link>
        <NotificationBellLink
          className="tm-desktop-nav-action"
          badgeClassName="tm-desktop-nav-badge"
          unknownDotClassName="tm-desktop-nav-dot"
          forceUnread={hasNewNotification}
          iconSize={20}
        />
        {/* Desktop-only account affordance — top-right avatar entry to My page. */}
        <Link
          className={`tm-desktop-nav-avatar ${activeTab === 'my' ? 'is-active' : ''}`}
          href="/my"
          aria-label="내 정보"
          aria-current={activeTab === 'my' ? 'page' : undefined}
        >
          <MyIcon size={19} strokeWidth={activeTab === 'my' ? 2.2 : 1.8} />
        </Link>
      </div>
    </nav>
  );
}
