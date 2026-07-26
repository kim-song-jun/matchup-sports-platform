import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/home',
  useSearchParams: () => new URLSearchParams(),
}));

// next/script's afterInteractive strategy inserts <script> outside React's render
// output (via its own DOM/head management), so jsdom + RTL can't observe it through
// container.querySelector. Mock it to a plain <script> so we can assert on the props
// GoogleAnalytics actually passes, without re-testing next/script's own runtime.
vi.mock('next/script', () => ({
  default: ({ src, id }: { src?: string; id?: string }) => (
    <script data-testid="next-script" data-script-id={id} data-src={src} />
  ),
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('GoogleAnalytics', () => {
  it('renders nothing when NEXT_PUBLIC_GA_MEASUREMENT_ID is unset', async () => {
    vi.stubEnv('NEXT_PUBLIC_GA_MEASUREMENT_ID', '');
    const { GoogleAnalytics } = await import('./google-analytics');

    const { container } = render(<GoogleAnalytics />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders the gtag script tags when the measurement id is set', async () => {
    vi.stubEnv('NEXT_PUBLIC_GA_MEASUREMENT_ID', 'G-TEST123');
    const { GoogleAnalytics } = await import('./google-analytics');

    const { container } = render(<GoogleAnalytics />);

    const scripts = container.querySelectorAll('[data-testid="next-script"]');
    expect(scripts).toHaveLength(2);
    expect(scripts[0].getAttribute('data-src')).toBe('https://www.googletagmanager.com/gtag/js?id=G-TEST123');
    expect(scripts[1].getAttribute('data-script-id')).toBe('ga-init');
  });
});
