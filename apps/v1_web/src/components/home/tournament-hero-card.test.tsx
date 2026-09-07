import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { V1TournamentListItem } from '@/types/api';
import { TournamentHeroCard } from './tournament-hero-card';

function promo(id: string, priority: number, enabled = true): V1TournamentListItem {
  return {
    id,
    title: id,
    status: 'open',
    scheduledAt: '2026-08-01T09:00:00.000Z',
    sport: { code: 'futsal', name: '풋살' },
    venue: '서울',
    promoHomeEnabled: enabled,
    promoHomePriority: priority,
    promoHomeTitle: `홈 ${id}`,
    promoHomeSubtitle: null,
    promoHomeImageUrl: null,
    promoHomeBadgeText: null,
    promoHomeDateText: null,
    promoHomeTeamsText: null,
    promoHomeLocationText: null,
    promoHomePrizeText: null,
  } as V1TournamentListItem;
}

describe('TournamentHeroCard', () => {
  it('renders all enabled home promos with priority 0 first', () => {
    render(
      <TournamentHeroCard
        items={[
          promo('third', 2),
          promo('first', 0),
          promo('hidden', 100, false),
          promo('second', 1),
        ]}
      />,
    );

    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual([
      expect.stringContaining('홈 first'),
      expect.stringContaining('홈 second'),
      expect.stringContaining('홈 third'),
    ]);
  });

  // 이미지가 없을 때만 자리채움 트로피 워터마크(120px)를 그린다 — 배경 CSS 는 jsdom 이
  // background 단축 속성을 파싱하지 못해 확인할 수 없으므로, 워터마크 유무로 실제 사진이
  // 히어로 배경에 들어갔는지 확인한다. (어떤 URL 이 뽑히는지는 resolveTournamentImage 유닛 테스트)
  const placeholderWatermark = (container: HTMLElement) =>
    container.querySelector('svg[width="120"]');

  it('홈 홍보 이미지를 따로 올리지 않으면 대회 커버 이미지를 히어로 배경으로 쓴다', () => {
    const { container } = render(
      <TournamentHeroCard
        items={[{ ...promo('cover-only', 0), coverImageUrl: '/uploads/cover.webp' }]}
      />,
    );

    expect(placeholderWatermark(container)).toBeNull();
  });

  it('커버도 홍보 이미지도 없으면 자리채움 워터마크를 그대로 보여준다', () => {
    const { container } = render(<TournamentHeroCard items={[promo('no-image', 0)]} />);

    expect(placeholderWatermark(container)).not.toBeNull();
  });

  it('links a promoted tournament to its published campaign when a campaign slug exists', () => {
    render(
      <TournamentHeroCard
        items={[
          { ...promo('campaign-tournament', 0), campaignSlug: 'summer-futsal-cup' },
          promo('detail-tournament', 1),
        ]}
      />,
    );

    expect(screen.getByRole('link', { name: /홈 campaign-tournament/ })).toHaveAttribute(
      'href',
      '/tournaments/campaigns/summer-futsal-cup',
    );
    expect(screen.getByRole('link', { name: /홈 detail-tournament/ })).toHaveAttribute(
      'href',
      '/tournaments/detail-tournament',
    );
  });
});

/**
 * 카드 CTA 위계 (2026-09-07). 홈에는 추천 대회 카드가 여러 장 깔릴 수 있어, 카드마다
 * solid 파란 버튼을 두면 한 화면의 primary 가 겹겹이 쌓인다(alpha 실측: 홈 5개).
 * 카드 CTA 는 secondary(outline) 로 두고 solid 는 화면 최상위 행동에만 남긴다.
 */
describe('TournamentHeroCard — CTA 위계', () => {
  it('카드 CTA 는 solid primary 가 아니라 outline 이다', () => {
    const { container } = render(<TournamentHeroCard items={[promo('a', 0), promo('b', 1)]} />);

    const ctas = [...container.querySelectorAll('.tm-featured-cta')];
    // 카드가 두 장이므로 CTA 도 두 개여야 한다 — 하나만 잡히면 아래 forEach 가 반만 검사한다.
    expect(ctas).toHaveLength(2);
    ctas.forEach((cta) => {
      expect(cta.classList.contains('tm-btn-outline')).toBe(true);
      expect(cta.classList.contains('tm-btn-primary')).toBe(false);
    });
  });
});
