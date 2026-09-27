import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const nav = vi.hoisted(() => ({ pathname: '/tournaments/t1' }));
vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname }));

// next/script's afterInteractive strategy inserts <script> outside React's render
// output, so jsdom + RTL can't observe it. Render a plain element carrying its props.
vi.mock('next/script', () => ({
  default: ({ src }: { src?: string }) => <script data-testid="next-script" data-src={src} />,
}));

const vitals = vi.hoisted(() => ({ callbacks: [] as unknown[] }));
vi.mock('next/web-vitals', () => ({ useReportWebVitals: (fn: unknown) => vitals.callbacks.push(fn) }));

beforeEach(() => {
  delete window.gtag;
  delete window.dataLayer;
  vitals.callbacks.length = 0;
  nav.pathname = '/tournaments/t1';
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('GoogleAnalytics', () => {
  it('renders nothing and queues nothing when NEXT_PUBLIC_GA_MEASUREMENT_ID is unset', async () => {
    vi.stubEnv('NEXT_PUBLIC_GA_MEASUREMENT_ID', '');
    const { GoogleAnalytics } = await import('./google-analytics');

    const { container } = render(<GoogleAnalytics />);

    expect(container).toBeEmptyDOMElement();
    expect(window.dataLayer).toBeUndefined();
  });

  it('loads gtag.js and configures it on mount without suppressing the landing page_view', async () => {
    vi.stubEnv('NEXT_PUBLIC_GA_MEASUREMENT_ID', 'G-TEST123');
    const { GoogleAnalytics } = await import('./google-analytics');

    const { container } = render(<GoogleAnalytics />);

    const scripts = container.querySelectorAll('[data-testid="next-script"]');
    expect(scripts).toHaveLength(1);
    expect(scripts[0].getAttribute('data-src')).toBe('https://www.googletagmanager.com/gtag/js?id=G-TEST123');

    const configs = (window.dataLayer ?? [])
      .map((entry) => Array.from(entry as ArrayLike<unknown>))
      .filter((c) => c[0] === 'config');
    expect(configs).toEqual([['config', 'G-TEST123']]);
  });

  it('hands useReportWebVitals the same callback on every render', async () => {
    // A new identity per render makes Next re-subscribe and replay FCP/TTFB as duplicates.
    vi.stubEnv('NEXT_PUBLIC_GA_MEASUREMENT_ID', 'G-TEST123');
    const { GoogleAnalytics } = await import('./google-analytics');

    const { rerender } = render(<GoogleAnalytics />);
    nav.pathname = '/teams';
    rerender(<GoogleAnalytics />);

    expect(vitals.callbacks.length).toBeGreaterThanOrEqual(2);
    expect(new Set(vitals.callbacks).size).toBe(1);
  });

  it('reports web vitals as integer values, scaling the unitless CLS score', async () => {
    vi.stubEnv('NEXT_PUBLIC_GA_MEASUREMENT_ID', 'G-TEST123');
    const { reportWebVitals } = await import('./google-analytics');

    reportWebVitals({ name: 'CLS', value: 0.0837, rating: 'needs-improvement', id: 'v1-cls', navigationType: 'navigate' } as never);
    reportWebVitals({ name: 'LCP', value: 2512.4, rating: 'needs-improvement', id: 'v1-lcp', navigationType: 'navigate' } as never);

    const events = (window.dataLayer ?? [])
      .map((entry) => Array.from(entry as ArrayLike<unknown>))
      .filter((c) => c[0] === 'event' && c[1] === 'web_vitals')
      .map((c) => c[2]);
    expect(events).toEqual([
      { metric_name: 'CLS', metric_value: 84, metric_rating: 'needs-improvement', metric_id: 'v1-cls', navigation_type: 'navigate' },
      { metric_name: 'LCP', metric_value: 2512, metric_rating: 'needs-improvement', metric_id: 'v1-lcp', navigation_type: 'navigate' },
    ]);
  });
});
