import { afterEach, describe, expect, it, vi } from 'vitest';
import { getGaMeasurementId, trackEvent, trackPageview } from './analytics';

afterEach(() => {
  vi.unstubAllEnvs();
  delete (window as { gtag?: unknown }).gtag;
});

describe('getGaMeasurementId', () => {
  it('reads NEXT_PUBLIC_GA_MEASUREMENT_ID', () => {
    vi.stubEnv('NEXT_PUBLIC_GA_MEASUREMENT_ID', 'G-TEST123');
    expect(getGaMeasurementId()).toBe('G-TEST123');
  });

  it('returns undefined when unset', () => {
    vi.stubEnv('NEXT_PUBLIC_GA_MEASUREMENT_ID', '');
    expect(getGaMeasurementId()).toBeUndefined();
  });
});

describe('trackEvent', () => {
  it('is a no-op when window.gtag is not present', () => {
    expect(() => trackEvent('match_view', { matchId: 'm1' })).not.toThrow();
  });

  it('forwards to window.gtag when present', () => {
    const gtag = vi.fn();
    (window as { gtag?: typeof gtag }).gtag = gtag;

    trackEvent('match_view', { matchId: 'm1', sportType: 'futsal' });

    expect(gtag).toHaveBeenCalledWith('event', 'match_view', { matchId: 'm1', sportType: 'futsal' });
  });
});

describe('trackPageview', () => {
  it('is a no-op when window.gtag is not present', () => {
    expect(() => trackPageview('/home')).not.toThrow();
  });

  it('is a no-op when the measurement id is unset even if gtag exists', () => {
    vi.stubEnv('NEXT_PUBLIC_GA_MEASUREMENT_ID', '');
    const gtag = vi.fn();
    (window as { gtag?: typeof gtag }).gtag = gtag;

    trackPageview('/home');

    expect(gtag).not.toHaveBeenCalled();
  });

  it('calls gtag config with page_path when both are present', () => {
    vi.stubEnv('NEXT_PUBLIC_GA_MEASUREMENT_ID', 'G-TEST123');
    const gtag = vi.fn();
    (window as { gtag?: typeof gtag }).gtag = gtag;

    trackPageview('/home');

    expect(gtag).toHaveBeenCalledWith('config', 'G-TEST123', { page_path: '/home' });
  });
});
