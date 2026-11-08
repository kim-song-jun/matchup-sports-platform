import { v1Post } from '@/lib/api-client';
import { reportClientError } from '@/lib/client-error-reporter';
import { extractErrorCode } from '@/lib/error-message';
import type { V1AdChannel, V1AdEvent } from '@/types/ads';

/** `POST /ads/events` accepts 1-20 entries per request. */
export const AD_EVENT_BATCH_MAX = 20;
export const AD_EVENT_FLUSH_DELAY_MS = 2_000;

export interface AdEventBatcher {
  queue(event: V1AdEvent): void;
  /** Sends everything queued right now. */
  flush(): void;
  /** Queues a click and flushes at once, so it leaves before the page navigates away. */
  trackClick(campaignId: string, channel: V1AdChannel): void;
  /** Removes the page listeners and the pending timer. Queued events are not sent. */
  dispose(): void;
}

/**
 * Collects ad events and posts them in batches. A failed request is recorded and its events are dropped, never
 * resent: the server has no event id, so a retry after an unseen success would count twice.
 */
export function createAdEventBatcher({
  send,
  flushDelayMs = AD_EVENT_FLUSH_DELAY_MS,
}: {
  send: (events: V1AdEvent[]) => Promise<void>;
  flushDelayMs?: number;
}): AdEventBatcher {
  let pending: V1AdEvent[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  const clearTimer = () => {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
  };

  const flush = () => {
    clearTimer();
    if (pending.length === 0) return;
    const events = pending;
    pending = [];
    send(events).catch((error: unknown) => {
      reportClientError({
        message: 'Ad events were not delivered',
        level: 'warn',
        context: { dropped: events.length, code: extractErrorCode(error) },
      });
    });
  };

  const queue = (event: V1AdEvent) => {
    pending.push(event);
    if (pending.length >= AD_EVENT_BATCH_MAX) {
      flush();
    } else if (timer === null) {
      timer = setTimeout(flush, flushDelayMs);
    }
  };

  const onPageHide = () => flush();
  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') flush();
  };
  window.addEventListener('pagehide', onPageHide);
  document.addEventListener('visibilitychange', onVisibilityChange);

  return {
    queue,
    flush,
    trackClick(campaignId, channel) {
      queue({ campaignId, channel, type: 'click' });
      flush();
    },
    dispose() {
      clearTimer();
      pending = [];
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    },
  };
}

let sharedBatcher: AdEventBatcher | null = null;

/** `keepalive` lets the request finish after the page is gone; 20 events stay far below its 64 KB limit. */
function getSharedBatcher(): AdEventBatcher | null {
  if (typeof window === 'undefined') return null;
  sharedBatcher ??= createAdEventBatcher({
    send: (events) => v1Post<void>('/ads/events', { events }, { keepalive: true }),
  });
  return sharedBatcher;
}

/**
 * Counts a qualified impression (see `useAdImpression`). Never call it for previews or test traffic: the server
 * counts every accepted event for a published campaign.
 */
export function trackAdImpression(campaignId: string, channel: V1AdChannel): void {
  getSharedBatcher()?.queue({ campaignId, channel, type: 'impression' });
}

/** Counts the activation of the ad link. Sent immediately so it survives the navigation it triggers. */
export function trackAdClick(campaignId: string, channel: V1AdChannel): void {
  getSharedBatcher()?.trackClick(campaignId, channel);
}
