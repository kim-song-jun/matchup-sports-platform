import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startLandingMotion } from './landing-motion';

/*
 * jsdom 에는 IntersectionObserver 가 없다 — 관찰 대상과 콜백만 기록하는 최소 스텁
 * (불가피한 브라우저 API mock). 판정은 컨트롤러가 실제 DOM 에 남긴 결과로만 한다.
 */
type Observer = { callback: IntersectionObserverCallback; targets: Set<Element> };
let observers: Observer[] = [];

class FakeIntersectionObserver {
  private readonly record: Observer;
  constructor(callback: IntersectionObserverCallback) {
    this.record = { callback, targets: new Set() };
    observers.push(this.record);
  }
  observe(el: Element) { this.record.targets.add(el); }
  unobserve(el: Element) { this.record.targets.delete(el); }
  disconnect() { this.record.targets.clear(); }
}

function fire(target: Element, isIntersecting: boolean) {
  for (const o of observers.filter((ob) => ob.targets.has(target))) {
    o.callback([{ target, isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver);
  }
}

function stubMedia(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('reduce') ? reduce : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

function mount(html: string) {
  const root = document.createElement('div');
  root.innerHTML = html;
  document.body.append(root);
  return root;
}

beforeEach(() => {
  observers = [];
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('startLandingMotion — reveal', () => {
  const html = '<section data-reveal id="near"></section><section data-reveal id="far"></section>';
  const place = (root: HTMLElement) => {
    root.querySelector('#near')!.getBoundingClientRect = () => ({ top: 100 }) as DOMRect;
    root.querySelector('#far')!.getBoundingClientRect = () => ({ top: 5000 }) as DOMRect;
  };

  it('이미 화면 안에 있는 요소는 숨기지 않고, 아래 요소만 들어올 때 드러낸다', () => {
    stubMedia(false);
    const root = mount(html);
    place(root);
    startLandingMotion(root);

    expect(root.dataset.motion).toBe('on');
    expect(root.querySelector('#near')).toHaveClass('is-in');
    const far = root.querySelector('#far')!;
    expect(far).not.toHaveClass('is-in');
    fire(far, true);
    expect(far).toHaveClass('is-in');
  });

  it('모션 감소 설정이면 모션을 켜지 않는다 — 숨김 규칙이 걸리지 않아 전부 보인다', () => {
    stubMedia(true);
    const root = mount(html);
    place(root);
    startLandingMotion(root);
    expect(root.dataset.motion).toBeUndefined();
  });
});

describe('startLandingMotion — 반복 모션 구역', () => {
  it('보이면 data-loop="on", 벗어나면 "off" 로 되돌려 CSS 반복 애니메이션을 멈춘다', () => {
    stubMedia(false);
    const root = mount('<div data-loop="off" id="mq"></div>');
    const mq = root.querySelector<HTMLElement>('#mq')!;
    startLandingMotion(root);

    fire(mq, true);
    expect(mq.dataset.loop).toBe('on');
    fire(mq, false);
    expect(mq.dataset.loop).toBe('off');
  });

  it('정리하면 관찰이 끊겨 다시 보이는 신호가 와도 켜지지 않는다', () => {
    stubMedia(false);
    const root = mount('<div data-loop="off" id="mq"></div>');
    const mq = root.querySelector<HTMLElement>('#mq')!;
    const stop = startLandingMotion(root);

    stop();
    fire(mq, true);
    expect(mq.dataset.loop).toBe('off');
  });
});
