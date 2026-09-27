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
const INTERNAL_PATH = /^\/(admin|tournament-ops)(\/|\?|$)/;

let initializedId: string | undefined;
let internalMarked = false;

/**
 * Page views are explicit `page_view` events. A second `config` for the same id, queued
 * before gtag.js loads, never produced a hit, so every landing page went unrecorded.
 * gtag.js replays dataLayer in order, so `js`/`config` must be queued before any event,
 * and the stub must push the `arguments` object itself — gtag.js ignores plain arrays.
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
  window.gtag('config', measurementId, { send_page_view: false });
  initializedId = measurementId;
}

function markInternalIfConsole(path: string): void {
  if (internalMarked || !INTERNAL_PATH.test(path)) return;
  internalMarked = true;
  window.gtag!('set', { traffic_type: 'internal' });
}

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

export function trackEvent(name: string, params?: Record<string, string | number | boolean>): void {
  const measurementId = getGaMeasurementId();
  if (typeof window === 'undefined' || !measurementId) return;
  ensureGtag(measurementId);
  window.gtag!('event', name, params);
}

/** `url` is the in-app path including its query, so UTM parameters reach GA on the landing hit. */
export function trackPageview(url: string): void {
  const measurementId = getGaMeasurementId();
  if (typeof window === 'undefined' || !measurementId) return;
  ensureGtag(measurementId);
  markInternalIfConsole(url);
  window.gtag!('event', 'page_view', {
    page_location: `${window.location.origin}${url}`,
    in_app_browser: detectInAppBrowser(window.navigator.userAgent),
  });
}
