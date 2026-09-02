'use client';

import { useEffect, useRef } from 'react';
import { TAB_CONTAINER_SELECTOR } from './navigation-tab-selectors';

export type NavigationIntentKind = 'push' | 'pop' | 'tab';


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
 *  3. 그 외 내부 앵커 클릭 → 'push'
 *  4. popstate 이벤트(하드웨어 백버튼·엣지 스와이프·브라우저 뒤로) → 'pop'
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

      const kind: NavigationIntentKind = anchor.closest(TAB_CONTAINER_SELECTOR)
        ? 'tab'
        : anchor.dataset.navBack === 'true'
          ? 'pop'
          : 'push';
      handlersRef.current.onIntent(kind);
    };

    const onPopState = () => handlersRef.current.onIntent('pop');

    document.addEventListener('click', onClick, true);
    window.addEventListener('popstate', onPopState);
    return () => {
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('popstate', onPopState);
    };
  }, []);
}
