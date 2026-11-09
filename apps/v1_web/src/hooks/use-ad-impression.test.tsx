import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { trackAdImpression } from '@/lib/ad-events';
import type { V1AdChannel } from '@/types/ads';
import { useAdImpression } from './use-ad-impression';

vi.mock('@/lib/ad-events', () => ({ trackAdImpression: vi.fn() }));

const trackMock = vi.mocked(trackAdImpression);

/** jsdom has no layout, so a test decides what the observer reports; the hook's timing is what is under test. */
class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  readonly observed = new Set<Element>();
  disconnected = false;

  constructor(
    private readonly callback: IntersectionObserverCallback,
    readonly options?: IntersectionObserverInit,
  ) {
    FakeIntersectionObserver.instances.push(this);
  }

  observe(element: Element) {
    this.observed.add(element);
  }

  unobserve(element: Element) {
    this.observed.delete(element);
  }

  disconnect() {
    this.disconnected = true;
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  report(ratio: number) {
    const [target] = [...this.observed];
    this.callback([{ target, intersectionRatio: ratio, isIntersecting: ratio > 0 } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
  }
}

function liveObserver(): FakeIntersectionObserver {
  const observer = FakeIntersectionObserver.instances.find((candidate) => !candidate.disconnected);
  if (!observer) throw new Error('no live observer');
  return observer;
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

type Props = { campaignId: string; channel: V1AdChannel; enabled?: boolean };

function renderImpression(initialProps: Props) {
  const element = document.createElement('div');
  document.body.append(element);
  const ref = { current: element };
  return renderHook((props: Props) => useAdImpression(ref, props), { initialProps });
}

const banner: Props = { campaignId: 'campaign-a', channel: 'banner' };

beforeEach(() => {
  vi.useFakeTimers();
  FakeIntersectionObserver.instances = [];
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  Reflect.deleteProperty(document, 'visibilityState');
  document.body.replaceChildren();
});

describe('useAdImpression', () => {
  it('asks to be woken when half of the element is visible', () => {
    renderImpression(banner);

    expect(liveObserver().options).toMatchObject({ threshold: 0.5 });
  });

  it('counts once after the ad stays at least half visible for a full second', () => {
    renderImpression(banner);
    liveObserver().report(0.6);

    vi.advanceTimersByTime(999);
    expect(trackMock).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(trackMock).toHaveBeenCalledTimes(1);
    expect(trackMock).toHaveBeenCalledWith('campaign-a', 'banner');
  });

  it('does not count an ad that never gets half visible', () => {
    renderImpression(banner);
    liveObserver().report(0.49);

    vi.advanceTimersByTime(10_000);
    expect(trackMock).not.toHaveBeenCalled();
  });

  it('does not count an ad that is covered after half a second, and restarts the full second when it returns', () => {
    renderImpression(banner);
    liveObserver().report(0.9);
    vi.advanceTimersByTime(500);
    liveObserver().report(0.2);
    vi.advanceTimersByTime(5_000);
    expect(trackMock).not.toHaveBeenCalled();

    liveObserver().report(0.9);
    vi.advanceTimersByTime(999);
    expect(trackMock).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(trackMock).toHaveBeenCalledTimes(1);
  });

  it('counts the same creative only once per screen instance, however often it scrolls back', () => {
    const { rerender } = renderImpression(banner);
    liveObserver().report(0.9);
    vi.advanceTimersByTime(1_000);
    expect(trackMock).toHaveBeenCalledTimes(1);

    // A popup that closes and opens again re-runs the effect on the same hook instance.
    rerender({ ...banner, enabled: false });
    rerender({ ...banner, enabled: true });
    for (const observer of FakeIntersectionObserver.instances.filter((candidate) => !candidate.disconnected)) {
      observer.report(0.1);
      observer.report(0.9);
    }
    vi.advanceTimersByTime(10_000);
    expect(trackMock).toHaveBeenCalledTimes(1);
  });

  it('counts a different creative separately but not one it already counted', () => {
    const { rerender } = renderImpression(banner);
    liveObserver().report(0.9);
    vi.advanceTimersByTime(1_000);

    rerender({ campaignId: 'campaign-b', channel: 'banner' });
    liveObserver().report(0.9);
    vi.advanceTimersByTime(1_000);
    expect(trackMock).toHaveBeenCalledTimes(2);
    expect(trackMock).toHaveBeenLastCalledWith('campaign-b', 'banner');

    rerender(banner);
    for (const observer of FakeIntersectionObserver.instances.filter((candidate) => !candidate.disconnected)) observer.report(0.9);
    vi.advanceTimersByTime(10_000);
    expect(trackMock).toHaveBeenCalledTimes(2);
  });

  it('restarts the second when the tab is hidden in the middle', () => {
    renderImpression(banner);
    liveObserver().report(0.9);
    vi.advanceTimersByTime(600);

    setVisibility('hidden');
    vi.advanceTimersByTime(5_000);
    expect(trackMock).not.toHaveBeenCalled();

    setVisibility('visible');
    vi.advanceTimersByTime(999);
    expect(trackMock).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(trackMock).toHaveBeenCalledTimes(1);
  });

  it('waits for the tab to become visible when it mounts in the background', () => {
    setVisibility('hidden');
    renderImpression(banner);
    liveObserver().report(0.9);
    vi.advanceTimersByTime(5_000);
    expect(trackMock).not.toHaveBeenCalled();

    setVisibility('visible');
    vi.advanceTimersByTime(1_000);
    expect(trackMock).toHaveBeenCalledTimes(1);
  });

  it('observes nothing while disabled, and counts normally once enabled', () => {
    const { rerender } = renderImpression({ ...banner, enabled: false });
    expect(FakeIntersectionObserver.instances).toHaveLength(0);

    rerender({ ...banner, enabled: true });
    liveObserver().report(0.9);
    vi.advanceTimersByTime(1_000);
    expect(trackMock).toHaveBeenCalledTimes(1);
  });

  it('drops a half-timed impression when disabled mid-way, such as a closed popup', () => {
    const { rerender } = renderImpression(banner);
    liveObserver().report(0.9);
    vi.advanceTimersByTime(500);

    rerender({ ...banner, enabled: false });
    vi.advanceTimersByTime(5_000);
    expect(trackMock).not.toHaveBeenCalled();
  });

  it('stops watching and cancels the timer on unmount', () => {
    const { unmount } = renderImpression(banner);
    const observer = liveObserver();
    observer.report(0.9);
    vi.advanceTimersByTime(500);

    unmount();
    vi.advanceTimersByTime(5_000);

    expect(observer.disconnected).toBe(true);
    expect(trackMock).not.toHaveBeenCalled();
  });

  it('counts nothing, and does not throw, where IntersectionObserver is unavailable', () => {
    vi.stubGlobal('IntersectionObserver', undefined);

    expect(() => renderImpression(banner)).not.toThrow();
    vi.advanceTimersByTime(10_000);
    expect(trackMock).not.toHaveBeenCalled();
  });
});
