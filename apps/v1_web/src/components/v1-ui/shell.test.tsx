import { render, screen, within } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readScrollPosition, saveScrollPosition } from '@/lib/scroll-positions';
import { useV1NotificationUnreadSummary } from '@/hooks/use-v1-api';
import { AppChrome } from './shell';

// AppChrome은 항상 DesktopNav를 렌더하고, DesktopNav는 조건 없이 NotificationBellLink를
// 그린다 — 그 컴포넌트가 react-query 훅(useV1NotificationUnreadSummary)을 호출하므로
// QueryClientProvider를 두르는 대신 훅 자체를 목킹한다(notification-bell.test.tsx와
// 동일 패턴).
vi.mock('@/hooks/use-v1-api', () => ({
  useV1NotificationUnreadSummary: vi.fn(() => ({ data: { unreadCount: 0 } })),
}));

// 기본은 라우터 밖(경로 모름)과 같다. 공통 링크 시험만 현재 경로를 정해, 링크가 그 경로를 href 에 싣지 않는지 본다.
const navigation = vi.hoisted(() => ({ pathname: null as string | null, search: '' }));
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  usePathname: () => navigation.pathname,
  useSearchParams: () => (navigation.pathname ? new URLSearchParams(navigation.search) : null),
  useRouter: () => ({ push: vi.fn() }),
}));

const EXPECTED_TABS: Array<{ label: string; href: string }> = [
  { label: '홈', href: '/home' },
  { label: '매치', href: '/team-matches' },
  { label: '대회', href: '/tournaments' },
  { label: '팀', href: '/teams' },
  { label: '마이', href: '/my' },
];

describe('AppChrome bottom nav — 탭 5개(리그는 대회 탭 세그먼트로)', () => {
  it('탭이 5개이고 각 href가 기대한 경로다', () => {
    render(
      <AppChrome title="테스트" showNotifications={false}>
        <div>본문</div>
      </AppChrome>
    );

    const nav = screen.getByRole('navigation', { name: '주요 메뉴' });
    const links = within(nav).getAllByRole('link');

    expect(links).toHaveLength(EXPECTED_TABS.length);
    EXPECTED_TABS.forEach(({ label, href }, index) => {
      expect(links[index]).toHaveTextContent(label);
      expect(links[index]).toHaveAttribute('href', href);
    });
  });

  // 이 테스트가 이 변경의 계약이다. 탭을 지우는 것만으로 끝내면 **리그가 하단 탭에서
  // 도달 불가능해지는데**, 그때 리그 화면은 아무 탭도 활성화되지 않아 사용자는 자기가
  // 어디 있는지 알 수 없다. 리그는 대회의 한 종류이므로 대회 탭이 켜져야 한다.
  it('리그 화면에서 대회 탭이 활성화된다 — 리그 전용 탭은 더 이상 없다', () => {
    render(
      <AppChrome title="정규 리그" activeTab="tournaments" showNotifications={false}>
        <div>본문</div>
      </AppChrome>
    );

    const nav = screen.getByRole('navigation', { name: '주요 메뉴' });
    const links = within(nav).getAllByRole('link');

    expect(links.some((link) => link.getAttribute('href') === '/league-matches')).toBe(false);

    const tournamentsLink = links.find((link) => link.getAttribute('href') === '/tournaments');
    expect(tournamentsLink).toHaveAttribute('aria-current', 'page');

    links
      .filter((link) => link.getAttribute('href') !== '/tournaments')
      .forEach((link) => {
        expect(link).not.toHaveAttribute('aria-current');
      });
  });
});

