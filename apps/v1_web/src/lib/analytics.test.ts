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
const isInternalSet = (c: unknown[]) =>
  c[0] === 'set' && typeof c[1] === 'object' && c[1] !== null && 'traffic_type' in c[1];

// ensureGtag wraps fetch/sendBeacon once per page session; every test loads a fresh module.
const nativeFetch = window.fetch;
const nativeBeacon = window.navigator.sendBeacon;

beforeEach(() => {
  delete window.gtag;
  delete window.dataLayer;
});

afterEach(() => {
  vi.unstubAllEnvs();
  window.fetch = nativeFetch;
  window.navigator.sendBeacon = nativeBeacon;
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

  it('sets the in-app browser as a user property before config so the landing hit carries it', async () => {
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 389.0.0.49.87',
    );
    const { trackRoute } = await loadAnalytics('G-TEST123');

    trackRoute('/tournaments/t1');

    const setIndex = queuedCommands().findIndex((c) => c[0] === 'set' && c[1] === 'user_properties');
    expect(queuedCommands()[setIndex]).toEqual(['set', 'user_properties', { in_app_browser: 'instagram' }]);
    expect(setIndex).toBeLessThan(indexOfCommand('config'));
    vi.restoreAllMocks();
  });

  it('tags a session that lands on a console route as internal from its first hit', async () => {
    window.history.replaceState(null, '', '/admin/users');
    const { trackRoute } = await loadAnalytics('G-TEST123');

    trackRoute('/admin/users');

    const internal = queuedCommands().findIndex(isInternalSet);
    expect(queuedCommands()[internal]).toEqual(['set', { traffic_type: 'internal' }]);
    expect(internal).toBeLessThan(indexOfCommand('config'));
    expect(queuedCommands().filter(isInternalSet)).toHaveLength(1);
  });

  it('tags the rest of the page session once it navigates into a console route', async () => {
    window.history.replaceState(null, '', '/home');
    const { trackRoute } = await loadAnalytics('G-TEST123');

    trackRoute('/home');
    const hasInternal = () => queuedCommands().some(isInternalSet);
    expect(hasInternal()).toBe(false);

    trackRoute('/tournament-ops/tournaments/t1/operations');
    expect(hasInternal()).toBe(true);
  });

  it('tags the session when a console link is clicked, before the history page_view fires', async () => {
    window.history.replaceState(null, '', '/home');
    const { trackRoute } = await loadAnalytics('G-TEST123');
    trackRoute('/home');
    const link = document.createElement('a');
    link.href = '/admin/users';
    link.addEventListener('click', (event) => event.preventDefault());
    document.body.append(link);

    link.click();

    expect(queuedCommands()).toContainEqual(['set', { traffic_type: 'internal' }]);
    link.remove();
  });

  it('ignores clicks on public and off-site links', async () => {
    window.history.replaceState(null, '', '/home');
    const { trackRoute } = await loadAnalytics('G-TEST123');
    trackRoute('/home');
    const links = ['/tournaments/t1', 'https://example.com/admin', 'http://%'].map((href) => {
      const a = document.createElement('a');
      a.href = href;
      a.addEventListener('click', (event) => event.preventDefault());
      document.body.append(a);
      return a;
    });

    links.forEach((a) => a.click());

    expect(queuedCommands().some(isInternalSet)).toBe(false);
    links.forEach((a) => a.remove());
  });

  it('does not treat look-alike public paths as console routes', async () => {
    const { trackRoute } = await loadAnalytics('G-TEST123');
    trackRoute('/administration-guide');
    trackRoute('/tournaments/t1');
    expect(queuedCommands().some(isInternalSet)).toBe(false);
  });
});

