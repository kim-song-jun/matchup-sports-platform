import { afterEach, describe, expect, it, vi } from 'vitest';
import { focusBelowTopbar, readTopbarHeight } from './focus-below-topbar';

function setup(fieldTop: number) {
  const main = document.createElement('main');
  main.className = 'tm-scroll-area';
  const field = document.createElement('div');
  field.className = 'tm-create-field';
  const input = document.createElement('input');
  field.append(input);
  main.append(field);
  document.body.append(main);
  main.scrollTop = 300;
  const scrollTo = vi.fn();
  Object.defineProperty(main, 'scrollTo', { configurable: true, value: scrollTo });
  vi.spyOn(main, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 390, 800));
  vi.spyOn(field, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, fieldTop, 300, 80));
  const focus = vi.spyOn(input, 'focus');
  return { input, scrollTo, focus };
}

describe('focusBelowTopbar', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.documentElement.style.removeProperty('--v1-shell-topbar-height');
    document.body.replaceChildren();
  });

  it('preventScroll 로 포커스하고 상단바 높이만큼 비워 스크롤한다', () => {
    document.documentElement.style.setProperty('--v1-shell-topbar-height', '56px');
    const { input, scrollTo, focus } = setup(10);
    focusBelowTopbar(input);
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    // 목표 상단 = 56 + 16 = 72 → 10 - 72 = -62 만큼 위로
    expect(scrollTo).toHaveBeenCalledWith({ top: 238, behavior: 'smooth' });
  });

  it('이미 상단바 아래에 보이면 스크롤하지 않는다', () => {
    const { input, scrollTo } = setup(200);
    focusBelowTopbar(input);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('모션 줄이기면 auto 로 스크롤한다', () => {
    const original = window.matchMedia;
    vi.spyOn(window, 'matchMedia').mockImplementation((q) => ({ ...original?.(q), matches: true }) as MediaQueryList);
    const { input, scrollTo } = setup(10);
    focusBelowTopbar(input);
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'auto' }));
  });

  it('토큰이 없으면 56px 로 대체한다', () => {
    expect(readTopbarHeight()).toBe(56);
  });
});
