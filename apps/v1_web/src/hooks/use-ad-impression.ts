import { useEffect, useRef, type RefObject } from 'react';
import { trackAdImpression } from '@/lib/ad-events';
import type { V1AdChannel } from '@/types/ads';

/** An impression is an ad that stayed at least half visible, in a visible tab, for a full second. */
export const AD_IMPRESSION_MIN_VISIBLE_RATIO = 0.5;
export const AD_IMPRESSION_MIN_VISIBLE_MS = 1_000;

/**
 * Counts one impression for the element in `ref` once it has been at least half visible in a visible tab for one
 * continuous second. Hiding the element below half, or hiding the tab, restarts that second. The same creative is
 * counted once per hook instance, so a popup that reopens or a banner that scrolls back is not counted again.
 *
 * `enabled` must be true only while the element is in the DOM; pass `false` for previews and test traffic, which the
 * server would otherwise count. Where `IntersectionObserver` is missing nothing is counted: visibility cannot be known.
 */
export function useAdImpression(
  ref: RefObject<Element | null>,
  { campaignId, channel, enabled = true }: { campaignId: string; channel: V1AdChannel; enabled?: boolean },
): void {
  const counted = useRef(new Set<string>());

  useEffect(() => {
    const creativeKey = `${channel}:${campaignId}`;
    const element = ref.current;
    if (!enabled || !element || counted.current.has(creativeKey)) return;
    if (typeof IntersectionObserver === 'undefined') return;

    let sufficientlyVisible = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const stopTimer = () => {
      if (timer === null) return;
      clearTimeout(timer);
      timer = null;
    };

    const stopWatching = () => {
      stopTimer();
      observer.disconnect();
      document.removeEventListener('visibilitychange', sync);
    };

    const sync = () => {
      if (!sufficientlyVisible || document.visibilityState !== 'visible') {
        stopTimer();
        return;
      }
      if (timer !== null) return;
      timer = setTimeout(() => {
        counted.current.add(creativeKey);
        trackAdImpression(campaignId, channel);
        stopWatching();
      }, AD_IMPRESSION_MIN_VISIBLE_MS);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        const latest = entries.at(-1);
        if (!latest) return;
        sufficientlyVisible = latest.isIntersecting && latest.intersectionRatio >= AD_IMPRESSION_MIN_VISIBLE_RATIO;
        sync();
      },
      { threshold: AD_IMPRESSION_MIN_VISIBLE_RATIO },
    );
    observer.observe(element);
    document.addEventListener('visibilitychange', sync);

    return stopWatching;
  }, [ref, campaignId, channel, enabled]);
}
