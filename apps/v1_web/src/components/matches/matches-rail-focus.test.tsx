import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { MatchListPageView } from './matches-page';
import { getMatchListViewModel } from './matches.view-model';

const navigation = vi.hoisted(() => ({ push: vi.fn(), search: 'sort=latest&sportId=futsal' }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/matches', useSearchParams: () => new URLSearchParams(navigation.search),
  useRouter: () => ({ push: navigation.push, replace: vi.fn() }),
}));
vi.mock('next/link', () => ({ default: ({ href, onClick, prefetch: _prefetch, ...props }: ComponentProps<'a'> & { href: string; prefetch?: boolean }) => (
  <a {...props} href={href} onClick={(event) => { onClick?.(event); if (!event.defaultPrevented) { event.preventDefault(); navigation.push(href); } }} />
) }));

// 실제 view/카드를 실행한다. jsdom에 없는 layout·native scroll clamp·focus-visible
// modality만 통제한다. 이 계약 테스트를 실제 CSS snap/alpha viewport 증거로 해석하지 않는다.
function setup(kind: 'feature' | 'nearby' = 'feature', width = 372.8, cardWidth = 276) {
  const base = getMatchListViewModel();
  const items = [0, 1, 2].map((index) => ({ ...base.matches[0], id: `focus-${index}`, title: `합성 추천 ${index}`, image: '/mock/generated/team-huddle.webp' }));
  render(<MatchListPageView model={{
    ...base, matches: kind === 'feature' ? items : [{ ...items[0], id: 'main', image: null }],
    nearbyMatches: kind === 'nearby' ? items : [],
    sports: [{ label: '수영', count: 0, active: false, href: '/matches?sportId=swimming' }],
  }} />);
  const rail = document.querySelector<HTMLDivElement>(kind === 'feature' ? '.tm-match-rail-section .tm-match-rail-h' : '.tm-match-nearby-section .tm-match-rail-h')!;
  const cards = Array.from(rail.querySelectorAll<HTMLAnchorElement>('a.tm-match-list-card'));
  let keyboard = true;
  const contentWidth = cardWidth * 3 + 12 * 2 + 8;
  const rect = (left: number, rectWidth: number) => ({ x: left, y: 100, left, top: 100, right: left + rectWidth, bottom: 380, width: rectWidth, height: 280, toJSON: () => ({}) });
  vi.spyOn(rail, 'getBoundingClientRect').mockImplementation(() => rect(16, width));
  Object.defineProperties(rail, { clientWidth: { configurable: true, value: Math.round(width) }, scrollWidth: { configurable: true, value: contentWidth } });
  rail.scrollTop = 30;
  const scroll = vi.fn(({ left }: ScrollToOptions) => { rail.scrollLeft = Math.max(0, Math.min(contentWidth - width, left ?? 0)); });
  Object.defineProperty(rail, 'scrollTo', { configurable: true, value: scroll });
  cards.forEach((card, index) => {
    vi.spyOn(card, 'getBoundingClientRect').mockImplementation(() => rect(20 + index * (cardWidth + 12) - rail.scrollLeft, cardWidth));
    const matches = card.matches.bind(card);
    vi.spyOn(card, 'matches').mockImplementation((selector) => selector === ':focus-visible' ? keyboard && document.activeElement === card : matches(selector));
  });
  const user = userEvent.setup();
  async function tabToFirst() {
    for (let i = 0; i < 25 && document.activeElement !== cards[0]; i += 1) await user.tab();
    expect(document.activeElement).toBe(cards[0]);
  }
  function expectVisible(index: number) {
    const card = cards[index].getBoundingClientRect(); const bounds = rail.getBoundingClientRect();
    expect(document.activeElement).toBe(cards[index]);
    expect(card.left - 4).toBeGreaterThanOrEqual(bounds.left - 0.01);
    expect(card.right + 4).toBeLessThanOrEqual(bounds.right + 0.01);
    expect(rail.scrollTop).toBe(30);
  }
  return { rail, cards, user, scroll, tabToFirst, expectVisible, mouse: () => { keyboard = false; } };
}
beforeEach(() => { vi.clearAllMocks(); navigation.search = 'sort=latest&sportId=futsal'; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('#1569 실제 개인매치 레일 focus 가시 영역', () => {
  it.each(['feature', 'nearby'] as const)('%s 모바일 Tab/Shift+Tab에서 중간 카드와 링을 양방향으로 드러낸다', async (kind) => {
    const x = setup(kind); await x.tabToFirst(); x.expectVisible(0);
    await x.user.tab(); x.expectVisible(1);
    await x.user.tab(); x.expectVisible(2);
    await x.user.tab({ shift: true }); x.expectVisible(1);
    await x.user.tab({ shift: true }); x.expectVisible(0);
    expect(x.cards).toHaveLength(3);
    expect(x.scroll).toHaveBeenCalled();
    expect(x.scroll.mock.calls.every(([options]) => options.behavior === 'instant' && options.top === undefined)).toBe(true);
  });

  it.each(['feature', 'nearby'] as const)('%s 역방향 시작 scroll487.2에서도 중간 카드의 왼쪽을 드러낸다', async (kind) => {
    const x = setup(kind); await x.tabToFirst(); await x.user.tab(); await x.user.tab();
    x.rail.scrollLeft = 487.2; x.scroll.mockClear();
    await x.user.tab({ shift: true }); x.expectVisible(1);
    expect(x.rail.scrollLeft).toBeLessThan(487.2);
  });

  it.each(['feature', 'nearby'] as const)('%s 태블릿의 중간 카드 끝 가장자리도 링까지 드러낸다', async (kind) => {
    const x = setup(kind, 568); await x.tabToFirst(); await x.user.tab(); x.expectVisible(1);
    expect(x.rail.scrollLeft).toBeGreaterThan(0);
  });

  it.each(['feature', 'nearby'] as const)('%s 데스크톱의 이미 보이는320px 카드에서는 이동하지 않는다', async (kind) => {
    const x = setup(kind, 1050, 320); await x.tabToFirst(); await x.user.tab(); await x.user.tab();
    x.expectVisible(2); expect(x.scroll).not.toHaveBeenCalled();
  });

  it.each(['feature', 'nearby'] as const)('%s mouse 포커스는 레일을 움직이지 않고 링크를 활성화한다', async (kind) => {
    const x = setup(kind); x.mouse(); await x.user.click(x.cards[1]);
    expect(x.scroll).not.toHaveBeenCalled(); expect(navigation.push).toHaveBeenCalledWith(x.cards[1].getAttribute('href'));
  });

  it.each([0, 1, 2])('키보드 Enter 카드%i의 기존 목적지와 from/필터를 유지한다', async (index) => {
    const x = setup(); await x.tabToFirst(); for (let i = 0; i < index; i += 1) await x.user.tab();
    await x.user.keyboard('{Enter}');
    const expected = `/matches/focus-${index}?from=${encodeURIComponent('/matches?sort=latest&sportId=futsal')}`;
    expect(x.cards[index]).toHaveAttribute('href', expected); expect(navigation.push).toHaveBeenCalledWith(expected);
  });

  it('카드가 레일보다 크면 불가능한 전체 표시를 위해 스크롤을 반복하지 않는다', async () => {
    const x = setup('feature', 250, 276); await x.tabToFirst(); await x.user.tab();
    expect(document.activeElement).toBe(x.cards[1]); expect(x.scroll).not.toHaveBeenCalled();
  });

  it.each([false, true])('reduced motion=%s에도 수평 보정을 애니메이션 없이 즉시 수행한다', async (reduce) => {
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({ matches: reduce, media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: () => false }));
    const x = setup(); await x.tabToFirst(); await x.user.tab(); x.expectVisible(1);
    expect(x.scroll).toHaveBeenLastCalledWith(expect.objectContaining({ behavior: 'instant' }));
  });
});
