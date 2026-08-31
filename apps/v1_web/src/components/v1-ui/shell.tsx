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

// 하단 탭 **5개**(홈/매치/대회/팀/마이).
//
// 이전에는 '대회'와 '리그'가 **나란히 있었다.** 그런데 리그 방식으로 열린 대회와 정규
// 리그가 서로 다른 탭에서 같은 이름으로 보여서, 사용자가 "무엇이 어디 있는지"를 탭
// 이름만으로는 알 수 없었다. 통합 설계(D1)에서 리그는 **대회의 한 종류**가 되므로 탭도
// 하나로 합치고, 그 안에서 [정규 대회 · 정규 리그] 세그먼트로 가른다.
//
// 리그 진입 경로는 사라지지 않는다 — `CompetitionKindSegment` 가 두 목록을 잇고
// (`/tournaments` ↔ `/league-matches`), 리그 화면들은 `activeTab='tournaments'` 로
// 대회 탭을 활성 표시한다. **탭만 지우고 세그먼트를 안 넣으면 리그가 도달 불가능해진다.**
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
  /**
   * 데스크톱(≥1024px)에서 본문 상단에 페이지 헤더(뒤로가기 + 제목)를 렌더할지.
   *
   * 데스크톱에서는 모바일 `.tm-topbar` 가 숨겨지고(desktop/_shell.css:61) 각 페이지가
   * `.tm-desktop-page-head` 를 직접 그리는 것이 이 저장소의 관례다. 그 관례를 안 따른
   * 화면들(일정 생성·수정, 팀 전적, 라인업)은 데스크톱에서 제목도 뒤로가기도 없이
   * 본문이 nav 바로 아래에서 시작했다 — 여정 검수에서 major 4건으로 확인됐다.
   *
   * 이미 자체 헤더를 그리는 페이지와 중복되지 않도록 기본값은 false(opt-in)다.
   */
  desktopHead?: boolean;
  backHref?: string;
  centerTitle?: boolean;
  titleAsHeading?: boolean;
};

export function AppChrome({
  title,
  children,
  floatingSlot,
  // 기본값을 두지 않는다. 검색처럼 5개 탭 어디에도 속하지 않는 화면이 'home' 으로
  // 떨어져 엉뚱한 탭이 활성으로 표시되기 때문. 미지정이면 활성 탭이 없다.
  activeTab,
  showSearch = false,
  showNotifications = true,
  hasNewNotification = false,
  topbarActions,
  bottomNav = true,
  topBar = true,
  desktopHead = false,
  backHref,
  centerTitle = false,
  titleAsHeading = false,
}: AppChromeProps) {
  const frameClassName = [
    'tm-app-frame',
    topBar ? '' : 'tm-app-frame-no-topbar',
    bottomNav ? '' : 'tm-app-frame-no-bottom',
  ].filter(Boolean).join(' ');

  // 하단 탭바가 없는 화면(상세·하위 페이지)은 모바일/태블릿 폭에서 뒤로가기 외 이동
  // 수단이 없어 사용자가 갇힌다. 데스크톱 폭(≥1024px)에서는 .tm-desktop-nav 가 홈
  // 링크를 제공하고 .tm-topbar 자체가 숨겨지므로, 이 단축키는 탭바가 없는 모바일·
  // 태블릿 폭에서만 노출된다.
  const showHomeShortcut = topBar && !bottomNav;

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
            {titleAsHeading ? (
              <h1 className="tm-text-body-lg tm-topbar-heading" style={{ color: 'var(--text-strong)' }}>{title}</h1>
            ) : (
              <div className="tm-text-body-lg tm-topbar-heading" style={{ color: 'var(--text-strong)' }}>{title}</div>
            )}
          </div>
          <div className="tm-topbar-actions">
            {showHomeShortcut ? (
              <Link className="tm-btn tm-btn-icon tm-btn-ghost" href="/home" aria-label="홈으로">
                <HomeIcon size={21} strokeWidth={2} />
              </Link>
            ) : null}
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
        {desktopHead && title ? (
          <div className="tm-desktop-page-head tm-show-desktop">
            {backHref ? (
              <AppBackLink className="tm-desktop-back" fallbackHref={backHref} aria-label="뒤로가기">
                <ChevronLeftIcon size={22} strokeWidth={2.2} />
              </AppBackLink>
            ) : null}
            <h1 className="tm-text-heading">{title}</h1>
          </div>
        ) : null}
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

function BottomNav({ activeTab }: { activeTab?: V1NavTab }) {
  return (
    <nav
      className="tm-bottom-nav"
      aria-label="주요 메뉴"
      // 탭 개수가 CSS의 하드코딩된 5열에 묶이지 않도록 tabs.length로 열 수를 계산한다.
      // 390px 폭 계산 근거는 shell.tsx 주변 PR 설명 참조 — 6열 기준 탭당 65px,
      // 아이콘 23px + 라벨(최대 2글자, 12px)이 전부 여유 있게 들어간다.
      style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}
    >
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
  activeTab?: V1NavTab;
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
