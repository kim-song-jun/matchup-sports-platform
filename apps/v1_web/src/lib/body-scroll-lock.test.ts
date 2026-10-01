import { afterEach, describe, expect, it } from 'vitest';
import { lockBodyScroll } from './body-scroll-lock';

describe('lockBodyScroll', () => {
  afterEach(() => {
    document.body.style.overflow = '';
  });

  it('같은 해제를 두 번 불러도 다른 오버레이의 잠금은 그대로다', () => {
    const releaseA = lockBodyScroll();
    const releaseB = lockBodyScroll();

    releaseA();
    releaseA();
    expect(document.body.style.overflow).toBe('hidden');

    releaseB();
    expect(document.body.style.overflow).toBe('');
  });
});
