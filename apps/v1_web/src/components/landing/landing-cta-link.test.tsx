import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LandingCtaLink } from './landing-cta-link';

const analytics = vi.hoisted(() => ({
  trackEvent: vi.fn(),
}));

vi.mock('@/lib/analytics', () => ({
  trackEvent: analytics.trackEvent,
}));

describe('LandingCtaLink GA events', () => {
  it('tracks landing_cta_click with the given cta identifier without blocking navigation', () => {
    // Given
    render(
      <LandingCtaLink href="/login" cta="hero_signup">
        무료로 시작하기
      </LandingCtaLink>,
    );
    const link = screen.getByRole('link', { name: '무료로 시작하기' });

    // When
    fireEvent.click(link);

    // Then
    expect(analytics.trackEvent).toHaveBeenCalledWith('landing_cta_click', { cta: 'hero_signup' });
    expect(link).toHaveAttribute('href', '/login');
  });

  it('v2 랜딩은 같은 cta 에 variant 를 붙여 A안 클릭과 섞이지 않게 보낸다', () => {
    render(
      <LandingCtaLink href="/matches" cta="story_find_match" variant="v2">
        매치 둘러보기
      </LandingCtaLink>,
    );

    fireEvent.click(screen.getByRole('link', { name: '매치 둘러보기' }));

    expect(analytics.trackEvent).toHaveBeenLastCalledWith('landing_cta_click', {
      cta: 'story_find_match',
      variant: 'v2',
    });
  });
});
