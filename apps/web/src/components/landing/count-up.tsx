'use client';

import { useRef, useEffect, useState } from 'react';

interface CountUpProps {
  value: string;
  className?: string;
}

export function CountUp({ value, className = '' }: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState(value);
  const [triggered, setTriggered] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !triggered) {
          setTriggered(true);
          observer.unobserve(el);
        }
      },
      { threshold: 0.5 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [triggered]);

  useEffect(() => {
    if (!triggered) return;

    // Extract numeric part (handle comma-separated numbers like "2,400")
    const cleaned = value.replace(/,/g, '');
    const numMatch = cleaned.match(/(\d+)/);
    if (!numMatch) {
      setDisplay(value);
      return;
    }

    const target = parseInt(numMatch[1]);
    // Find position in original string (accounting for removed commas)
    const cleanedPrefix = cleaned.slice(0, numMatch.index);
    const cleanedSuffix = cleaned.slice((numMatch.index ?? 0) + numMatch[1].length);
    const hasComma = value.includes(',');
    const prefix = cleanedPrefix;
    const suffix = cleanedSuffix;
    const duration = 800;
    const start = performance.now();

    let rafId = 0;
    const animate = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 4);
      const current = Math.round(eased * target);
      const formatted = hasComma ? current.toLocaleString() : String(current);
      setDisplay(`${prefix}${formatted}${suffix}`);
      if (progress < 1) rafId = requestAnimationFrame(animate);
    };

    setDisplay(`${prefix}${hasComma ? '0' : '0'}${suffix}`);
    rafId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId);
  }, [triggered, value]);

  return (
    <span ref={ref} className={className}>
      {display}
    </span>
  );
}
