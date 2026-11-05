import { act, cleanup, render, waitFor } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCreateCtaSpace } from './use-create-cta-space';

function Form() {
  const ref = useRef<HTMLDivElement>(null);
  useCreateCtaSpace(ref);
  return <main className="tm-scroll-area"><div ref={ref} className="tm-fixed-cta" style={{ position: 'fixed' }} /></main>;
}

function LoadedForm({ loaded }: { loaded: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useCreateCtaSpace(ref, loaded);
  return <main className="tm-scroll-area">{loaded ? <div ref={ref} className="tm-fixed-cta" style={{ position: 'fixed' }} /> : null}</main>;
}

function KeyboardForm() {
  const ref = useRef<HTMLDivElement>(null);
  useCreateCtaSpace(ref);
  return (
    <main className="tm-scroll-area">
      <style>{`
        .keyboard-action { position: fixed; }
        html[data-teameet-native-keyboard="open"] .keyboard-action,
        html.tm-keyboard-open .keyboard-action { position: static; }
      `}</style>
      <div ref={ref} className="keyboard-action" />
    </main>
  );
}

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute('data-teameet-native-keyboard');
  document.documentElement.classList.remove('tm-keyboard-open');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('create form fixed action space', () => {
  it.each(['native', 'browser'])('restores space after the %s keyboard closes without a bar resize', async (mode) => {
    let height = 89;
    let resize: ResizeObserverCallback | undefined;
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(() => height);
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: ResizeObserverCallback) { resize = callback; }
      observe() {}
      disconnect() {}
    });
    const { container } = render(<KeyboardForm />);
    const scroll = container.querySelector<HTMLElement>('.tm-scroll-area')!;
    expect(scroll.style.getPropertyValue('--tm-create-cta-height')).toBe('89px');
    act(() => {
      if (mode === 'native') document.documentElement.dataset.teameetNativeKeyboard = 'open';
      else document.documentElement.classList.add('tm-keyboard-open');
      height = 113;
      resize?.([], {} as ResizeObserver);
    });
    expect(scroll.style.getPropertyValue('--tm-create-cta-height')).toBe('0px');
    act(() => {
      if (mode === 'native') delete document.documentElement.dataset.teameetNativeKeyboard;
      else document.documentElement.classList.remove('tm-keyboard-open');
    });
    await waitFor(() => expect(scroll.style.getPropertyValue('--tm-create-cta-height')).toBe('113px'));
  });

  it('reserves space when an asynchronously loaded form mounts its action bar', () => {
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(161);
    const { container, rerender } = render(<LoadedForm loaded={false} />);
    const scroll = container.querySelector<HTMLElement>('.tm-scroll-area')!;
    expect(scroll.style.getPropertyValue('--tm-create-cta-height')).toBe('');
    rerender(<LoadedForm loaded />);
    expect(scroll.style.getPropertyValue('--tm-create-cta-height')).toBe('161px');
  });

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
