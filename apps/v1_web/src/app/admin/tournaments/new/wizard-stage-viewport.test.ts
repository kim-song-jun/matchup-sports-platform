import { afterEach, describe, expect, it, vi } from 'vitest';
import { revealWizardControl } from './wizard-stage-viewport';

describe('revealWizardControl browser geometry boundary', () => {
  const restores: (() => void)[] = [];
  let container: HTMLDivElement;

  function patch(target: object, key: string, value: unknown) {
    const descriptor = Object.getOwnPropertyDescriptor(target, key);
    Object.defineProperty(target, key, { configurable: true, writable: true, value });
    restores.push(() => descriptor ? Object.defineProperty(target, key, descriptor) : Reflect.deleteProperty(target, key));
  }

  function layout(options: {
    internal?: boolean; fieldTop?: number; maxScroll?: number; footerPosition?: string;
    visual?: { offsetTop: number; height: number };
  } = {}) {
    container = document.createElement('div');
    container.style.overflowY = options.internal ? 'auto' : 'visible';
    const header = document.createElement('header');
    header.style.position = 'sticky';
    const main = document.createElement('main');
    const control = document.createElement('input');
    const footer = document.createElement('div');
    footer.style.position = options.footerPosition ?? 'fixed';
    main.append(control, footer);
    container.append(header, main);
    document.body.appendChild(container);
    patch(document, 'scrollingElement', document.documentElement);
    patch(document.documentElement, 'scrollTop', 0);
    patch(window, 'innerHeight', 606);
    patch(window, 'visualViewport', options.visual);
    const scroller = options.internal ? container : document.documentElement;
    patch(scroller, 'clientHeight', 606);
    patch(scroller, 'scrollHeight', 606 + (options.maxScroll ?? 2000));
    patch(scroller, 'scrollTop', 947.2);
    const origin = scroller.scrollTop + (options.fieldTop ?? 539.2625);
    const scrollTo = vi.fn(({ top }: ScrollToOptions) => { scroller.scrollTop = top ?? 0; });
    patch(scroller, 'scrollTo', scrollTo);
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      if (this === control) return new DOMRect(16, origin - scroller.scrollTop, 300, 44);
      if (this === footer) return new DOMRect(0, 536.8, 402, 68.8);
      if (this === header) return new DOMRect(0, 0, 402, 52);
      if (this === container) return new DOMRect(0, 0, 402, 606);
      return new DOMRect();
    });
    control.focus({ preventScroll: true });
    // Browser API boundary only: dynamic rects respond to scroll. This does not measure CSS.
    return { control, footer, scroller, scrollTo };
  }

  afterEach(() => {
    vi.restoreAllMocks();
    while (restores.length) restores.pop()?.();
    container?.remove();
  });

  it('document scroller reveals the focused input plus its ring with an instant minimal move', () => {
    const { control, footer, scroller, scrollTo } = layout();
    revealWizardControl(control, footer);
    expect(control).toHaveFocus();
    expect(control.getBoundingClientRect().bottom).toBeCloseTo(532.8);
    expect(scroller.scrollTop).toBeCloseTo(997.6625);
    expect(scrollTo).toHaveBeenCalledWith({ top: scroller.scrollTop, behavior: 'instant' });
  });

  it('uses the nested scroller without moving the document', () => {
    const { control, footer, scroller } = layout({ internal: true });
    revealWizardControl(control, footer);
    expect(scroller.scrollTop).toBeCloseTo(997.6625);
    expect(document.documentElement.scrollTop).toBe(0);
    expect(control).toHaveFocus();
  });

  it('reveals a ring that is clipped even when the input border itself is visible', () => {
    const { control, footer, scroller } = layout({ fieldTop: 490.8 });
    revealWizardControl(control, footer);
    expect(scroller.scrollTop).toBeCloseTo(949.2);
    expect(control.getBoundingClientRect().bottom).toBeCloseTo(532.8);
  });

  it('keeps a fully visible focused control and scroll position unchanged', () => {
    const { control, footer, scroller, scrollTo } = layout({ fieldTop: 488 });
    revealWizardControl(control, footer);
    expect(scroller.scrollTop).toBe(947.2);
    expect(control).toHaveFocus();
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('reverse focus reveals the upper ring below the actual sticky appbar', () => {
    const { control, footer } = layout({ fieldTop: 40 });
    revealWizardControl(control, footer);
    expect(control.getBoundingClientRect().top).toBeCloseTo(56);
    expect(control).toHaveFocus();
  });

  it('intersects the visual viewport instead of assuming the whole layout viewport', () => {
    const { control, footer } = layout({ visual: { offsetTop: 20, height: 300 } });
    revealWizardControl(control, footer);
    expect(control.getBoundingClientRect().bottom).toBeCloseTo(316);
    expect(control).toHaveFocus();
  });

  it('clamps to the real scroll maximum without claiming full reveal when space is insufficient', () => {
    const { control, footer, scroller } = layout({ maxScroll: 970 });
    revealWizardControl(control, footer);
    expect(scroller.scrollTop).toBe(970);
    expect(control).toHaveFocus();
    expect(control.getBoundingClientRect().bottom).toBeGreaterThan(footer.getBoundingClientRect().top);
  });

  it('does not treat a footer in document flow as a viewport occluder', () => {
    const { control, footer, scrollTo } = layout({ footerPosition: 'static' });
    revealWizardControl(control, footer);
    expect(control).toHaveFocus();
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
