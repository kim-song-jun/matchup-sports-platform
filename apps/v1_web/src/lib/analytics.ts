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

// A team invite link is the credential itself (`/invite/<token>`), and the login/signup
// screens carry it onward in `?redirect=`. gtag.js reports the address bar (`dl`) and the
// previous one (`dr`) with every hit, and its history-change page_views ignore any override
// set through `set`/`config` — so the hits are rewritten on their way out instead. The three
// separators cover the plain, percent-encoded and double-encoded forms of the path.
const INVITE_TOKEN = /(\/|%2F|%252F)invite(\/|%2F|%252F)[^/?#&%\s]+/gi;
const GA_COLLECT_URL = /^https:\/\/(?:[\w-]+\.)*(?:google-analytics\.com|analytics\.google\.com)\/(?:[a-z]\/)?collect(?:[/?]|$)/;

export function redactInviteTokens(text: string): string {
  return text.replace(INVITE_TOKEN, '$1invite$2:token');
}

function redactCollectBody<T extends BodyInit | null | undefined>(body: T): T | string {
  return typeof body === 'string' ? redactInviteTokens(body) : body;
}

// gtag.js sends hits with fetch (keepalive) and falls back to sendBeacon, always with string
// bodies. Anything that is not a GA collect request passes through untouched.
function redactOutgoingHits(): void {
  const nativeFetch = window.fetch;
  window.fetch = function patchedFetch(input, init) {
    const url = input instanceof URL ? input.href : input;
    if (typeof url === 'string' && GA_COLLECT_URL.test(url)) {
      return nativeFetch.call(this, redactInviteTokens(url), init && { ...init, body: redactCollectBody(init.body) });
    }
    return nativeFetch.call(this, input, init);
  };
  const nativeBeacon = window.navigator.sendBeacon;
  if (typeof nativeBeacon === 'function') {
    window.navigator.sendBeacon = function patchedBeacon(url, data) {
      return GA_COLLECT_URL.test(String(url))
        ? nativeBeacon.call(this, redactInviteTokens(String(url)), redactCollectBody(data))
        : nativeBeacon.call(this, url, data);
    };
  }
}

function markInternalIfConsole(path: string): void {
  if (internalMarked || !INTERNAL_PATH.test(path)) return;
  internalMarked = true;
  window.gtag!('set', { traffic_type: 'internal' });
}

// The history listener sends a page_view as soon as a link pushes a console route, before
// any route effect runs. A capture-phase click runs earlier still, so tag it there.
function markInternalOnConsoleLinkClick(event: MouseEvent): void {
  // The anchor's own origin/pathname are already resolved by the browser and never throw.
  const anchor = (event.target as Element | null)?.closest?.('a[href]');
  if (anchor instanceof HTMLAnchorElement && anchor.origin === window.location.origin) {
    markInternalIfConsole(anchor.pathname);
  }
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
  // A user property, not a plain `set` key: gtag.js drops custom keys given to `set`.
  window.gtag('set', 'user_properties', { in_app_browser: detectInAppBrowser(window.navigator.userAgent) });
  redactOutgoingHits();
  markInternalIfConsole(window.location.pathname);
  window.gtag('config', measurementId);
  document.addEventListener('click', markInternalOnConsoleLinkClick, { capture: true });
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
