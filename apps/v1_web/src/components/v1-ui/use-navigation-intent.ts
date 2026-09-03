'use client';

import { useEffect, useRef } from 'react';
import { TAB_CONTAINER_SELECTOR } from './navigation-tab-selectors';

export type NavigationIntentKind = 'push' | 'pop' | 'tab' | 'native' | 'search';

/**
 * iOS 셸의 popstate 는 엣지 스와이프가 대부분이고, 그 스와이프는 **네이티브가 이미
 * 슬라이드를 그린 뒤**다(WKWebView allowsBackForwardNavigationGestures). 여기서 다시
 * 'pop' 을 주면 웹 전환이 그 위에 한 번 더 겹친다. 그래서 'native' — "셸이 이미
 * 애니메이션했다, 웹은 그리지 말라" — 로 분류한다. 프로그램적 뒤로가기(router.back)도
 * 같은 popstate 라 함께 애니메이션이 없어지는데, iOS 에서 그 경로는 드물고 두 겹보다 낫다.
 * 클릭으로 누르는 뒤로가기(‹, data-nav-back)는 popstate 가 아니라 클릭이라 영향 없다.
 */
function isIosShell(): boolean {
  return document.documentElement.dataset.teameetNativeApp === 'ios';
}


export interface NavigationIntentHandlers {
  /** 내부 네비게이션이 "시작"되는 순간(클릭/popstate) — 아직 URL은 안 바뀜. */
  onIntent: (kind: NavigationIntentKind) => void;
}

/**
 * route-progress.tsx가 갖고 있던 클릭(capture)/popstate 캡처를 추출한 것.
 * 진행바와 전환 컨트롤러 둘 다 "내부 링크를 눌렀다/뒤로 갔다"를 알아야 하는데,
 * 로직을 복붙하면 한쪽만 고쳐지는 순간 두 기능이 갈린다 — 그래서 훅으로 뺀다.
 *
 * kind 판별 순서:
 *  1. `TAB_CONTAINER_SELECTOR`(하단 탭·데스크톱 상단 탭·화면 안 세부 탭) 안의 앵커 클릭
 *     → 'tab' (동위 전환, 슬라이드 없음)
 *  2. `data-nav-back="true"` 앵커 클릭 → 'pop' (AppBackLink — 실제로는 history push지만
 *     사용자 멘탈모델은 "뒤로"이므로 시각적으로 pop 취급. app-back-link.tsx가 이 속성을 단다)
 *  3. 그 외 내부 앵커 클릭 → 'push', 단 pathname 이 그대로고 search 만 바뀌면 'search'로
 *     재분류(FS-1) — 이 재분류는 **반드시 1·2번 뒤에** 온다. 세부 탭(`.tm-segmented-tabs`)도
 *     "쿼리만 바뀌는" 이동이라, pathname 동일 여부를 먼저 보면 세부 탭까지 'search'로
 *     잘못 삼켜 그 탭의 'tab' 분류(콘텐츠 VT 없음)가 깨진다 — 순서를 반드시 지킨다.
 *     필터 시트(칩 선택·열기/닫기)처럼 시트 자체 애니메이션을 이미 갖고 있어 페이지
 *     VT(슬라이드+페이드)가 그 위에 겹치면 안 되는 이동이 'search'의 실제 대상이다.
 *  4. popstate 이벤트(하드웨어 백버튼·엣지 스와이프·브라우저 뒤로) → 'pop'
 *     단 iOS 셸 안이면 'native' — 엣지 스와이프를 네이티브가 이미 그렸으므로 웹은 안 그린다
 *
 * popstate가 forward 버튼에서도 발생하는 것(브라우저 앞으로가기)은 알려진 한계다 — 이
 * 경우도 'pop'으로 분류된다. 모바일 WebView에서 forward 버튼 사용은 극히 드물어(하드웨어
 * 버튼 자체가 없는 경우가 대부분) 실사용 영향이 적다고 판단해 별도 history-index 추적을
 * 추가하지 않았다. 사용자 리포트가 쌓이면 `history.state.idx`를 우리가 직접 증가시켜
 * 비교하는 방식으로 보강할 수 있다.
 */
export function useNavigationIntent({ onIntent }: NavigationIntentHandlers) {
  const handlersRef = useRef({ onIntent });
  handlersRef.current = { onIntent };

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as HTMLElement | null)?.closest?.('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (!href || anchor.getAttribute('target') === '_blank' || anchor.hasAttribute('download')) return;
      if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;

      const baseKind: NavigationIntentKind = anchor.closest(TAB_CONTAINER_SELECTOR)
        ? 'tab'
        : anchor.dataset.navBack === 'true'
          ? 'pop'
          : 'push';
      // 'search' 는 'push'의 하위분류다 — 반드시 tab/pop 판별 뒤에 온다(위 docstring 3번).
      // 세부 탭도 pathname 이 같은 쿼리 이동이라, 순서를 앞당기면 'tab' 분류를 삼켜버린다.
      const kind: NavigationIntentKind =
        baseKind === 'push' && url.pathname === window.location.pathname ? 'search' : baseKind;
      handlersRef.current.onIntent(kind);
    };

    const onPopState = () => handlersRef.current.onIntent(isIosShell() ? 'native' : 'pop');

    document.addEventListener('click', onClick, true);
    window.addEventListener('popstate', onPopState);
    return () => {
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('popstate', onPopState);
    };
  }, []);
}
