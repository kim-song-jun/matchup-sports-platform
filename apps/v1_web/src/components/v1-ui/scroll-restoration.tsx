'use client';

import { useEffect, useRef, type MouseEvent as ReactMouseEvent } from 'react';
import { usePathname } from 'next/navigation';
import { getCurrentRedirectPath } from '@/lib/session-storage';
import { readScrollPosition, saveScrollPosition } from '@/lib/scroll-positions';
import { installNavigationHistory, subscribeAppPop } from '@/lib/navigation-history';
import { locationHashId } from '@/lib/public-site/location-hash';
import { TAB_LINK_SELECTOR } from './navigation-tab-selectors';

const DESKTOP_QUERY = '(min-width: 1024px)'; // desktop/_shell.css 의 breakpoint 와 동일해야
  // 한다 — 이 값이 어긋나면 두 스크롤 모델(문서 vs .tm-scroll-area)이 서로 다른 지점에서
  // 전환돼 스크롤 대상이 어긋난다.
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const SAVE_DEBOUNCE_MS = 150;
const HASH_TARGET_WAIT_MS = 10_000;

/**
 * 이동의 종류. 'tab' 이 'push' 와 갈리는 것이 핵심이다.
 *
 * - push : 새 화면으로 들어간다(카드 클릭, CTA). 맨 위에서 시작하는 게 맞다.
 * - pop  : 뒤로/앞으로, 헤더 뒤로가기(data-nav-back). 보던 자리로 돌아가야 한다 —
 *          헤더 뒤로가기가 replace 로 가도 사용자에겐 "뒤로"다(전환 쪽 분류와 같게 둔다).
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

function isSameLocation(href: string): boolean {
  try {
    const url = new URL(href, window.location.href);
    return url.origin === window.location.origin
      && url.pathname === window.location.pathname
      && url.search === window.location.search;
  } catch {
    return false;
  }
}

/**
 * 하단 탭·데스크톱 상단 탭의 onClick. 지금 화면의 탭을 다시 누르면 라우터 이동 없이 스크롤 상자를
 * 맨 위로 올린다(동작 줄이기면 즉시). 다른 화면으로 가는 클릭은 건드리지 않는다.
 */
