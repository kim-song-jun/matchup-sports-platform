import { act, cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { V1TournamentListItem } from '@/types/api';
import { TournamentHeroCard } from './tournament-hero-card';

function promo(id: string, priority: number, enabled = true): V1TournamentListItem {
  return {
    id,
    sportId: 'sport-futsal',
    title: id,
    status: 'open',
    kind: 'regular_tournament',
    entryFeeConfigured: true,
    format: 'knockout',
    registrationDeadlineAt: null,
    // 홈 추천은 시작 전 대회만 싣는다 — 실제 시계로 도는 테스트도 깨지지 않게 먼 미래.
    scheduledAt: '2099-10-07T09:00:00.000Z',
    scheduledEndAt: null,
    sport: { code: 'futsal', name: '풋살' },
    venue: '서울',
    coverImageUrl: null,
    teamCount: 4,
    confirmedCount: 0,
    pendingPaymentCount: 0,
    genderCategory: 'mixed',
    entryFee: 0,
    prizePool: null,
    prizeSummary: null,
    prizeBreakdown: null,
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
    promoListEnabled: false,
    promoListPriority: 0,
    promoListTitle: null,
    promoListSubtitle: null,
    promoListImageUrl: null,
    promoListBadgeText: null,
    promoListDateText: null,
    promoListTeamsText: null,
    promoListLocationText: null,
    promoListPrizeText: null,
    campaignSlug: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  };
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
    // 뒤로가기가 홈으로 돌아오도록 `?from=`을 함께 실어 보낸다(MD-QA #15 후속).
    expect(screen.getByRole('link', { name: /홈 detail-tournament/ })).toHaveAttribute(
      'href',
      '/tournaments/detail-tournament?from=%2Fhome',
    );
  });
});

describe('TournamentHeroCard — 현재 신청 게이트', () => {
  const deadline = '2026-10-06T15:00:00.000+09:00';
  const expired = '2026-10-06T14:59:59.999+09:00';
  const future = '2026-10-06T15:01:00.000+09:00';
  const campaignSlug = 'futsal-cup';

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(deadline));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it.each<[string, Partial<V1TournamentListItem>, boolean]>([
    ['마감된 0/4팀 캠페인', { campaignSlug, registrationDeadlineAt: expired }, false],
    ['마감된 일반 대회', { registrationDeadlineAt: expired }, false],
    ['미래 마감 캠페인', { campaignSlug, registrationDeadlineAt: future }, true],
    ['미래 마감 일반 대회', { registrationDeadlineAt: future }, true],
    ['마감일 없는 캠페인', { campaignSlug }, true],
    ['마감일 없는 일반 대회', {}, true],
    ['확정팀으로 정원이 찬 대회', { confirmedCount: 4 }, false],
    ['입금대기팀까지 정원이 찬 캠페인', { campaignSlug, confirmedCount: 2, pendingPaymentCount: 2 }, false],
    ['마감 순간의 캠페인', { campaignSlug, registrationDeadlineAt: deadline }, false],
    ['마감 순간의 일반 대회', { registrationDeadlineAt: deadline }, true],
    ['시작한 캠페인', { campaignSlug, scheduledAt: expired, registrationDeadlineAt: future }, false],
    ['시작 순간의 캠페인', { campaignSlug, scheduledAt: deadline, registrationDeadlineAt: future }, false],
    ['시작일 지난 일반 대회', { scheduledAt: expired, registrationDeadlineAt: future }, false],
    ['시작 순간의 일반 대회', { scheduledAt: deadline }, false],
    ['잘못된 마감일의 캠페인', { campaignSlug, registrationDeadlineAt: 'invalid-date' }, false],
    ['잘못된 마감일의 일반 대회', { registrationDeadlineAt: 'invalid-date' }, true],
  ])('%s — 지금 신청할 수 있을 때만 카드를 싣는다', (_condition, overrides, shown) => {
    // Given: API 목록의 실제 마감·정원·시작 필드가 있는 홈 홍보 대회.
    const item = { ...promo('registration', 0), ...overrides };
    // When: 홈 카드를 렌더해요.
    render(<TournamentHeroCard items={[item]} />);
    // Then: 신청할 수 있으면 신청 CTA 카드, 닫혔으면 "모집 마감" 카드로 남기지 않고 아예 뺀다.
    if (shown) {
      const link = screen.getByRole('link', { name: '대회 상세 — 홈 registration — 참가 신청하기' });
      expect(link).toHaveAttribute('href', item.campaignSlug
        ? `/tournaments/campaigns/${item.campaignSlug}`
        : '/tournaments/registration?from=%2Fhome');
    } else {
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
    }
  });

  it.each<[string | null, boolean]>([
    [future, true],
    [expired, false],
    [null, false],
  ])('정원 필드 없는 정규 리그는 마감일 %s의 리그 게이트를 따라요', (registrationDeadlineAt, shown) => {
    // Given: 서버는 정규 리그의 정원 필드를 생략해요.
    const item = { ...promo('league', 0), kind: 'regular_league', registrationDeadlineAt } satisfies V1TournamentListItem;
    delete item.teamCount;
    // When: 홈 카드를 렌더해요.
    render(<TournamentHeroCard items={[item]} />);
    // Then: 정원이 없다는 이유로 빼지 않고, 마감일 없는 리그는 신청 가능으로 싣지 않아요.
    expect(screen.queryByText('참가 신청하기') !== null).toBe(shown);
  });

  it.each([null, campaignSlug])('카드를 열어 둔 채 마감이 지나면 %s 카드를 내려요', (slug) => {
    // Given: 현재부터 30초 뒤 마감되는 카드가 이미 렌더되어 있어요.
    const item = { ...promo('time-passage', 0), campaignSlug: slug, registrationDeadlineAt: '2026-10-06T15:00:30.000+09:00' };
    render(<TournamentHeroCard items={[item]} />);
    expect(screen.getByText('참가 신청하기')).toBeInTheDocument();
    // When: 새 목록 응답이나 부모 rerender 없이 시간이 마감을 지나요.
    act(() => { vi.advanceTimersByTime(60_000); });
    // Then: 신청할 수 없게 된 카드는 추천 칸에서 빠져요.
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('마감일 없는 대회도 화면 체류 중 시작하면 카드를 내려요', () => {
    // Given: 마감일은 없지만 30초 뒤 시작하는 대회가 보여요.
    render(<TournamentHeroCard items={[{
      ...promo('start-passage', 0), scheduledAt: '2026-10-06T15:00:30.000+09:00',
    }]} />);
    expect(screen.getByText('참가 신청하기')).toBeInTheDocument();
    // When: API 재조회 없이 대회 시작 시각을 지나요.
    act(() => { vi.advanceTimersByTime(60_000); });
    // Then: 시작한 대회를 계속 추천하지 않아요.
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
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
