import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { reportClientError } from '@/lib/client-error-reporter';
import type { V1AdEvent } from '@/types/ads';
import {
  AD_EVENT_BATCH_MAX,
  AD_EVENT_FLUSH_DELAY_MS,
  createAdEventBatcher,
  trackAdClick,
  trackAdImpression,
} from './ad-events';

vi.mock('@/lib/client-error-reporter', () => ({ reportClientError: vi.fn() }));

const reportMock = vi.mocked(reportClientError);

const impression = (n: number): V1AdEvent => ({ campaignId: `campaign-${n}`, channel: 'banner', type: 'impression' });

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('createAdEventBatcher', () => {
  const send = vi.fn<(events: V1AdEvent[]) => Promise<void>>();
  let batcher: ReturnType<typeof createAdEventBatcher>;

  beforeEach(() => {
    vi.useFakeTimers();
    send.mockReset();
    send.mockResolvedValue(undefined);
    reportMock.mockClear();
    batcher = createAdEventBatcher({ send });
  });

  afterEach(() => {
    batcher.dispose();
    Reflect.deleteProperty(document, 'visibilityState');
    vi.useRealTimers();
  });

  it('sends events queued close together as one request after the delay', () => {
    batcher.queue(impression(1));
    batcher.queue(impression(2));
    batcher.queue({ campaignId: 'campaign-3', channel: 'popup', type: 'click' });
    expect(send).not.toHaveBeenCalled();

    vi.advanceTimersByTime(AD_EVENT_FLUSH_DELAY_MS);

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith([
      impression(1),
      impression(2),
      { campaignId: 'campaign-3', channel: 'popup', type: 'click' },
    ]);
  });

  it('counts the delay from the first queued event so a steady trickle cannot postpone sending', () => {
    batcher.queue(impression(1));
    vi.advanceTimersByTime(AD_EVENT_FLUSH_DELAY_MS - 500);
    batcher.queue(impression(2));
    vi.advanceTimersByTime(500);

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith([impression(1), impression(2)]);
  });

  it('splits a burst into requests of at most 20 events without losing or reordering any', () => {
    for (let n = 1; n <= 45; n += 1) batcher.queue(impression(n));

    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls.map(([events]) => events.length)).toEqual([AD_EVENT_BATCH_MAX, AD_EVENT_BATCH_MAX]);

    vi.advanceTimersByTime(AD_EVENT_FLUSH_DELAY_MS);

    expect(send).toHaveBeenCalledTimes(3);
    expect(send.mock.calls.flatMap(([events]) => events)).toEqual(Array.from({ length: 45 }, (_, i) => impression(i + 1)));
    expect(send.mock.calls[2][0]).toHaveLength(5);
  });

  it('flushes now and cancels the pending timer', () => {
    batcher.queue(impression(1));
    batcher.flush();
    expect(send).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(AD_EVENT_FLUSH_DELAY_MS * 2);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('does not send an empty batch', () => {
    batcher.flush();
    vi.advanceTimersByTime(AD_EVENT_FLUSH_DELAY_MS);
    expect(send).not.toHaveBeenCalled();
  });

  it('sends a click at once together with the impressions already waiting', () => {
    batcher.queue(impression(1));
    batcher.trackClick('campaign-9', 'popup');

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith([impression(1), { campaignId: 'campaign-9', channel: 'popup', type: 'click' }]);
  });

  it('flushes when the page is being hidden or unloaded, but not when it becomes visible', () => {
    batcher.queue(impression(1));
    setVisibility('visible');
    expect(send).not.toHaveBeenCalled();

    setVisibility('hidden');
    expect(send).toHaveBeenCalledTimes(1);

    batcher.queue(impression(2));
    window.dispatchEvent(new Event('pagehide'));
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith([impression(2)]);
  });

  it('stops listening once disposed', () => {
    batcher.queue(impression(1));
    batcher.dispose();

    window.dispatchEvent(new Event('pagehide'));
    vi.advanceTimersByTime(AD_EVENT_FLUSH_DELAY_MS);
    expect(send).not.toHaveBeenCalled();
  });

  it('records a failed request with the number of lost events and never resends them', async () => {
    send.mockRejectedValueOnce(Object.assign(new Error('Service Unavailable'), { code: 'SERVICE_UNAVAILABLE' }));
    batcher.queue(impression(1));
    batcher.queue(impression(2));
    batcher.flush();
    await vi.advanceTimersByTimeAsync(0);

    expect(reportMock).toHaveBeenCalledTimes(1);
    expect(reportMock).toHaveBeenCalledWith(expect.objectContaining({
      level: 'warn',
      context: { dropped: 2, code: 'SERVICE_UNAVAILABLE' },
    }));

    await vi.advanceTimersByTimeAsync(AD_EVENT_FLUSH_DELAY_MS * 5);
    expect(send).toHaveBeenCalledTimes(1);

    batcher.queue(impression(3));
    await vi.advanceTimersByTimeAsync(AD_EVENT_FLUSH_DELAY_MS);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith([impression(3)]);
  });

  it('keeps a failed click from throwing into the caller that is navigating away', async () => {
    send.mockRejectedValueOnce(new Error('offline'));

    expect(() => batcher.trackClick('campaign-1', 'banner')).not.toThrow();
    await vi.advanceTimersByTimeAsync(0);

    expect(reportMock).toHaveBeenCalledTimes(1);
  });
});

describe('shared batcher over the network', () => {
  const server = setupServer();
  const received: unknown[] = [];

  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterAll(() => server.close());
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1');
    received.length = 0;
    reportMock.mockClear();
  });
  afterEach(() => {
    server.resetHandlers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  function acceptEvents() {
    server.use(http.post('*/api/v1/ads/events', async ({ request }) => {
      received.push(await request.json());
      return new HttpResponse(null, { status: 204 });
    }));
  }

  it('posts a click immediately as the documented event body, kept alive past the page', async () => {
    acceptEvents();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    trackAdClick('0d7c1c9e-3f0a-4a52-9a53-0a6f3d7b1002', 'popup');

    await vi.waitFor(() => expect(received).toHaveLength(1));
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/ads/events'),
      expect.objectContaining({ method: 'POST', keepalive: true }),
    );
    expect(received[0]).toEqual({
      events: [{ campaignId: '0d7c1c9e-3f0a-4a52-9a53-0a6f3d7b1002', channel: 'popup', type: 'click' }],
    });
  });

  it('sends a queued impression when the page is hidden', async () => {
    acceptEvents();

    trackAdImpression('0d7c1c9e-3f0a-4a52-9a53-0a6f3d7b1001', 'banner');
    expect(received).toHaveLength(0);
    window.dispatchEvent(new Event('pagehide'));

    await vi.waitFor(() => expect(received).toHaveLength(1));
    expect(received[0]).toEqual({
      events: [{ campaignId: '0d7c1c9e-3f0a-4a52-9a53-0a6f3d7b1001', channel: 'banner', type: 'impression' }],
    });
  });

  it('records the loss when the server refuses the batch, and does not resend', async () => {
    let attempts = 0;
    server.use(http.post('*/api/v1/ads/events', () => {
      attempts += 1;
      return HttpResponse.json(
        { status: 'error', statusCode: 429, code: 'THROTTLED', message: 'Too many requests', timestamp: 'now' },
        { status: 429 },
      );
    }));

    trackAdClick('0d7c1c9e-3f0a-4a52-9a53-0a6f3d7b1002', 'popup');

    await vi.waitFor(() => expect(reportMock).toHaveBeenCalledWith(
      expect.objectContaining({ level: 'warn', context: { dropped: 1, code: 'THROTTLED' } }),
    ));
    expect(attempts).toBe(1);
  });
});
