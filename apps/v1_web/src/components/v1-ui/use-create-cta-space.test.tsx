import { act, cleanup, render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCreateCtaSpace } from './use-create-cta-space';

function Form() {
  const ref = useRef<HTMLDivElement>(null);
  useCreateCtaSpace(ref);
  return <main className="tm-scroll-area"><div ref={ref} className="tm-fixed-cta" style={{ position: 'fixed' }} /></main>;
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('create form fixed action space', () => {
  it('updates the reserved space when the action bar grows after an inset arrives', () => {
    let height = 137;
    let notify: ResizeObserverCallback | undefined;
    const observe = vi.fn();
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(() => height);
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: ResizeObserverCallback) { notify = callback; }
      observe = observe;
      disconnect() {}
    });
    const { container, unmount } = render(<Form />);
    const scroll = container.querySelector<HTMLElement>('.tm-scroll-area')!;
    expect(scroll.style.getPropertyValue('--tm-create-cta-height')).toBe('137px');
    expect(observe).toHaveBeenCalledWith(container.querySelector('.tm-fixed-cta'), { box: 'border-box' });
    height = 195;
    act(() => { notify?.([], {} as ResizeObserver); });
    expect(scroll.style.getPropertyValue('--tm-create-cta-height')).toBe('195px');
    unmount();
    expect(scroll.style.getPropertyValue('--tm-create-cta-height')).toBe('');
  });
});
