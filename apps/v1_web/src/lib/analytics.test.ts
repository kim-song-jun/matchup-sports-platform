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

describe('trackPageview', () => {
  it('does nothing when the measurement id is unset', async () => {
    const { trackPageview } = await loadAnalytics('');
    trackPageview('/home');
    expect(window.dataLayer).toBeUndefined();
  });

  it('queues the landing page_view before gtag.js has loaded, after js and config', async () => {
    const { trackPageview } = await loadAnalytics('G-TEST123');

    trackPageview('/tournaments/t1?utm_source=ig&utm_medium=paid');

    const commands = queuedCommands();
    expect(commands.map((c) => c[0])).toEqual(['js', 'config', 'event']);
    expect(commands[1]).toEqual(['config', 'G-TEST123', { send_page_view: false }]);
    expect(commands[2][1]).toBe('page_view');
    expect(commands[2][2]).toMatchObject({
      page_location: 'http://localhost:3000/tournaments/t1?utm_source=ig&utm_medium=paid',
    });
  });

  it('queues arguments objects, which is the only shape gtag.js replays', async () => {
    const { trackPageview } = await loadAnalytics('G-TEST123');
    trackPageview('/home');
    for (const entry of window.dataLayer ?? []) {
      expect(Object.prototype.toString.call(entry)).toBe('[object Arguments]');
    }
  });

  it('initializes once across navigations', async () => {
    const { trackPageview } = await loadAnalytics('G-TEST123');
    trackPageview('/home');
    trackPageview('/teams');
    expect(queuedCommands().filter((c) => c[0] === 'config')).toHaveLength(1);
    expect(queuedCommands().filter((c) => c[1] === 'page_view')).toHaveLength(2);
  });

  it('marks the page session internal from the first console route onward', async () => {
    const { trackPageview } = await loadAnalytics('G-TEST123');

    trackPageview('/home');
    trackPageview('/admin/users');
    trackPageview('/tournaments');

    const commands = queuedCommands();
    const setIndex = commands.findIndex((c) => c[0] === 'set');
    const pageViews = commands.flatMap((c, i) => (c[1] === 'page_view' ? [i] : []));
    expect(commands[setIndex]).toEqual(['set', { traffic_type: 'internal' }]);
    expect(pageViews[0]).toBeLessThan(setIndex);
    expect(pageViews[1]).toBeGreaterThan(setIndex);
    expect(commands.filter((c) => c[0] === 'set')).toHaveLength(1);
  });

  it('treats /tournament-ops as internal but not look-alike public paths', async () => {
    const { trackPageview } = await loadAnalytics('G-TEST123');
    trackPageview('/administration-guide');
    trackPageview('/tournaments/t1');
    expect(queuedCommands().some((c) => c[0] === 'set')).toBe(false);

    trackPageview('/tournament-ops/tournaments/t1/operations');
    expect(queuedCommands().some((c) => c[0] === 'set')).toBe(true);
  });
});

describe('trackEvent', () => {
  it('does nothing when the measurement id is unset', async () => {
    const { trackEvent } = await loadAnalytics('');
    trackEvent('match_view', { matchId: 'm1' });
    expect(window.dataLayer).toBeUndefined();
  });

  it('queues the event after init even if it fires before any page_view', async () => {
    const { trackEvent } = await loadAnalytics('G-TEST123');
    trackEvent('tournament_view', { tournamentId: 't1' });
    const commands = queuedCommands();
    expect(commands.map((c) => c[0])).toEqual(['js', 'config', 'event']);
    expect(commands[2]).toEqual(['event', 'tournament_view', { tournamentId: 't1' }]);
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
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
      'none',
    ],
  ])('classifies %s', (ua, expected) => {
    return loadAnalytics('G-TEST123').then(({ detectInAppBrowser }) => {
      expect(detectInAppBrowser(ua)).toBe(expected);
    });
  });
});
