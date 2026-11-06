import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { V1TournamentSponsor } from '@/types/api';
import { resolveNextImageSrc } from '@/test/next-image';
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
    // next/image 전환(U15) 이후 실제 DOM src는 `/_next/image?url=...`로 재작성된다.
    expect(resolveNextImageSrc(logo?.querySelector('img'))).toBe(
      '/uploads/2026/08/transparent-logo.webp',
    );
  });

  it('requests an uploaded logo at twice its 44px frame, not the 176px intrinsic size', () => {
    const { container } = render(
      <TournamentSponsorSection sponsors={[sponsor({ logoUrl: '/uploads/2026/08/logo.webp' })]} />,
    );

    const src = new URL(container.querySelector(`.${styles.logo} img`)?.getAttribute('src') ?? '', 'http://localhost');
    expect(src.pathname).toBe('/_next/image');
    expect(src.searchParams.get('w')).toBe('96');
  });

  it('leaves an external logo URL to the browser instead of the optimizer', () => {
    const { container } = render(
      <TournamentSponsorSection sponsors={[sponsor({ logoUrl: 'https://images.example.com/logo.png' })]} />,
    );

    expect(container.querySelector(`.${styles.logo} img`)).toHaveAttribute('src', 'https://images.example.com/logo.png');
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