describe('AppChrome bottom nav — 활성 pill 이 하나만 있고 인덱스에 따라 미끄러진다', () => {
  // 이 테스트가 이 변경의 계약이다: 탭마다 하나씩 ::before 를 두던 예전 구조로 되돌리면
  // (즉 shell.tsx 의 pill 슬롯을 지우면) 이 querySelector 가 아예 null 이라 실패하고,
  // activeTab 이 바뀌어도 transform 이 그대로면(각 탭이 다시 자기만의 정적 pill 을
  // 그리는 구조로 퇴행하면) translateX 값이 안 바뀌므로 그것도 잡는다.
  it('탭마다 pill 이 하나씩 있는 게 아니라 nav 전체에 슬롯이 하나뿐이다', () => {
    const { container } = render(
      <AppChrome title="테스트" activeTab="matches" showNotifications={false}>
        <div>본문</div>
      </AppChrome>
    );

    expect(container.querySelectorAll('.tm-bottom-nav-pill-slot')).toHaveLength(1);
  });

  it('activeTab 인덱스가 다르면 pill 슬롯의 translateX 값도 그만큼 다르다', () => {
    const { container: homeContainer } = render(
      <AppChrome title="테스트" activeTab="home" showNotifications={false}>
        <div>본문</div>
      </AppChrome>
    );
    const { container: teamsContainer } = render(
      <AppChrome title="테스트" activeTab="teams" showNotifications={false}>
        <div>본문</div>
      </AppChrome>
    );

    const homeSlot = homeContainer.querySelector<HTMLElement>('.tm-bottom-nav-pill-slot');
    const teamsSlot = teamsContainer.querySelector<HTMLElement>('.tm-bottom-nav-pill-slot');

    // EXPECTED_TABS 순서상 home=index 0, teams=index 3.
    expect(homeSlot?.style.transform).toBe('translateX(calc(0 * 100%))');
    expect(teamsSlot?.style.transform).toBe('translateX(calc(3 * 100%))');
    expect(homeSlot?.style.transform).not.toBe(teamsSlot?.style.transform);
  });

  // activeTab 이 5개 탭 어디에도 속하지 않는 화면(검색 등)에서 임의의 탭 위에 pill 을
  // 남겨두면 "그 탭이 활성"이라는 거짓 신호가 된다 — 숨겨야 한다.
  it('activeTab 이 없으면 pill 을 숨긴다', () => {
    const { container } = render(
      <AppChrome title="검색" showNotifications={false}>
        <div>본문</div>
      </AppChrome>
    );

    const slot = container.querySelector<HTMLElement>('.tm-bottom-nav-pill-slot');
    expect(slot?.style.opacity).toBe('0');
  });
});

describe('AppChrome 하단탭 모션(C안) — 아이콘이 CSS 모션 셀렉터와 맞아떨어진다', () => {
  // 콘텐츠 크로스페이드를 걷어낸 대신 탭 아이콘 자신이 반응한다(globals.css
  // `.tm-bottom-tab svg` / `.tm-bottom-tab[data-active="true"] svg` /
  // `.tm-bottom-tab:active svg`). jsdom은 CSS 애니메이션을 계산하지 않으므로 그
  // 값 자체는 검증할 수 없지만(→ deviations), 그 셀렉터가 실제로 매칭할 DOM
  // 구조는 검증할 수 있다 — 아이콘이 svg가 아닌 다른 요소(<img> 등)로 바뀌거나
  // `.tm-bottom-tab`의 직계가 아닌 래퍼 안으로 옮겨지면(예: 별도 아이콘 시스템
  // 전환) 이 CSS는 조용히 매칭을 잃고 모션이 사라진다 — 그때 이 테스트가 실패한다.
  it('탭 5개 전부 .tm-bottom-tab 안에 svg 아이콘이 있다', () => {
    const { container } = render(
      <AppChrome title="테스트" activeTab="home" showNotifications={false}>
        <div>본문</div>
      </AppChrome>
    );

    const tabs = container.querySelectorAll('.tm-bottom-tab');
    expect(tabs).toHaveLength(EXPECTED_TABS.length);
    expect(container.querySelectorAll('.tm-bottom-tab svg')).toHaveLength(EXPECTED_TABS.length);
  });

  // data-active 는 모션 셀렉터(`.tm-bottom-tab[data-active="true"] svg`)뿐 아니라
  // 기존 색상 규칙도 함께 의존하는 속성이다 — "true"/"false" 문자열로 정확히
  // 직렬화되는지(참/거짓 boolean 자체가 아니라)를 박아 둔다.
  it('활성 탭에만 data-active="true"가 붙고 나머지는 "false"다', () => {
    const { container } = render(
      <AppChrome title="테스트" activeTab="teams" showNotifications={false}>
        <div>본문</div>
      </AppChrome>
    );

    const nav = within(container).getByRole('navigation', { name: '주요 메뉴' });
    const tabLinks = within(nav)
      .getAllByRole('link')
      .filter((link) => link.className.includes('tm-bottom-tab'));

    const teamsLink = tabLinks.find((link) => link.getAttribute('href') === '/teams');
    expect(teamsLink).toHaveAttribute('data-active', 'true');

    tabLinks
      .filter((link) => link !== teamsLink)
      .forEach((link) => {
        expect(link).toHaveAttribute('data-active', 'false');
      });
  });
});

