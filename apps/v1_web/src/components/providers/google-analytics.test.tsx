import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const pathState = { pathname: '/tournaments/t1', search: 'utm_source=ig&utm_medium=paid' };

vi.mock('next/navigation', () => ({
  usePathname: () => pathState.pathname,
  useSearchParams: () => new URLSearchParams(pathState.search),
}));

// next/script's afterInteractive strategy inserts <script> outside React's render
// output, so jsdom + RTL can't observe it. Render a plain element carrying its props.
vi.mock('next/script', () => ({
  default: ({ src }: { src?: string }) => <script data-testid="next-script" data-src={src} />,
}));

vi.mock('next/web-vitals', () => ({ useReportWebVitals: () => {} }));

beforeEach(() => {
  delete window.gtag;
  delete window.dataLayer;
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

  it('loads gtag.js and records the landing page on first mount, with its UTM query', async () => {
    vi.stubEnv('NEXT_PUBLIC_GA_MEASUREMENT_ID', 'G-TEST123');
    const { GoogleAnalytics } = await import('./google-analytics');

    const { container } = render(<GoogleAnalytics />);

    const scripts = container.querySelectorAll('[data-testid="next-script"]');
    expect(scripts).toHaveLength(1);
    expect(scripts[0].getAttribute('data-src')).toBe('https://www.googletagmanager.com/gtag/js?id=G-TEST123');

    const pageViews = (window.dataLayer ?? [])
      .map((entry) => Array.from(entry as ArrayLike<unknown>))
      .filter((c) => c[1] === 'page_view');
    expect(pageViews).toHaveLength(1);
    expect(pageViews[0][2]).toMatchObject({
      page_location: 'http://localhost:3000/tournaments/t1?utm_source=ig&utm_medium=paid',
    });
  });
});
