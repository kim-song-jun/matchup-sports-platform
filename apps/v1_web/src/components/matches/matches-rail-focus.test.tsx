import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MatchListPageView } from './matches-page';
import { getMatchListViewModel } from './matches.view-model';
import { AppShellFrame } from '@/components/v1-ui/app-shell-frame';

const navigation = vi.hoisted(() => ({ push: vi.fn(), search: 'sort=latest&sportId=futsal' }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/matches', useSearchParams: () => new URLSearchParams(navigation.search),
  useRouter: () => ({ push: navigation.push, replace: vi.fn() }),
}));
vi.mock('next/link', () => ({ default: ({ href, onClick, prefetch: _prefetch, ...props }: ComponentProps<'a'> & { href: string; prefetch?: boolean }) => (
  <a {...props} href={href} onClick={(event) => { onClick?.(event); if (!event.defaultPrevented) { event.preventDefault(); navigation.push(href); } }} />
) }));
vi.mock('@/hooks/use-v1-api', () => ({ useV1NotificationUnreadSummary: () => ({ data: { unreadCount: 0 } }) }));

const css = readFileSync(resolve(process.cwd(), 'src/app/globals.css'), 'utf8');
const railRule = css.match(/\.tm-match-rail-h\s*\{([^}]*)\}/)?.[1] ?? '';
// CSS source의 선언을 synthetic scroll range에 반영한다. 이 계산은 jsdom의 CSS
// resolution/native snap을 실행한 것이 아니며 manual alpha 끝 스크롤을 대신하지 않는다.
const fabClearPad = ['--v1-shell-fab-size', '--v1-shell-fab-gap'].reduce((sum, token) => sum + Number(css.match(new RegExp(`${token}:\\s*(\\d+)px`))?.[1] ?? 0), 12);
const trailingPad = /padding-inline-end:\s*var\(--v1-shell-fab-clear-pad\)/.test(railRule) ? fabClearPad : 4;
type FabGeometry = { top?: number; left?: number; hidden?: boolean; scrollHeight?: number; scrollTop?: number };

