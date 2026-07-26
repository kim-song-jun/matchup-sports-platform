declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

export function getGaMeasurementId(): string | undefined {
  return process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || undefined;
}

export function trackEvent(name: string, params?: Record<string, string | number | boolean>): void {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  window.gtag('event', name, params);
}

export function trackPageview(url: string): void {
  const measurementId = getGaMeasurementId();
  if (typeof window === 'undefined' || typeof window.gtag !== 'function' || !measurementId) return;
  window.gtag('config', measurementId, { page_path: url });
}