// motion-audit 그룹4(F2 desktop underline snap) — 탭마다 자기 ::after 를 갖던 예전 구조는
// 활성 탭이 바뀌면 의사요소가 다른 DOM 부모 아래서 재생성돼 애초에 미끄러질 수 없었다.
// 트랙에 하나뿐인 인디케이터(.tm-desktop-nav-tab-indicator)로 바꾸면서, 하단탭 pill 과
// 달리 라벨 길이가 제각각이라(홈/매치/대회/팀/마이) index*100% 계산이 성립하지 않는다 —
// 실제 offsetLeft/offsetWidth 를 읽는다(use-sliding-indicator.ts). jsdom 은 레이아웃 엔진이
// 없어 offsetLeft/offsetWidth 가 항상 0 이므로, 탭마다 **일부러 다른 폭**을 흉내 낸
// getter 로 프로토타입을 스텁한다 — 폭이 전부 같았다면(예전 index*100% 방식) 이 테스트가
// 실제 결함(측정을 안 해도 우연히 통과)을 못 잡았을 것이다.
const DESKTOP_TAB_HREFS = ['/home', '/team-matches', '/tournaments', '/teams', '/my'];
const DESKTOP_TAB_WIDTHS = [48, 64, 64, 40, 64]; // 의도적으로 서로 다른 폭
const DESKTOP_TAB_GAP = 4; // .tm-desktop-nav-tabs 의 flex gap

