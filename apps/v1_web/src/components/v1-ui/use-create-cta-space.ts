'use client';

import { useLayoutEffect, type RefObject } from 'react';

const CTA_HEIGHT_VAR = '--tm-create-cta-height';

/** Keep the last form field above its viewport-fixed action bar, including late native insets. */
export function useCreateCtaSpace(ref: RefObject<HTMLDivElement | null>, enabled = true) {
  useLayoutEffect(() => {
    if (!enabled) return undefined;
    const cta = ref.current;
    const scroll = cta?.closest<HTMLElement>('.tm-scroll-area');
    if (!cta || !scroll) return undefined;

    const sync = () => {
      const height = getComputedStyle(cta).position === 'fixed' ? cta.offsetHeight : 0;
      scroll.style.setProperty(CTA_HEIGHT_VAR, `${height}px`);
    };
    sync();
    window.addEventListener('resize', sync);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(sync);
    // A native inset can change only padding, so observe the entire border box.
    observer?.observe(cta, { box: 'border-box' });
    // Keyboard CSS can restore fixed positioning without changing the bar's dimensions.
    const keyboardObserver = new MutationObserver(sync);
    keyboardObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-teameet-native-keyboard'],
    });
    return () => {
      keyboardObserver.disconnect();
      observer?.disconnect();
      window.removeEventListener('resize', sync);
      scroll.style.removeProperty(CTA_HEIGHT_VAR);
    };
  }, [ref, enabled]);
}
