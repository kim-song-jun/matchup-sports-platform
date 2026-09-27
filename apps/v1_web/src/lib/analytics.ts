declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

export function getGaMeasurementId(): string | undefined {
  return process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || undefined;
}

// Console routes used only by operators. Once a page session touches one, every later
// hit carries traffic_type=internal so the GA "Internal Traffic" data filter drops it.
const INTERNAL_PATH = /^\/(admin|tournament-ops)(\/|$)/;

let initializedId: string | undefined;
let internalMarked = false;

const IN_APP_BROWSERS: ReadonlyArray<[RegExp, string]> = [
  [/Instagram/i, 'instagram'],
  [/FBAN|FBAV|FB_IAB/i, 'facebook'],
  [/KAKAOTALK/i, 'kakaotalk'],
  [/NAVER\(inapp/i, 'naver'],
  [/\bLine\//i, 'line'],
  [/BAND\//i, 'band'],
  [/DaumApps/i, 'daum'],
];

export function detectInAppBrowser(userAgent: string): string {
  for (const [pattern, name] of IN_APP_BROWSERS) {
    if (pattern.test(userAgent)) return name;
  }
  return 'none';
}

function markInternalIfConsole(path: string): void {
  if (internalMarked || !INTERNAL_PATH.test(path)) return;
  internalMarked = true;
  window.gtag!('set', { traffic_type: 'internal' });
}

/**
 * Page views come from GA enhanced measurement: the landing page from `config`, later
 * routes from its browser-history listener. Do not pass `send_page_view: false` or send
 * page_view manually — the former drops every landing page, the latter double counts.
 * `set` must be queued before `config` so the landing hit already carries it, and the
 * stub must push the `arguments` object itself — gtag.js ignores plain arrays.
 */
function ensureGtag(measurementId: string): void {
  if (typeof window === 'undefined' || initializedId === measurementId) return;
  window.dataLayer = window.dataLayer || [];
  if (typeof window.gtag !== 'function') {
    window.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer!.push(arguments);
    };
  }
  window.gtag('js', new Date());
  window.gtag('set', { in_app_browser: detectInAppBrowser(window.navigator.userAgent) });
  markInternalIfConsole(window.location.pathname);
  window.gtag('config', measurementId);
  initializedId = measurementId;
}

export function trackEvent(name: string, params?: Record<string, string | number | boolean>): void {
  const measurementId = getGaMeasurementId();
  if (typeof window === 'undefined' || !measurementId) return;
  ensureGtag(measurementId);
  window.gtag!('event', name, params);
}

/** Called on every route change; page views themselves are sent by gtag.js. */
export function trackRoute(path: string): void {
  const measurementId = getGaMeasurementId();
  if (typeof window === 'undefined' || !measurementId) return;
  ensureGtag(measurementId);
  markInternalIfConsole(path);
}