function stubDesktopNavTabOffsets() {
  const leftOf = (idx: number) =>
    DESKTOP_TAB_WIDTHS.slice(0, idx).reduce((sum, w) => sum + w + DESKTOP_TAB_GAP, 0);

  Object.defineProperty(HTMLElement.prototype, 'offsetLeft', {
    configurable: true,
    get(this: HTMLElement) {
      if (!this.classList.contains('tm-desktop-nav-tab')) return 0;
      const idx = DESKTOP_TAB_HREFS.indexOf(this.getAttribute('href') ?? '');
      return idx < 0 ? 0 : leftOf(idx);
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get(this: HTMLElement) {
      if (!this.classList.contains('tm-desktop-nav-tab')) return 0;
      const idx = DESKTOP_TAB_HREFS.indexOf(this.getAttribute('href') ?? '');
      return idx < 0 ? 0 : DESKTOP_TAB_WIDTHS[idx];
    },
  });
}

const ORIGINAL_OFFSET_LEFT = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetLeft');
const ORIGINAL_OFFSET_WIDTH = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');

describe('AppChrome 데스크톱 상단 탭 — 밑줄이 트랙에 하나뿐인 슬라이딩 인디케이터다', () => {
  afterEach(() => {
    if (ORIGINAL_OFFSET_LEFT) Object.defineProperty(HTMLElement.prototype, 'offsetLeft', ORIGINAL_OFFSET_LEFT);
    if (ORIGINAL_OFFSET_WIDTH) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', ORIGINAL_OFFSET_WIDTH);
  });

  it('탭마다 밑줄이 하나씩 있는 게 아니라 nav 전체에 인디케이터가 하나뿐이다', () => {
    stubDesktopNavTabOffsets();
    const { container } = render(
      <AppChrome title="테스트" activeTab="home" showNotifications={false}>
        <div>본문</div>
      </AppChrome>,
    );

    expect(container.querySelectorAll('.tm-desktop-nav-tab-indicator')).toHaveLength(1);
  });

  it('활성 탭이 바뀌면 인디케이터의 transform/width 가 실제 DOM 폭을 반영해 갱신된다', () => {
    stubDesktopNavTabOffsets();
    const { container: homeContainer } = render(
      <AppChrome title="테스트" activeTab="home" showNotifications={false}>
        <div>본문</div>
      </AppChrome>,
    );
    const { container: matchesContainer } = render(
      <AppChrome title="테스트" activeTab="matches" showNotifications={false}>
        <div>본문</div>
      </AppChrome>,
    );

    const homeIndicator = homeContainer.querySelector<HTMLElement>('.tm-desktop-nav-tab-indicator');
    const matchesIndicator = matchesContainer.querySelector<HTMLElement>('.tm-desktop-nav-tab-indicator');

    // home: offsetLeft=0, offsetWidth=48 → underline inset 16px 씩 → left+16=16px, width-32=16px
    expect(homeIndicator?.style.transform).toBe('translateX(16px)');
    expect(homeIndicator?.style.width).toBe('16px');
    // matches: offsetLeft=48+4(gap)=52, offsetWidth=64 → left+16=68px, width-32=32px
    expect(matchesIndicator?.style.transform).toBe('translateX(68px)');
    expect(matchesIndicator?.style.width).toBe('32px');
    // 폭이 서로 다른 탭이라 index*100% 로는 절대 같은 값이 안 나온다 — 실제 측정을 증명한다.
    expect(homeIndicator?.style.transform).not.toBe(matchesIndicator?.style.transform);
    expect(homeIndicator?.style.width).not.toBe(matchesIndicator?.style.width);
  });

  it('activeTab 이 없으면 인디케이터를 숨긴다(임의 탭 위의 거짓 활성 신호 방지)', () => {
    stubDesktopNavTabOffsets();
    const { container } = render(
      <AppChrome title="검색" showNotifications={false}>
        <div>본문</div>
      </AppChrome>,
    );

    const indicator = container.querySelector<HTMLElement>('.tm-desktop-nav-tab-indicator');
    expect(indicator?.style.opacity).toBe('0');
  });
});

describe('AppChrome 공통 링크 — 출처(from) 꼬리 없는 href', () => {
  // 서버 HTML 에 화면마다 다른 `?from=` 이 실리면 같은 약관·알림 문서가 화면 수만큼의 변형 주소로 퍼진다.
  const sharedHrefs = (root: ParentNode) =>
    Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href^="/terms"], a[href^="/notifications"]'))
      .map((anchor) => anchor.getAttribute('href'));
  const renderChrome = () => (
    <AppChrome title="테스트" desktopHead>
      <div>본문</div>
    </AppChrome>
  );

  const enterReceivedPage = () => {
    navigation.pathname = '/tournaments';
    navigation.search = 'status=open&from=%2Fhome';
    window.history.replaceState(null, '', '/tournaments?status=open&from=%2Fhome#list');
  };

  afterEach(() => {
    navigation.pathname = null;
    navigation.search = '';
    window.history.replaceState(null, '', '/');
  });

  it('약관 5종·알림 링크가 서버 HTML 에 꼬리 없이 나온다', () => {
    enterReceivedPage();
    const parsed = new DOMParser().parseFromString(renderToStaticMarkup(renderChrome()), 'text/html');
    const hrefs = sharedHrefs(parsed);
    expect(hrefs.filter((href) => href?.startsWith('/terms'))).toEqual([
      '/terms?document=terms',
      '/terms?document=privacy',
      '/terms?document=location',
      '/terms?document=tournament-policy',
      '/terms?document=support',
    ]);
    // 상단 바의 알림 + 데스크톱 상단 내비의 알림
    expect(hrefs.filter((href) => href?.startsWith('/notifications'))).toEqual(['/notifications', '/notifications']);
  });

  it('하이드레이션 뒤 DOM 에도 같은 링크가 꼬리 없이 남는다', () => {
    enterReceivedPage();
    const { container } = render(renderChrome());
    const hrefs = sharedHrefs(container);
    expect(hrefs).toHaveLength(7);
    expect(hrefs.every((href) => !href?.includes('from='))).toBe(true);
  });
});

describe('useV1NotificationUnreadSummary mock wiring', () => {
  it('테스트 환경에서 실제 네트워크 훅 대신 목이 호출된다', () => {
    vi.mocked(useV1NotificationUnreadSummary).mockClear();
    render(
      <AppChrome title="테스트">
        <div>본문</div>
      </AppChrome>
    );
    expect(vi.mocked(useV1NotificationUnreadSummary)).toHaveBeenCalled();
  });
});

describe('AppChrome mobile page title semantics', () => {
  it('renders an opt-in page title as a level-one heading', () => {
    render(
      <AppChrome title="알림 설정" titleAsHeading showNotifications={false}>
        <div>본문</div>
      </AppChrome>
    );

    expect(screen.getByRole('heading', { level: 1, name: '알림 설정' })).toBeInTheDocument();
  });
});

