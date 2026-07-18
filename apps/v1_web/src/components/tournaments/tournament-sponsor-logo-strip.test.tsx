import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { V1TournamentSponsor } from '@/types/api';
import { SponsorLogoStrip } from './tournament-sponsor-logo-strip';

function sponsor(overrides: Partial<V1TournamentSponsor>): V1TournamentSponsor {
  return {
    id: 'sponsor-1',
    name: '스폰서 1',
    description: null,
    logoUrl: 'https://images.example.com/logo1.png',
    websiteUrl: 'https://sponsor.example.com',
    instagramUrl: null,
    benefitText: null,
    boothText: null,
    eventTitle: null,
    eventDescription: null,
    eventResultText: null,
    sortOrder: 0,
    ...overrides,
  };
}

describe('SponsorLogoStrip', () => {
  it('renders nothing when there are no sponsors with a logo', () => {
    const { container } = render(
      <SponsorLogoStrip
        sponsors={[sponsor({ id: 'no-logo', logoUrl: null })]}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('orders logos by sortOrder and never renders a clickable link', () => {
    render(
      <SponsorLogoStrip
        sponsors={[
          sponsor({ id: 'b', name: '나중 스폰서', logoUrl: 'https://images.example.com/b.png', sortOrder: 2 }),
          sponsor({ id: 'a', name: '먼저 스폰서', logoUrl: 'https://images.example.com/a.png', sortOrder: 1 }),
        ]}
      />,
    );

    const images = screen.getAllByRole('img');
    expect(images.map((img) => img.getAttribute('alt'))).toEqual(['먼저 스폰서', '나중 스폰서']);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('filters out sponsors without a logo image', () => {
    render(
      <SponsorLogoStrip
        sponsors={[
          sponsor({ id: 'has-logo', name: '로고 있음' }),
          sponsor({ id: 'no-logo', name: '로고 없음', logoUrl: null }),
        ]}
      />,
    );

    expect(screen.getByRole('img', { name: '로고 있음' })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: '로고 없음' })).not.toBeInTheDocument();
  });
});
