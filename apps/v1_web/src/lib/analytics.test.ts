import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type AnalyticsModule = typeof import('./analytics');

async function loadAnalytics(measurementId: string): Promise<AnalyticsModule> {
  vi.stubEnv('NEXT_PUBLIC_GA_MEASUREMENT_ID', measurementId);
  vi.resetModules();
  return import('./analytics');
}

// What gtag.js will replay once it loads: each queued command as a plain array.
function queuedCommands(): unknown[][] {
  return (window.dataLayer ?? []).map((entry) => Array.from(entry as ArrayLike<unknown>));
}

const indexOfCommand = (name: string) => queuedCommands().findIndex((c) => c[0] === name);

beforeEach(() => {
  delete window.gtag;
  delete window.dataLayer;
});

afterEach(() => {
  vi.unstubAllEnvs();
  window.history.replaceState(null, '', '/');
});

describe('getGaMeasurementId', () => {
  it('reads NEXT_PUBLIC_GA_MEASUREMENT_ID', async () => {
    const { getGaMeasurementId } = await loadAnalytics('G-TEST123');
    expect(getGaMeasurementId()).toBe('G-TEST123');
  });

  it('returns undefined when unset', async () => {
    const { getGaMeasurementId } = await loadAnalytics('');
    expect(getGaMeasurementId()).toBeUndefined();
  });
});

describe('trackRoute', () => {
  it('does nothing when the measurement id is unset', async () => {
    const { trackRoute } = await loadAnalytics('');
    trackRoute('/home');
    expect(window.dataLayer).toBeUndefined();
  });

  it('lets gtag.js send the landing page_view itself', async () => {
    const { trackRoute } = await loadAnalytics('G-TEST123');

    trackRoute('/tournaments/t1');

    const config = queuedCommands().find((c) => c[0] === 'config');
    // A config with send_page_view:false is what dropped every landing page.
    expect(config).toEqual(['config', 'G-TEST123']);
    expect(queuedCommands().some((c) => c[0] === 'event' && c[1] === 'page_view')).toBe(false);
  });

  it('queues arguments objects, which is the only shape gtag.js replays', async () => {
    const { trackRoute } = await loadAnalytics('G-TEST123');
    trackRoute('/home');
    expect(window.dataLayer?.length).toBeGreaterThan(0);
    for (const entry of window.dataLayer ?? []) {
      expect(Object.prototype.toString.call(entry)).toBe('[object Arguments]');
    }
  });

  it('configures once across navigations', async () => {
    const { trackRoute } = await loadAnalytics('G-TEST123');
    trackRoute('/home');
    trackRoute('/teams');
    expect(queuedCommands().filter((c) => c[0] === 'config')).toHaveLength(1);
  });

  it('sets the in-app browser before config so the landing hit carries it', async () => {
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 389.0.0.49.87',
    );
    const { trackRoute } = await loadAnalytics('G-TEST123');

    trackRoute('/tournaments/t1');

    const setIndex = queuedCommands().findIndex((c) => c[0] === 'set' && 'in_app_browser' in (c[1] as object));
    expect(queuedCommands()[setIndex]).toEqual(['set', { in_app_browser: 'instagram' }]);
    expect(setIndex).toBeLessThan(indexOfCommand('config'));
    vi.restoreAllMocks();
  });

  it('tags a session that lands on a console route as internal from its first hit', async () => {
    window.history.replaceState(null, '', '/admin/users');
    const { trackRoute } = await loadAnalytics('G-TEST123');

    trackRoute('/admin/users');

    const internal = queuedCommands().findIndex((c) => c[0] === 'set' && 'traffic_type' in (c[1] as object));
    expect(queuedCommands()[internal]).toEqual(['set', { traffic_type: 'internal' }]);
    expect(internal).toBeLessThan(indexOfCommand('config'));
    expect(queuedCommands().filter((c) => c[0] === 'set' && 'traffic_type' in (c[1] as object))).toHaveLength(1);
  });

  it('tags the rest of the page session once it navigates into a console route', async () => {
    window.history.replaceState(null, '', '/home');
    const { trackRoute } = await loadAnalytics('G-TEST123');

    trackRoute('/home');
    const hasInternal = () => queuedCommands().some((c) => c[0] === 'set' && 'traffic_type' in (c[1] as object));
    expect(hasInternal()).toBe(false);

    trackRoute('/tournament-ops/tournaments/t1/operations');
    expect(hasInternal()).toBe(true);
  });

  it('does not treat look-alike public paths as console routes', async () => {
    const { trackRoute } = await loadAnalytics('G-TEST123');
    trackRoute('/administration-guide');
    trackRoute('/tournaments/t1');
    expect(queuedCommands().some((c) => c[0] === 'set' && 'traffic_type' in (c[1] as object))).toBe(false);
  });
});

describe('trackEvent', () => {
  it('does nothing when the measurement id is unset', async () => {
    const { trackEvent } = await loadAnalytics('');
    trackEvent('match_view', { matchId: 'm1' });
    expect(window.dataLayer).toBeUndefined();
  });

  it('queues the event after config even if it fires before any route effect', async () => {
    const { trackEvent } = await loadAnalytics('G-TEST123');
    trackEvent('tournament_view', { tournamentId: 't1' });
    const eventIndex = queuedCommands().findIndex((c) => c[0] === 'event');
    expect(queuedCommands()[eventIndex]).toEqual(['event', 'tournament_view', { tournamentId: 't1' }]);
    expect(indexOfCommand('config')).toBeLessThan(eventIndex);
  });

  it('forwards to an already loaded gtag', async () => {
    const gtag = vi.fn();
    window.gtag = gtag;
    const { trackEvent } = await loadAnalytics('G-TEST123');
    trackEvent('match_view', { matchId: 'm1' });
    expect(gtag).toHaveBeenLastCalledWith('event', 'match_view', { matchId: 'm1' });
  });
});

describe('detectInAppBrowser', () => {
  it.each([
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 389.0.0.49.87 (iPhone15,2; iOS 18_5; ko_KR; ko)',
      'instagram',
    ],
    [
      'Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.100 Mobile Safari/537.36 Instagram 352.0.0.38.100 Android',
      'instagram',
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/480.0.0.39.107]',
      'facebook',
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.8.5',
      'kakaotalk',
    ],
    [
      'Mozilla/5.0 (Linux; Android 13; SM-G991N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36 NAVER(inapp; search; 2000; 12.5.2)',
      'naver',
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.9.0',
      'line',
    ],
    [
      'Mozilla/5.0 (Linux; Android 14; SM-S911N; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/128.0 Mobile Safari/537.36 BAND/15.1.4',
      'band',
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 DaumApps/4.20.0 DaumDevice/mobile',
      'daum',
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
      'none',
    ],
  ])('classifies %s', async (ua, expected) => {
    const { detectInAppBrowser } = await loadAnalytics('G-TEST123');
    expect(detectInAppBrowser(ua)).toBe(expected);
  });
});
