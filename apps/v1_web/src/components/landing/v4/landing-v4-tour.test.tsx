import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setMotionPaused } from '../landing-motion-store';
import { LandingV4Tour } from './landing-v4-tour';
import { TOUR_PIN_QUERY } from './landing-v4-tour-pin';

/* jsdom 에 없는 브라우저 API(IntersectionObserver·matchMedia·레이아웃)만 대신한다. */
let ioCallbacks: IntersectionObserverCallback[] = [];

class FakeIntersectionObserver {
  constructor(callback: IntersectionObserverCallback) {
    ioCallbacks.push(callback);
  }
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

const originalMatchMedia = window.matchMedia;

function setMedia({ wide, reduce }: { wide: boolean; reduce: boolean }) {
  window.matchMedia = ((query: string) => ({
    matches: (wide && query === TOUR_PIN_QUERY) || (reduce && query.includes('prefers-reduced-motion: reduce')),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

function reportVisibility(isIntersecting: boolean) {
  act(() => {
    for (const callback of ioCallbacks) {
      callback([{ isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver);
    }
  });
}

const ROW_HEIGHT = 800;

/** 행 i 의 중심이 scrollY=0 일 때 i*ROW_HEIGHT 만큼 뷰포트 가운데 아래에 있게 배치한다. */
function layoutRows(container: HTMLElement, scrollY: number) {
  const mid = window.innerHeight / 2;
  container.querySelectorAll<HTMLElement>('[data-v4-tour-row]').forEach((row, i) => {
    const top = mid + i * ROW_HEIGHT - scrollY - ROW_HEIGHT / 2;
    row.getBoundingClientRect = () => ({ top, height: ROW_HEIGHT, bottom: top + ROW_HEIGHT }) as DOMRect;
  });
}

function scrollTo(container: HTMLElement, scrollY: number) {
  layoutRows(container, scrollY);
  act(() => {
    window.dispatchEvent(new Event('scroll'));
    vi.advanceTimersByTime(20);
  });
}

function pinScreens(container: HTMLElement) {
  return [...container.querySelectorAll<HTMLElement>('[data-v4-tour-pin] [data-screen]')];
}

const ty = (el: HTMLElement) => el.style.getPropertyValue('--tm-landing-v4-ty');
const op = (el: HTMLElement) => el.style.getPropertyValue('--tm-landing-v4-op');

function onTab(container: HTMLElement) {
  return container.querySelector<HTMLElement>('[data-v4-tour-pin] [data-tab][data-on="true"]')?.dataset.tab;
}

beforeEach(() => {
  ioCallbacks = [];
  vi.useFakeTimers();
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => window.setTimeout(() => cb(0), 16));
  vi.stubGlobal('cancelAnimationFrame', (id: number) => window.clearTimeout(id));
  setMedia({ wide: true, reduce: false });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.matchMedia = originalMatchMedia;
  setMotionPaused(false);
});

describe('LandingV4Tour 마크업', () => {
  it('투어 폰은 보기 전용이다 — 버튼·포커스 정지점이 없다', () => {
    const { container } = render(<LandingV4Tour />);
    const tour = container.querySelector('#tour')!;
    expect(tour.querySelectorAll('button')).toHaveLength(0);
    expect(tour.querySelectorAll('[tabindex], a, input, [role="tab"]')).toHaveLength(0);
  });

  it('단계 인디케이터(점·진행선·현재 단계 표시)를 두지 않는다', () => {
    const { container } = render(<LandingV4Tour />);
    const tour = container.querySelector('#tour')!;
    expect(tour.querySelectorAll('[data-tour-dot], .tm-landing-tour-dots, .tm-landing-progress, [role="progressbar"], [aria-current]')).toHaveLength(0);
  });

  it('행 5개와 고정 폰 화면 5장이 같은 순서다(훅이 행 i 를 화면 i 로 옮긴다)', () => {
    const { container } = render(<LandingV4Tour />);
    expect(container.querySelectorAll('[data-v4-tour-row]')).toHaveLength(5);
    expect(pinScreens(container).map((s) => s.dataset.screen)).toEqual(['match', 'team', 'bracket', 'live', 'card']);
  });
});

function renderVisibleTour() {
  const view = render(<LandingV4Tour />);
  layoutRows(view.container, 0);
  reportVisibility(true);
  act(() => {
    vi.advanceTimersByTime(20);
  });
  return view;
}

describe('LandingV4Tour 고정 폰(1024+·높이 700+)', () => {
  it('읽는 구간에선 화면이 멈추고, 행 사이에서만 다음 화면이 시트처럼 올라온다', () => {
    const { container } = renderVisibleTour();
    const frame = container.querySelector<HTMLElement>('.tm-landing-v4-tour')!;
    const [match, team] = pinScreens(container);
    expect(frame.dataset.pin).toBe('on');
    expect(ty(match)).toBe('0.000%');
    expect(ty(team)).toBe('100.000%');
    expect(onTab(container)).toBe('match');

    scrollTo(container, 160);
    expect(ty(team)).toBe('100.000%');

    scrollTo(container, 400);
    expect(ty(team)).toBe('50.000%');
    expect(op(team)).toBe('1.0000');
    expect(op(match)).toBe('0.7000');
    expect(onTab(container)).toBe('team');
  });

  it('스크롤이 반쯤 넘어간 채 멈추면 가장 가까운 화면으로 맞춘다', () => {
    const { container } = renderVisibleTour();
    const [match, team] = pinScreens(container);
    scrollTo(container, 360);
    expect(ty(team)).toBe('68.359%');
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(ty(team)).toBe('100.000%');
    expect(ty(match)).toBe('0.000%');
    expect(op(match)).toBe('1.0000');
  });

  it('설명 행에는 아무 상태도 쓰지 않는다(단계 강조 없음)', () => {
    const { container } = renderVisibleTour();
    const rows = [...container.querySelectorAll<HTMLElement>('[data-v4-tour-row]')];
    const before = rows.map((row) => row.outerHTML);
    scrollTo(container, 400);
    scrollTo(container, 1200);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(rows.map((row) => row.outerHTML)).toEqual(before);
  });

  it('투어가 화면 밖이면 스크롤을 따라가지 않는다', () => {
    const { container } = renderVisibleTour();
    const team = pinScreens(container)[1];
    reportVisibility(false);
    scrollTo(container, 400);
    expect(ty(team)).toBe('100.000%');
    reportVisibility(true);
    act(() => {
      vi.advanceTimersByTime(20);
    });
    expect(ty(team)).toBe('50.000%');
  });

  it('움직임 멈추기면 중간 프레임 없이 행 경계에서 한 번에 바뀐다', () => {
    const { container } = renderVisibleTour();
    const frame = container.querySelector<HTMLElement>('.tm-landing-v4-tour')!;
    const team = pinScreens(container)[1];
    act(() => setMotionPaused(true));
    expect(frame.dataset.still).toBe('true');
    scrollTo(container, 360);
    expect(ty(team)).toBe('100.000%');
    scrollTo(container, 440);
    expect(ty(team)).toBe('0.000%');
  });

  it('모션 감소면 고정하지 않고 행 레이아웃 그대로 둔다', () => {
    setMedia({ wide: true, reduce: true });
    const { container } = renderVisibleTour();
    scrollTo(container, 400);
    expect(container.querySelector<HTMLElement>('.tm-landing-v4-tour')!.dataset.pin).toBeUndefined();
    expect(ty(pinScreens(container)[1])).toBe('');
  });

  it('1024 미만이거나 창 높이 700 미만이면 고정하지 않는다', () => {
    setMedia({ wide: false, reduce: false });
    const { container } = renderVisibleTour();
    expect(container.querySelector<HTMLElement>('.tm-landing-v4-tour')!.dataset.pin).toBeUndefined();
  });
});

const CSS = readFileSync(resolve(process.cwd(), 'src/app/desktop/landing-v4.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** 선언마다 감싸고 있는 @media 조건 목록을 돌려준다. */
function declarationsWithMedia(css: string, property: RegExp): Array<{ decl: string; media: string[] }> {
  const found: Array<{ decl: string; media: string[] }> = [];
  const stack: Array<string | null> = [];
  let buffer = '';
  for (const ch of css) {
    if (ch === '{') {
      const prelude = buffer.trim();
      stack.push(prelude.startsWith('@media') ? prelude : null);
      buffer = '';
    } else if (ch === '}' || ch === ';') {
      const decl = buffer.trim();
      if (property.test(decl)) found.push({ decl, media: stack.filter((m): m is string => m !== null) });
      if (ch === '}') stack.pop();
      buffer = '';
    } else {
      buffer += ch;
    }
  }
  return found;
}

describe('landing-v4.css 투어 게이트', () => {
  it('sticky 는 1024+·높이 700+ 미디어(훅의 TOUR_PIN_QUERY) 안에서만 쓴다', () => {
    const stickies = declarationsWithMedia(CSS, /^position\s*:\s*sticky/);
    expect(stickies.length).toBeGreaterThan(0);
    for (const { media } of stickies) {
      expect(media).toContain(`@media ${TOUR_PIN_QUERY}`);
    }
  });

  it('폰 안에 스크롤러를 두지 않는다 — 390 에서 페이지 스크롤을 삼키지 않게', () => {
    expect(declarationsWithMedia(CSS, /^overflow(-x|-y)?\s*:.*\b(auto|scroll)\b/)).toEqual([]);
  });
});
