'use client';
// AppChrome 은 이중 셸 가드(ShellMountedContext)를 위해 createContext/useContext 를 쓴다.
// React Server Component 는 createContext 에 의존하는 모듈을 import 할 수 없으므로 이
// 지시어가 없으면 `app/not-found.tsx`(유일한 서버 컴포넌트 소비처)에서 프로덕션 빌드가
// 깨진다 — tsc 와 jsdom 테스트는 RSC 경계를 검사하지 않아 `next build` 에서만 드러났다.
// 실질 비용은 없다: 다른 소비처인 app-shell-frame.tsx 가 이미 'use client' 라 셸은
// 어차피 클라이언트 청크에 들어 있었고, 이 지시어는 404 화면의 셸도 같은 청크를 쓰게 할 뿐이다.
import Link from 'next/link';
import type { ReactNode } from 'react';
import { createContext, useContext, useRef } from 'react';
import { useSlidingIndicatorRect } from './use-sliding-indicator';
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

/**
 * 상위(AppShellFrame)가 이미 AppChrome을 렌더했음을 하위의 또 다른 AppChrome 호출이
 * 감지하는 신호. 마이그레이션 도중 아직 자체 <AppChrome> 래퍼를 못 걷어낸 페이지가
 * 섞여 있어도 topbar/bottomnav가 두 번 그려지지 않게 하는 안전망이다. **정상 절차라면
 * 이 분기가 실행될 일이 없다** — 테이블 등록과 페이지 자체 AppChrome 제거를 같은
 * 커밋에서 하기 때문. 이 분기가 실행 중이라는 건 그 규율이 깨졌다는 신호이므로 오래
 * 방치하면 안 된다 — 안쪽 호출에만 있던 floatingSlot/동적 title 같은 props는 여기서
 * 조용히 버려진다.
 */
export const ShellMountedContext = createContext(false);

export function AppChrome(props: AppChromeProps) {
  const alreadyMounted = useContext(ShellMountedContext);
  if (alreadyMounted) {
    return <>{props.children}</>;
  }
  return (
    <ShellMountedContext.Provider value={true}>
      <AppChromeInner {...props} />
    </ShellMountedContext.Provider>
  );
}

function AppChromeInner({
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
  const tabCount = tabs.length;
  const activeIndex = tabs.findIndex((tab) => tab.id === activeTab);

  return (
    <nav
      className="tm-bottom-nav"
      aria-label="주요 메뉴"
      // 탭 개수가 CSS의 하드코딩된 5열에 묶이지 않도록 tabs.length로 열 수를 계산한다.
      // 390px 폭 계산 근거는 shell.tsx 주변 PR 설명 참조 — 6열 기준 탭당 65px,
      // 아이콘 23px + 라벨(최대 2글자, 12px)이 전부 여유 있게 들어간다.
      style={{ gridTemplateColumns: `repeat(${tabCount}, 1fr)` }}
    >
      {/*
        활성 탭 인디케이터. 예전엔 탭마다 ::before 의사요소가 하나씩 있어서 활성 탭이
        바뀌면 pill 이 한 탭에서 사라지고 다른 탭에서 나타났다 — 미끄러질 수 없는 구조였다.
        미끄러지게 하려면 pill 이 하나뿐이어야 하므로 nav 안에 슬롯을 하나만 두고
        activeIndex 에 따라 transform: translateX 로 옮긴다.

        슬롯 폭을 탭 1개 폭(`calc(100% / tabCount)`)으로 잡아 두면 transform 의
        `100%` 가 슬롯 자기 자신의 폭(=탭 1칸)을 가리키므로 `translateX(index * 100%)` 만으로
        정확히 index 칸을 이동한다 — `left` 처럼 매 렌더마다 레이아웃을 다시 흘리는 속성을
        건드리지 않고 transform 합성만으로 전환된다(`transition-all` 금지 규칙과 별개로,
        여기서는 애초에 transform 외의 속성이 바뀌지 않는다).

        activeTab 이 어떤 탭에도 속하지 않는 화면(검색 등)에서는 activeIndex 가 -1이 되는데,
        그때 임의의 탭 위로 pill 을 붙여두면 "그 탭이 활성"이라는 거짓 신호가 되므로 숨긴다.

        첫 렌더 시에도 activeIndex 는 이미 props 로부터 계산되어 초기 style 에 그대로
        박히므로(별도의 mount 애니메이션 로직 없음) pill 이 왼쪽 끝에서 미끄러져
        들어오는 일은 없다 — transition 은 이미 마운트된 DOM 에서 activeTab 이 바뀔
        때만(재렌더로 style 값이 달라질 때만) 발동한다.
      */}
      <div
        className="tm-bottom-nav-pill-slot"
        aria-hidden="true"
        style={{
          width: `calc(100% / ${tabCount})`,
          transform: activeIndex >= 0 ? `translateX(calc(${activeIndex} * 100%))` : undefined,
          opacity: activeIndex >= 0 ? 1 : 0,
        }}
      >
        <span className="tm-bottom-nav-pill" />
      </div>
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
  const tabsRef = useRef<HTMLDivElement>(null);
  const activeIndex = tabs.findIndex((tab) => tab.id === activeTab);
  // 라벨 길이가 제각각(홈/매치/대회/팀/마이)이라 하단탭 pill 처럼 "index * 100%" 로
  // 계산할 수 없다 — 실제 탭 요소의 offsetLeft/offsetWidth 를 측정한다(use-sliding-indicator).
  const tabRect = useSlidingIndicatorRect(tabsRef, ':scope > a.tm-desktop-nav-tab', activeIndex);
  // 밑줄은 탭 padding(16px)만큼 안쪽에서 시작·끝난다 — 이전 ::after(`left:16px; right:16px`)와
  // 같은 시각 폭을 유지한다.
  const UNDERLINE_INSET = 16;

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
      <div className="tm-desktop-nav-tabs" ref={tabsRef}>
        {/* 활성 표시 밑줄 — 트랙에 하나뿐인 슬라이딩 인디케이터(하단탭 pill·세부탭
            thumb과 같은 아키텍처). 선택 상태 자체는 각 탭의 aria-current 가 계속
            담당하므로 스크린리더에서는 숨긴다. */}
        <span
          className="tm-desktop-nav-tab-indicator"
          aria-hidden="true"
          style={{
            transform: tabRect ? `translateX(${tabRect.left + UNDERLINE_INSET}px)` : undefined,
            width: tabRect ? `${Math.max(0, tabRect.width - UNDERLINE_INSET * 2)}px` : undefined,
            opacity: tabRect ? 1 : 0,
          }}
        />
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
