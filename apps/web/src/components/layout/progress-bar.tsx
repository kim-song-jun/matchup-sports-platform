'use client';

import { useEffect, useRef, useState, Suspense } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

/**
 * Tracks route changes via usePathname + useSearchParams.
 * Must be wrapped in Suspense because useSearchParams requires it.
 *
 * Animation sequence on route change:
 *   1. visible=true, progress=30  — bar appears at 30%
 *   2. +50ms  → progress=100     — bar fills to 100%
 *   3. +400ms → visible=false, progress=0 — bar hides
 */
function ProgressBarInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const fillTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // pathname/searchParams change = navigation completed
    if (fillTimer.current) clearTimeout(fillTimer.current);
    if (hideTimer.current) clearTimeout(hideTimer.current);

    setVisible(true);
    setProgress(30);

    fillTimer.current = setTimeout(() => setProgress(100), 50);
    hideTimer.current = setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, 400);

    return () => {
      if (fillTimer.current) clearTimeout(fillTimer.current);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [pathname, searchParams]);

  if (!visible && progress === 0) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] h-[2px]" aria-hidden="true">
      <div
        className="h-full bg-blue-500 transition-[width] duration-200 ease-out"
        style={{ width: `${progress}%`, opacity: 1 }}
      />
    </div>
  );
}

/**
 * Top progress bar that reacts to App Router navigation.
 * Replaces the previous document-level capture click listener approach.
 */
export function ProgressBar() {
  return (
    <Suspense fallback={null}>
      <ProgressBarInner />
    </Suspense>
  );
}