describe('redactInviteTokens', () => {
  it('replaces the token in plain, percent-encoded and double-encoded paths', async () => {
    const { redactInviteTokens } = await loadAnalytics('G-TEST123');
    expect(redactInviteTokens('https://teameet.co.kr/invite/9f3a-secret?x=1')).toBe('https://teameet.co.kr/invite/:token?x=1');
    expect(redactInviteTokens('dl=https%3A%2F%2Fteameet.co.kr%2Finvite%2F9f3a-secret&dt=x')).toBe(
      'dl=https%3A%2F%2Fteameet.co.kr%2Finvite%2F:token&dt=x',
    );
    expect(redactInviteTokens('dl=https%3A%2F%2Fteameet.co.kr%2Flogin%3Fredirect%3D%252Finvite%252F9f3a-secret')).toBe(
      'dl=https%3A%2F%2Fteameet.co.kr%2Flogin%3Fredirect%3D%252Finvite%252F:token',
    );
  });

  it('leaves addresses without an invite token byte for byte', async () => {
    const { redactInviteTokens } = await loadAnalytics('G-TEST123');
    for (const text of ['https://teameet.co.kr/teams/t1/invite', 'https://teameet.co.kr/invite', 'dl=https%3A%2F%2Fteameet.co.kr%2Fteams%3Fq%3D%ED%8C%80']) {
      expect(redactInviteTokens(text)).toBe(text);
    }
  });
});

describe('outgoing GA hits', () => {
  const COLLECT = 'https://www.google-analytics.com/g/collect?v=2&tid=G-TEST123';

  async function installWithFakes() {
    const fetchSpy = vi.fn(async () => new Response(null, { status: 204 }));
    const beaconSpy = vi.fn(() => true);
    window.fetch = fetchSpy as typeof window.fetch;
    window.navigator.sendBeacon = beaconSpy;
    const { trackRoute } = await loadAnalytics('G-TEST123');
    trackRoute('/home');
    return { fetchSpy, beaconSpy };
  }

  it('rewrites the address and referrer of a fetch hit, in the URL and in the batched body', async () => {
    const { fetchSpy } = await installWithFakes();
    await window.fetch(`${COLLECT}&dl=https%3A%2F%2Fteameet.co.kr%2Finvite%2F9f3a-secret`, {
      method: 'POST',
      body: 'en=page_view&dr=https%3A%2F%2Fteameet.co.kr%2Flogin%3Fredirect%3D%252Finvite%252F9f3a-secret',
    });
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('%2Finvite%2F:token');
    expect(String(init.body)).toContain('%252Finvite%252F:token');
    expect(url + String(init.body)).not.toContain('9f3a-secret');
    expect(init.method).toBe('POST');
  });

  it('rewrites a hit whose URL is given as a URL object', async () => {
    const { fetchSpy } = await installWithFakes();
    await window.fetch(new URL(`${COLLECT}&dl=https%3A%2F%2Fteameet.co.kr%2Finvite%2F9f3a-secret`));
    const [url] = fetchSpy.mock.calls[0] as unknown as [string | URL];
    expect(String(url)).toContain('%2Finvite%2F:token');
    expect(String(url)).not.toContain('9f3a-secret');
  });

  it('rewrites a sendBeacon hit', async () => {
    const { beaconSpy } = await installWithFakes();
    window.navigator.sendBeacon(`${COLLECT}&dl=https%3A%2F%2Fteameet.co.kr%2Finvite%2F9f3a-secret`, 'en=user_engagement');
    const [url, data] = beaconSpy.mock.calls[0] as unknown as [string, string];
    expect(url).not.toContain('9f3a-secret');
    expect(data).toBe('en=user_engagement');
  });

  it('does not touch requests that are not GA collect hits', async () => {
    const { fetchSpy, beaconSpy } = await installWithFakes();
    const apiUrl = '/api/v1/teams/invite/9f3a-secret/accept';
    await window.fetch(apiUrl, { method: 'POST', body: '{"x":"/invite/9f3a-secret"}' });
    window.navigator.sendBeacon('/api/v1/logs/client-error', '/invite/9f3a-secret');
    expect(fetchSpy).toHaveBeenCalledWith(apiUrl, { method: 'POST', body: '{"x":"/invite/9f3a-secret"}' });
    expect(beaconSpy).toHaveBeenCalledWith('/api/v1/logs/client-error', '/invite/9f3a-secret');
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
