import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { V1TournamentSponsor } from '@/types/api';
import { TournamentSponsorSection } from './tournament-sponsor-section';
import styles from './tournament-sponsor-section.module.css';

describe('TournamentSponsorSection', () => {
  it('does not render initials behind a transparent sponsor logo', () => {
    const { container } = render(
      <TournamentSponsorSection
        sponsors={[sponsor({ logoUrl: '/uploads/2026/08/transparent-logo.webp' })]}
      />,
    );

    const logo = container.querySelector(`.${styles.logo}`);
    expect(logo).not.toHaveTextContent('서울');
    expect(logo?.querySelector('img')).toHaveAttribute(
      'src',
      '/uploads/2026/08/transparent-logo.webp',
    );
  });

  it('renders initials when a sponsor has no logo', () => {
    const { container } = render(
      <TournamentSponsorSection sponsors={[sponsor({ logoUrl: null })]} />,
    );

    expect(container.querySelector(`.${styles.logo}`)).toHaveTextContent('서울');
  });
});

function sponsor(overrides: Partial<V1TournamentSponsor>): V1TournamentSponsor {
  return {
    id: 'sponsor-1',
    name: '서울 스포츠랩',
    description: null,
    logoUrl: null,
    websiteUrl: null,
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
