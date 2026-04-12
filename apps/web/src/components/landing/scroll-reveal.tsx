'use client';

import { useRef, useEffect, useState, type ReactNode } from 'react';

interface ScrollRevealProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  direction?: 'up' | 'left' | 'right' | 'none';
}

const TRANSFORMS: Record<string, string> = {
  up: 'translate3d(0, 24px, 0)',
  left: 'translate3d(-24px, 0, 0)',
  right: 'translate3d(24px, 0, 0)',
  none: 'translate3d(0, 0, 0)',
};

export function ScrollReveal({ children, className = '', delay = 0, direction = 'up' }: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  // Start visible so SSR and no-JS clients always see content.
  // After mount, reset to false then let IntersectionObserver trigger the reveal.
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVisible(true);
      return;
    }

    // Reset to hidden only after the observer is attached, preventing a flash.
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.unobserve(el);
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
    );

    observer.observe(el);
    setVisible(false);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translate3d(0, 0, 0)' : TRANSFORMS[direction],
        transition: `opacity 0.6s cubic-bezier(0.25, 1, 0.5, 1) ${delay}ms, transform 0.6s cubic-bezier(0.25, 1, 0.5, 1) ${delay}ms`,
        willChange: visible ? 'auto' : 'opacity, transform',
      }}
    >
      {children}
    </div>
  );
}
