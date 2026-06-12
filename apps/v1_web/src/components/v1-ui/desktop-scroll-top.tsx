'use client';

import { useEffect, useState } from 'react';
import { ChevronLeftIcon } from './icons';

/**
 * Desktop-only "scroll to top" button. Appears after the user scrolls down on
 * long document-scroll pages (desktop uses native window scroll). Hidden on
 * mobile via CSS (`.tm-desktop-scrolltop` is display:none below 1024px).
 */
export function DesktopScrollTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 280);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <button
      type="button"
      className={`tm-desktop-scrolltop ${visible ? 'is-visible' : ''}`}
      aria-label="맨 위로 이동"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
    >
      {/* rotate the chevron to point up */}
      <ChevronLeftIcon size={22} strokeWidth={2.4} />
    </button>
  );
}