describe('AppChrome 이중 마운트 가드 (§2.2 마이그레이션 안전망)', () => {
  it('AppChrome 안에 또 다른 AppChrome이 중첩되면 안쪽은 children만 통과시킨다', () => {
    render(
      <AppChrome title="바깥" activeTab="home" showNotifications={false}>
        <AppChrome title="안쪽(마이그레이션 잔재)" activeTab="matches" showNotifications={false}>
          <div data-testid="leaf">내용</div>
        </AppChrome>
      </AppChrome>,
    );

    // bottom nav가 정확히 1개 — 2개면 이중 셸이 실제로 렌더된 것(구조적 회귀).
    expect(screen.getAllByRole('navigation', { name: '주요 메뉴' })).toHaveLength(1);
    expect(screen.getByText('바깥')).toBeInTheDocument();
    expect(screen.queryByText('안쪽(마이그레이션 잔재)')).not.toBeInTheDocument();
    // 안쪽 children(leaf)은 그대로 화면에 나온다 — passthrough가 콘텐츠까지 지우지 않음.
    expect(screen.getByTestId('leaf')).toBeInTheDocument();
  });
});

describe('AppChrome 스크롤 영역 — floatingSlot(FAB) 유무에 따른 하단 안전 여백', () => {
  // 이 테스트가 이 변경의 계약이다: .tm-floating-fab은 .tm-scroll-area 밖(형제, {floatingSlot})에
  // 앵커되어 콘텐츠 위로 떠 있다 — floatingSlot이 있는데도 이 padding-bottom이 기존
  // --v1-shell-scroll-bottom-pad(FAB 클리어런스 없는 값)로 되돌아가면 목록 마지막 행이
  // 다시 FAB에 가려진다. floatingSlot이 없는 화면은 이 값이 그대로여야 한다(불필요한 여백 금지).
  it('floatingSlot이 있으면 fab-clear-pad, 없으면 기존 scroll-bottom-pad를 쓴다', () => {
    const { container: withFab } = render(
      <AppChrome title="테스트" showNotifications={false} floatingSlot={<button type="button">FAB</button>}>
        <div>본문</div>
      </AppChrome>,
    );
    const { container: withoutFab } = render(
      <AppChrome title="테스트" showNotifications={false}>
        <div>본문</div>
      </AppChrome>,
    );

    const scrollWithFab = withFab.querySelector<HTMLElement>('.tm-scroll-area');
    const scrollWithoutFab = withoutFab.querySelector<HTMLElement>('.tm-scroll-area');

    expect(scrollWithFab?.style.paddingBottom).toBe('var(--v1-shell-fab-clear-pad)');
    expect(scrollWithoutFab?.style.paddingBottom).toBe('var(--v1-shell-scroll-bottom-pad)');
  });

  // bottomNav 자체가 없는 화면(상세·폼)은 FAB 클리어런스를 계산할 기준(하단 탭 높이)이 없으므로
  // floatingSlot이 딸려 와도 여백을 인라인으로 정하지 않는다. 인라인 padding-bottom 은 어떤 값이든
  // globals.css 의 .tm-app-frame-no-bottom 규칙(안전영역 끝 여백, .tm-fixed-cta·채팅방 예외)을
  // 이기므로 비워 두어야 그 규칙이 적용된다.
  it('bottomNav가 없으면 floatingSlot이 있어도 끝 여백을 인라인으로 정하지 않는다', () => {
    const { container } = render(
      <AppChrome
        title="테스트"
        showNotifications={false}
        bottomNav={false}
        floatingSlot={<button type="button">FAB</button>}
      >
        <div>본문</div>
      </AppChrome>,
    );

    expect(container.querySelector('.tm-app-frame')).toHaveClass('tm-app-frame-no-bottom');
    expect(container.querySelector<HTMLElement>('.tm-scroll-area')?.style.paddingBottom).toBe('');
  });
});

