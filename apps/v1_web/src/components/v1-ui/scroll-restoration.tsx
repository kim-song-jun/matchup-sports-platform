'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { getCurrentRedirectPath } from '@/lib/session-storage';
import { readScrollPosition, saveScrollPosition } from '@/lib/scroll-positions';

const DESKTOP_QUERY = '(min-width: 1024px)'; // desktop/_shell.css 의 breakpoint 와 동일해야
  // 한다 — 이 값이 어긋나면 두 스크롤 모델(문서 vs .tm-scroll-area)이 서로 다른 지점에서
  // 전환돼 스크롤 대상이 어긋난다.
const SAVE_DEBOUNCE_MS = 150;

/**
 * 이동의 종류. 'tab' 이 'push' 와 갈리는 것이 핵심이다.
 *
 * - push : 새 화면으로 들어간다(카드 클릭, CTA). 맨 위에서 시작하는 게 맞다.
 * - pop  : 뒤로/앞으로. 보던 자리로 돌아가야 한다.
 * - tab  : 하단 탭·데스크톱 상단 탭. **뒤로가기는 아니지만 "돌아가기"다.**
 *
 * 처음에는 tab 을 push 로 뭉뚱그렸다가, 실측에서 그게 정확히 "새로고침당한" 체감의
 * 원인이라는 것이 드러났다 — 대회 목록을 500px 굴려 놓고 팀 탭에 갔다 돌아오면 0px 였다.
 * iOS 탭바·안드로이드 하단 내비는 탭마다 스크롤 위치를 들고 있으므로, 이 앱만 매번
 * 처음으로 되돌리면 네이티브 앱과 다르게 느껴진다.
 *
 * 대가: 목록이 그사이 갱신됐다면 사용자가 중간 지점에서 시작해 새로 올라온 항목을
 * 지나칠 수 있다. 콘텐츠가 짧아졌으면 restoreWhenTallEnough 가 도달 가능한 최댓값으로
 * 클램프하므로 화면 밖으로 튀지는 않는다.
 */
type NavType = 'push' | 'pop' | 'tab';

/**
 * 하단 탭(모바일) · 상단 탭(데스크톱) · 화면 안 세부 탭(SegmentedTabs).
 * shell.tsx / segmented-tabs.tsx 가 붙이는 클래스와 같아야 하고,
 * `use-navigation-intent.ts` 의 `TAB_CONTAINER_SELECTOR` 와 **같은 집합**이어야 한다 —
 * 한쪽만 늘리면 전환은 탭인데 스크롤은 페이지 이동으로 취급되는 어긋난 상태가 된다.
 */
const TAB_LINK_SELECTOR = '.tm-bottom-tab, .tm-desktop-nav-tab, .tm-segmented-tab';
const RESTORE_TIMEOUT_MS = 1500;

type ScrollHost = Element | (Window & typeof globalThis);

function getScrollElement(): ScrollHost | null {
  if (typeof window === 'undefined') return null;
  if (window.matchMedia(DESKTOP_QUERY).matches) return window;
  return document.querySelector('.tm-scroll-area') ?? window;
}

function getScrollTop(el: ScrollHost): number {
  return el === window ? window.scrollY : (el as Element).scrollTop;
}
function setScrollTop(el: ScrollHost, top: number) {
  if (el === window) window.scrollTo(0, top);
  else (el as Element).scrollTop = top;
}
function getScrollHeight(el: ScrollHost): number {
  return el === window ? document.documentElement.scrollHeight : (el as Element).scrollHeight;
}
function getClientHeight(el: ScrollHost): number {
  return el === window ? window.innerHeight : (el as Element).clientHeight;
}