export function scrollToTopOnTabRetap(event: ReactMouseEvent<HTMLAnchorElement>) {
  if (event.defaultPrevented || event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const href = event.currentTarget.getAttribute('href');
  if (!href || !isSameLocation(href)) return;
  event.preventDefault();
  const el = getScrollElement();
  if (!el || getScrollTop(el) <= 0) return;
  // 디바운스 저장은 화면이 바뀌면 버려진다 — 올라가는 도중 다른 탭으로 가도 돌아오면 맨 위이도록 목표값을 먼저 적는다.
  saveScrollPosition(getCurrentRedirectPath(), 0);
  const reduce = window.matchMedia(REDUCED_MOTION_QUERY).matches;
  el.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
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
export function restoreWhenTallEnough(el: ScrollHost, target: number, onSettled?: () => void): () => void {
  const clientHeight = getClientHeight(el);
  let settled = false;
  let observer: ResizeObserver | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const release = () => {
    settled = true;
    observer?.disconnect();
    if (timeoutId !== null) clearTimeout(timeoutId);
  };

  const finish = (finalTop: number) => {
    if (settled) return;
    release();
    setScrollTop(el, finalTop);
    onSettled?.();
  };

  const tryRestore = () => {
    const maxScrollable = Math.max(0, getScrollHeight(el) - clientHeight);
    if (maxScrollable >= target) finish(target);
  };

  // 다음 이동이 시작되면 이전 복원이 새 화면의 scrollTop 을 건드리지 않게 끊는다. onSettled 는 부르지 않는다.
  const cancel = () => {
    if (!settled) release();
  };

  tryRestore();
  if (settled) return cancel;

  observer = new ResizeObserver(tryRestore);
  if (el === window) {
    observer.observe(document.documentElement);
  } else {
    // 모바일의 스크롤 상자는 크기가 고정이라 자기 자신은 내용이 자라도 resize 가 오지 않는다.
    // 높이를 만드는 것은 안쪽 자식이므로 자식을 지켜본다.
    for (const child of Array.from((el as Element).children)) observer.observe(child);
  }

  timeoutId = setTimeout(() => {
    const maxScrollable = Math.max(0, getScrollHeight(el) - clientHeight);
    finish(Math.min(target, maxScrollable));
  }, RESTORE_TIMEOUT_MS);
  return cancel;
}

/** 층위 §0 참고: layout.tsx 레벨에 마운트되는 부수효과 전용 컴포넌트. 항상 null 렌더. */
export function ScrollRestoration() {
  const pathname = usePathname();
  const navTypeRef = useRef<NavType>('push');
  const firstRenderRef = useRef(true);
  // 복원이 끝나기 전의 위치는 "보던 자리"가 아니라 새 화면의 맨 위라서 저장하면 안 된다.
  const restoringRef = useRef(false);
  const cancelRestoreRef = useRef<(() => void) | null>(null);

  useEffect(() => () => cancelRestoreRef.current?.(), []);

  // ① 저장 — 스크롤할 때마다(디바운스) 현재 라우트에 현재 위치를 적는다.
  // 스크롤은 버블링하지 않으므로 document 캡처 한 곳에서 받고, 스크롤 주체는 이벤트 때마다 다시 구한다 —
  // 첫 화면은 셸(.tm-scroll-area)이 이 효과보다 늦게 마운트돼 효과 시점에 구하면 window 로 떨어진다.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onScroll = (event: Event) => {
      const el = getScrollElement();
      if (!el || event.target !== (el === window ? document : el)) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (restoringRef.current) return;
        saveScrollPosition(getCurrentRedirectPath(), getScrollTop(el));
      }, SAVE_DEBOUNCE_MS);
    };
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => {
      document.removeEventListener('scroll', onScroll, { capture: true });
      if (timer) clearTimeout(timer);
    };
  }, [pathname]);

  // ② 방향 감지 — 앱 페이지 이동인 popstate(오버레이 pop 제외)와 헤더 뒤로가기 클릭이 "뒤로"다.
  useEffect(() => {
    installNavigationHistory();
    const unsubscribe = subscribeAppPop(() => { navTypeRef.current = 'pop'; });
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as HTMLElement | null)?.closest?.('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (!href || anchor.getAttribute('target') === '_blank' || anchor.hasAttribute('download')) return;
      if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
      // 같은 화면 링크는 pathname 이 안 바뀌어 ③이 소비하지 않는다 — 여기서 적으면 다음 프로그램적 이동까지 남는다.
      if (isSameLocation(href)) return;
      navTypeRef.current = anchor.closest(TAB_LINK_SELECTOR)
        ? 'tab'
        : anchor.dataset.navBack === 'true'
          ? 'pop'
          : 'push';
    };
    document.addEventListener('click', onClick, true);
    return () => {
      unsubscribe();
      document.removeEventListener('click', onClick, true);
    };
  }, []);

  // ③ 적용 — pathname 이 실제로 바뀌면 방향에 따라 top=0, hash target, 또는 복원.
  useEffect(() => {
    cancelRestoreRef.current?.();
    cancelRestoreRef.current = null;
    restoringRef.current = false;
    const el = getScrollElement();
    const scrollToHashTarget = () => {
      const hash = window.location.hash;
      if (!hash) return { requested: false, dispose: () => {} };

      const id = locationHashId(hash);
      let observer: MutationObserver | null = null;
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      const dispose = () => {
        observer?.disconnect();
        if (timeoutId !== null) clearTimeout(timeoutId);
        window.removeEventListener('hashchange', dispose);
      };
      const scroll = () => {
        if (window.location.hash !== hash) {
          dispose();
          return false;
        }
        const target = document.getElementById(id);
        if (!target) return false;
        dispose();
        target.scrollIntoView();
        const currentEl = getScrollElement();
        if (currentEl) saveScrollPosition(getCurrentRedirectPath(), getScrollTop(currentEl));
        return true;
      };

      if (scroll()) return { requested: true, dispose: () => {} };

      // Streamed route content may add the fragment after this pathname commit. Observe DOM
      // growth instead of guessing a delay, and release the observer when the route changes.
      observer = new MutationObserver(scroll);
      observer.observe(document.body, { childList: true, subtree: true });
      window.addEventListener('hashchange', dispose);
      // A fragment can point to an optional section. Bound observation work if it never appears.
      timeoutId = setTimeout(dispose, HASH_TARGET_WAIT_MS);
      return { requested: true, dispose };
    };

    if (firstRenderRef.current) {
      firstRenderRef.current = false;
      // App Router의 초기 렌더가 fragment 이동을 보장하지 않아, hydration 후 이 효과가 hash target 이동을 보완한다.
      const hashScroll = scrollToHashTarget();
      if (hashScroll.requested) {
        return hashScroll.dispose;
      }
      // 일반 최초 마운트(새로고침/콜드스타트)는 브라우저의 현재 위치를 보존한다.
      // 스크롤해야만 저장되므로, 지금 위치를 적어 두지 않으면 예전 방문의 값이 남아 나중에 그리로 복원된다.
      if (el) saveScrollPosition(getCurrentRedirectPath(), getScrollTop(el));
      return;
    }
    if (!el) return;

    if (navTypeRef.current === 'pop' || navTypeRef.current === 'tab') {
      const saved = readScrollPosition(getCurrentRedirectPath());
      if (saved != null) {
        restoringRef.current = true;
        cancelRestoreRef.current = restoreWhenTallEnough(el, saved, () => { restoringRef.current = false; });
      }
      // 저장된 값이 없으면(예: 딥링크로 직접 진입, 또는 그 탭에 처음 들어감) 아무 것도
      // 하지 않는다 — 이미 0이다.
    } else {
      const hashScroll = scrollToHashTarget();
      if (hashScroll.requested) {
        // Next.js scrolls fragments during its layout effect; preserve that position in this later effect.
        if (!document.getElementById(locationHashId(window.location.hash))) setScrollTop(el, 0);
        return hashScroll.dispose;
      }
      setScrollTop(el, 0);
      saveScrollPosition(getCurrentRedirectPath(), 0); // 새로 들어온 화면이 예전 위치를 덮어쓴다.
    }
    navTypeRef.current = 'push'; // 소비했으니 기본값으로 되돌린다 — 다음 pathname 변경이
      // popstate 없이 일어나면(프로그램적 router.push 등) push 로 취급한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return null;
}