// 지금 화면의 주 탭을 다시 누르면 라우터 이동 없이 스크롤 상자가 맨 위로 올라간다(네이티브 탭바 관례).
describe('AppChrome 주 탭 다시 누르기 — 맨 위로', () => {
  const realMatchMedia = window.matchMedia;

  function stubMedia({ desktop = false, reduce = false } = {}) {
    window.matchMedia = ((query: string) => ({
      matches: (query.includes('min-width: 1024px') && desktop) || (query.includes('prefers-reduced-motion: reduce') && reduce),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
  }

  /** 클릭 뒤 기본 동작이 막혔는지 기록한다. jsdom 의 앵커 이동은 기록 뒤에 막아 둔다. */
  function clickAndReport(link: HTMLElement) {
    let prevented: boolean | null = null;
    const record = (event: Event) => { prevented = event.defaultPrevented; event.preventDefault(); };
    window.addEventListener('click', record, { once: true });
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    window.removeEventListener('click', record);
    return prevented;
  }

  function renderShell(children: ReactNode = <div>본문</div>) {
    const view = render(<AppChrome title="테스트" showNotifications={false}>{children}</AppChrome>);
    const area = view.container.querySelector<HTMLElement>('.tm-scroll-area')!;
    const scrollTo = vi.fn();
    area.scrollTo = scrollTo as unknown as HTMLElement['scrollTo'];
    return { area, scrollTo };
  }

  const bottomTab = (label: string) => within(screen.getByRole('navigation', { name: '주요 메뉴' })).getByRole('link', { name: label });

  beforeEach(() => {
    window.history.replaceState(null, '', '/tournaments');
    window.sessionStorage.clear();
    stubMedia();
  });
  afterEach(() => {
    window.matchMedia = realMatchMedia;
    window.sessionStorage.clear();
  });

  it('하단 탭: 같은 탭을 다시 누르면 이동을 막고 부드럽게 맨 위로 올리며 목표값 0 을 먼저 저장한다', () => {
    saveScrollPosition('/tournaments', 1200);
    const { area, scrollTo } = renderShell();
    area.scrollTop = 1200;

    expect(clickAndReport(bottomTab('대회'))).toBe(true);
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
    expect(readScrollPosition('/tournaments')).toBe(0);
  });

  it('동작 줄이기를 켜면 즉시 맨 위로 간다', () => {
    stubMedia({ reduce: true });
    const { area, scrollTo } = renderShell();
    area.scrollTop = 1200;

    clickAndReport(bottomTab('대회'));
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'auto' });
  });

  it('이미 맨 위면 스크롤을 부르지 않고 이동도 일으키지 않는다', () => {
    const { scrollTo } = renderShell();

    expect(clickAndReport(bottomTab('대회'))).toBe(true);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('다른 탭을 누르면 기존 이동에 맡긴다(막지 않고 스크롤하지 않는다)', () => {
    saveScrollPosition('/tournaments', 1200);
    const { area, scrollTo } = renderShell();
    area.scrollTop = 1200;

    expect(clickAndReport(bottomTab('팀'))).toBe(false);
    expect(scrollTo).not.toHaveBeenCalled();
    expect(readScrollPosition('/tournaments')).toBe(1200);
  });

  it('검색 조건이 붙은 화면에서 탭을 누르면 같은 화면이 아니라 기존 이동이다', () => {
    window.history.replaceState(null, '', '/tournaments?kind=league');
    const { area, scrollTo } = renderShell();
    area.scrollTop = 1200;

    expect(clickAndReport(bottomTab('대회'))).toBe(false);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('화면 안 세부 탭은 같은 주소여도 건드리지 않는다', () => {
    const { area, scrollTo } = renderShell(
      <div className="tm-segmented-tabs"><a className="tm-segmented-tab" href="/tournaments">전체</a></div>,
    );
    area.scrollTop = 1200;

    expect(clickAndReport(screen.getByRole('link', { name: '전체' }))).toBe(false);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('데스크톱 상단 탭: 문서 스크롤을 부드럽게 맨 위로 올린다', () => {
    stubMedia({ desktop: true });
    const windowScrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    Object.defineProperty(window, 'scrollY', { value: 1200, configurable: true });
    try {
      const { scrollTo } = renderShell();
      const tab = within(screen.getByRole('navigation', { name: '데스크톱 주요 메뉴' })).getByRole('link', { name: '대회' });

      expect(clickAndReport(tab)).toBe(true);
      expect(windowScrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
      expect(scrollTo).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
      windowScrollTo.mockRestore();
    }
  });
});