// 실제 view/카드를 실행한다. jsdom에 없는 layout·native scroll clamp·focus-visible
// modality만 통제한다. 이 계약 테스트를 실제 CSS snap/alpha viewport 증거로 해석하지 않는다.
function setup(kind: 'feature' | 'nearby' = 'feature', width = 372.8, cardWidth = 276, fabGeometry?: FabGeometry) {
  const base = getMatchListViewModel();
  const items = [0, 1, 2].map((index) => ({ ...base.matches[0], id: `focus-${index}`, title: `합성 추천 ${index}`, image: '/mock/generated/team-huddle.webp', costNote: '10000' }));
  const view = <MatchListPageView model={{
    ...base, matches: kind === 'feature' ? items : [{ ...items[0], id: 'main', image: null }],
    nearbyMatches: kind === 'nearby' ? items : [],
    sports: [{ label: '수영', count: 0, active: false, href: '/matches?sportId=swimming' }],
  }} />;
  render(fabGeometry ? <AppShellFrame>{view}</AppShellFrame> : view);
  const rail = document.querySelector<HTMLDivElement>(kind === 'feature' ? '.tm-match-rail-section .tm-match-rail-h' : '.tm-match-nearby-section .tm-match-rail-h')!;
  const cards = Array.from(rail.querySelectorAll<HTMLAnchorElement>('a.tm-match-list-card'));
  let keyboard = true;
  const contentWidth = cardWidth * 3 + 12 * 2 + 4 + (fabGeometry ? trailingPad : 4);
  const rect = (left: number, rectWidth: number) => ({ x: left, y: 100, left, top: 100, right: left + rectWidth, bottom: 380, width: rectWidth, height: 280, toJSON: () => ({}) });
  vi.spyOn(rail, 'getBoundingClientRect').mockImplementation(() => rect(16, width));
  Object.defineProperties(rail, { clientWidth: { configurable: true, value: Math.round(width) }, scrollWidth: { configurable: true, value: contentWidth } });
  rail.scrollTop = 30;
  const scroll = vi.fn(({ left }: ScrollToOptions) => { rail.scrollLeft = Math.max(0, Math.min(contentWidth - width, left ?? 0)); });
  Object.defineProperty(rail, 'scrollTo', { configurable: true, value: scroll });
  const main = document.querySelector<HTMLElement>('.tm-scroll-area');
  const pageStart = fabGeometry?.scrollTop ?? 100;
  const pageScroll = vi.fn(({ top }: ScrollToOptions) => {
    if (main) main.scrollTop = Math.max(0, Math.min(main.scrollHeight - main.clientHeight, top ?? main.scrollTop));
  });
  if (fabGeometry && main) {
    Object.defineProperties(main, { clientHeight: { configurable: true, value: 532 }, scrollHeight: { configurable: true, value: fabGeometry.scrollHeight ?? 1100 } });
    main.scrollTop = pageStart;
    Object.defineProperty(main, 'scrollTo', { configurable: true, value: pageScroll });
  }
  const fab = fabGeometry ? document.querySelector<HTMLAnchorElement>('.tm-floating-fab') : null;
  if (fab) {
    expect(fab).toHaveAttribute('href', '/matches/new/sport');
    vi.spyOn(fab, 'getBoundingClientRect').mockImplementation(() => ({ ...rect(fabGeometry?.left ?? 325.6, fabGeometry?.hidden ? 0 : 56), y: 458, top: 458, bottom: fabGeometry?.hidden ? 458 : 514, height: fabGeometry?.hidden ? 0 : 56 }));
  }
  cards.forEach((card, index) => {
    vi.spyOn(card, 'getBoundingClientRect').mockImplementation(() => {
      const top = (fabGeometry?.top ?? 100) - (fabGeometry && main ? main.scrollTop - pageStart : 0);
      return { ...rect(20 + index * (cardWidth + 12) - rail.scrollLeft, cardWidth), y: top, top, bottom: top + 280 };
    });
    const matches = card.matches.bind(card);
    vi.spyOn(card, 'matches').mockImplementation((selector) => selector === ':focus-visible' ? keyboard && document.activeElement === card : matches(selector));
  });
  const user = userEvent.setup();
  async function tabToFirst() {
    for (let i = 0; i < 100 && document.activeElement !== cards[0]; i += 1) await user.tab();
    expect(document.activeElement).toBe(cards[0]);
  }
  function expectVisible(index: number) {
    const card = cards[index].getBoundingClientRect(); const bounds = rail.getBoundingClientRect();
    expect(document.activeElement).toBe(cards[index]);
    expect(card.left - 4).toBeGreaterThanOrEqual(bounds.left - 0.01);
    expect(card.right + 4).toBeLessThanOrEqual(bounds.right + 0.01);
    expect(rail.scrollTop).toBe(30);
  }
  function expectFabClear(index: number) {
    const target = cards[index].getBoundingClientRect(); const button = fab!.getBoundingClientRect();
    const crosses = target.left - 4 < button.right && target.right + 4 > button.left && target.top - 4 < button.bottom && target.bottom + 4 > button.top;
    expect(crosses).toBe(false);
  }
  return { rail, cards, user, scroll, tabToFirst, expectVisible, expectFabClear, main, pageScroll, fab, mouse: () => { keyboard = false; } };
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

describe('실제 개인매치 view와 FAB의 가시 영역', () => {
  it.each(['feature', 'nearby'] as const)('%s 모바일 양방향 Tab에서 카드와 링을 FAB 앞에 표시한다', async (kind) => {
    const x = setup(kind, 372.8, 276, { top: 260 }); await x.tabToFirst();
    for (const index of [0, 1, 2]) {
      if (index) await x.user.tab();
      x.expectVisible(index); x.expectFabClear(index);
      expect(x.cards[index]).toHaveTextContent('참가비 설명: 10000');
    }
    await x.user.tab({ shift: true }); x.expectVisible(1); x.expectFabClear(1);
    expect(x.pageScroll).not.toHaveBeenCalled();
    expect(x.scroll.mock.calls.every(([options]) => options.behavior === 'instant' && options.top === undefined)).toBe(true);
  });

  it.each(['feature', 'nearby'] as const)('%s CSS 말미 여백이 manual 최대 스크롤의 끝 카드를 FAB에서 띄운다', (kind) => {
    expect(railRule).toMatch(/padding-inline-end:\s*var\(--v1-shell-fab-clear-pad\)/);
    const x = setup(kind, 372.8, 276, { top: 260 });
    x.rail.scrollTo({ left: x.rail.scrollWidth, behavior: 'instant' });
    x.expectFabClear(2);
    const target = x.cards[2].getBoundingClientRect(); const bounds = x.rail.getBoundingClientRect();
    expect(target.left - 4).toBeGreaterThanOrEqual(bounds.left);
    expect(target.right + 4).toBeLessThanOrEqual(bounds.right);
    expect(x.pageScroll).not.toHaveBeenCalled();
  });

  it.each(['feature', 'nearby'] as const)('%s FAB 제외 폭이 부족하면 실제 main만 bounded instant로 위에 드러낸다', async (kind) => {
    const x = setup(kind, 346, 276, { top: 260, left: 299 }); await x.tabToFirst();
    x.expectVisible(0); x.expectFabClear(0);
    await x.user.tab(); x.expectVisible(1); x.expectFabClear(1);
    expect(x.pageScroll).toHaveBeenCalledTimes(1);
    expect(x.pageScroll).toHaveBeenCalledWith({ top: 186, behavior: 'instant' });
    expect(x.main?.scrollTop).toBe(186); expect(x.rail.scrollTop).toBe(30);
  });

  it.each([{ top: 100 }, { top: 260, hidden: true }])('FAB 세로 교차 없음/숨겨짐(%j)은 기존 수평 보정만 실행한다', async (geometry) => {
    const x = setup('feature', 372.8, 276, geometry); await x.tabToFirst(); await x.user.tab();
    x.expectVisible(1); expect(x.pageScroll).not.toHaveBeenCalled();
    expect(x.cards[1].getBoundingClientRect().right).toBeCloseTo(384.8);
  });

  it('축소 폭에서도 mouse click은 페이지와 레일을 움직이지 않고 기존 목적지로 이동한다', async () => {
    const x = setup('feature', 346, 276, { top: 260, left: 299 }); x.mouse(); await x.user.click(x.cards[2]);
    expect(x.scroll).not.toHaveBeenCalled(); expect(x.pageScroll).not.toHaveBeenCalled();
    expect(navigation.push).toHaveBeenCalledWith(x.cards[2].getAttribute('href'));
  });

  it('보정된 마지막 카드 Enter/from과 기존 만들기 FAB 목적지를 유지한다', async () => {
    const x = setup('feature', 372.8, 276, { top: 260 }); await x.tabToFirst(); await x.user.tab(); await x.user.tab();
    x.expectFabClear(2); await x.user.keyboard('{Enter}');
    expect(navigation.push).toHaveBeenCalledWith(`/matches/focus-2?from=${encodeURIComponent('/matches?sort=latest&sportId=futsal')}`);
    await x.user.click(x.fab!); expect(navigation.push).toHaveBeenLastCalledWith('/matches/new/sport');
  });

  it('부족한 main scroll range는 상한에서 멈추며 전체 표시 성공으로 간주하지 않는다', async () => {
    const x = setup('feature', 346, 276, { top: 260, left: 299, scrollHeight: 600, scrollTop: 20 }); await x.tabToFirst();
    expect(x.pageScroll).toHaveBeenCalledWith({ top: 68, behavior: 'instant' });
    expect(x.main?.scrollTop).toBe(68);
    expect(x.cards[0].getBoundingClientRect().bottom + 4).toBeGreaterThan(458);
  });

  it('desktop은 기존4px 말미와 숨겨진 FAB, 이미 보이는320px 카드를 유지한다', async () => {
    expect(/@media\s*\(min-width:\s*1024px\)\s*\{\s*\.tm-match-rail-h\s*\{\s*padding-inline-end:\s*4px;/.test(css)).toBe(true);
    const x = setup('feature', 1050, 320, { top: 260, hidden: true }); await x.tabToFirst(); await x.user.tab(); await x.user.tab();
    x.expectVisible(2); expect(x.scroll).not.toHaveBeenCalled(); expect(x.pageScroll).not.toHaveBeenCalled();
  });
});