/**
 * 저장된 목표 위치까지 스크롤 가능한 높이가 아직 안 나왔으면(예: 무한스크롤 목록이
 * 첫 페이지만 렌더된 상태) ResizeObserver 로 콘텐츠가 자라는 것을 기다렸다가 복원한다.
 *
 * 스켈레톤→콘텐츠 전환(Wave 2)의 구체적 구현을 몰라도 동작한다 — 무엇이 높이를
 * 만들었는지 상관하지 않고 **실제로 측정된 scrollHeight**만 본다. 그래서 이 컴포넌트는
 * Wave 2 스켈레톤 컴포넌트와 별도 연동 코드가 필요 없다.
 *
 * RESTORE_TIMEOUT_MS 안에 목표 높이에 도달하지 못하면(예: 캐시가 비어 첫 페이지
 * 20개만 있는데 5,000px 지점을 복원하려는 경우) 지금 도달 가능한 최댓값으로 클램프하고
 * 포기한다 — 사용자를 무작정 맨 위로 되돌리는 것보다 보던 지점에 더 가깝다.
 */
export function restoreWhenTallEnough(el: ScrollHost, target: number): void {
  const clientHeight = getClientHeight(el);
  let settled = false;
  let observer: ResizeObserver | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const finish = (finalTop: number) => {
    if (settled) return;
    settled = true;
    observer?.disconnect();
    if (timeoutId !== null) clearTimeout(timeoutId);
    setScrollTop(el, finalTop);
  };

  const tryRestore = () => {
    const maxScrollable = Math.max(0, getScrollHeight(el) - clientHeight);
    if (maxScrollable >= target) finish(target);
  };

  tryRestore();
  if (settled) return;

  const node = el === window ? document.documentElement : (el as Element);
  observer = new ResizeObserver(tryRestore);
  observer.observe(node);

  timeoutId = setTimeout(() => {
    const maxScrollable = Math.max(0, getScrollHeight(el) - clientHeight);
    finish(Math.min(target, maxScrollable));
  }, RESTORE_TIMEOUT_MS);
}

/** 층위 §0 참고: layout.tsx 레벨에 마운트되는 부수효과 전용 컴포넌트. 항상 null 렌더. */
export function ScrollRestoration() {
  const pathname = usePathname();
  const navTypeRef = useRef<NavType>('push');
  const firstRenderRef = useRef(true);

  // ① 저장 — 스크롤할 때마다(디바운스) 현재 라우트에 현재 위치를 적는다.
  useEffect(() => {
    const el = getScrollElement();
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onScroll = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        saveScrollPosition(getCurrentRedirectPath(), getScrollTop(el));
      }, SAVE_DEBOUNCE_MS);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // ② 방향 감지 — popstate 만 "뒤로/앞으로"다. RouteProgressBar 와 동일한 클릭 캡처 패턴.
  useEffect(() => {
    const onPopState = () => { navTypeRef.current = 'pop'; };
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as HTMLElement | null)?.closest?.('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (!href || anchor.getAttribute('target') === '_blank' || anchor.hasAttribute('download')) return;
      if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
      navTypeRef.current = anchor.closest(TAB_LINK_SELECTOR) ? 'tab' : 'push';
    };
    window.addEventListener('popstate', onPopState);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('popstate', onPopState);
      document.removeEventListener('click', onClick, true);
    };
  }, []);

  // ③ 적용 — pathname 이 실제로 바뀌면 방향에 따라 top=0 또는 복원.
  useEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false; // 최초 마운트(새로고침/콜드스타트)는 브라우저 기본에 맡긴다.
      return;
    }
    const el = getScrollElement();
    if (!el) return;

    if (navTypeRef.current === 'pop' || navTypeRef.current === 'tab') {
      const saved = readScrollPosition(getCurrentRedirectPath());
      if (saved != null) restoreWhenTallEnough(el, saved);
      // 저장된 값이 없으면(예: 딥링크로 직접 진입, 또는 그 탭에 처음 들어감) 아무 것도
      // 하지 않는다 — 이미 0이다.
    } else {
      setScrollTop(el, 0);
    }
    navTypeRef.current = 'push'; // 소비했으니 기본값으로 되돌린다 — 다음 pathname 변경이
      // popstate 없이 일어나면(프로그램적 router.push 등) push 로 취급한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return null;
}
