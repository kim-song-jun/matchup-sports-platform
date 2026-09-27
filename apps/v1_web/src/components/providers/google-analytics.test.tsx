import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ usePathname: () => '/tournaments/t1' }));

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
});
