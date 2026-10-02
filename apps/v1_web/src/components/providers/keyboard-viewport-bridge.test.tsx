import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KeyboardViewportBridge } from './keyboard-viewport-bridge';

type ViewportListener = EventListenerOrEventListenerObject;

describe('KeyboardViewportBridge', () => {
  const listeners = new Map<string, Set<ViewportListener>>();
  const viewport = {
    height: 800,
    offsetTop: 0,
    addEventListener: vi.fn((name: string, listener: ViewportListener) => {
      const registered = listeners.get(name) ?? new Set<ViewportListener>();
      registered.add(listener);
      listeners.set(name, registered);
    }),
    removeEventListener: vi.fn((name: string, listener: ViewportListener) => {
      listeners.get(name)?.delete(listener);
    }),
  };

  const dispatchViewport = (name: string) => {
    for (const listener of listeners.get(name) ?? []) {
      if (typeof listener === 'function') listener(new Event(name));
      else listener.handleEvent(new Event(name));
    }
  };

  beforeEach(() => {
    listeners.clear();
    viewport.height = 800;
    viewport.offsetTop = 0;
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
  });

  afterEach(() => {
    document.documentElement.classList.remove('tm-keyboard-open');
    document.documentElement.style.removeProperty('--teameet-visual-viewport-height');
    document.documentElement.style.removeProperty('--teameet-keyboard-inset');
    vi.restoreAllMocks();
  });

  it('keeps the ordinary viewport unchanged when no text field is focused', () => {
    const { unmount } = render(<KeyboardViewportBridge />);

    expect(document.documentElement).not.toHaveClass('tm-keyboard-open');
    expect(document.documentElement.style.getPropertyValue('--teameet-visual-viewport-height')).toBe('800px');
    expect(document.documentElement.style.getPropertyValue('--teameet-keyboard-inset')).toBe('0px');

    unmount();
    expect(document.documentElement.style.getPropertyValue('--teameet-visual-viewport-height')).toBe('');
  });

  it('marks the keyboard state and scrolls an obscured focused field into view', async () => {
    const scrollIntoView = vi.fn();
    const { getByLabelText } = render(
      <>
        <label htmlFor="email">Email</label>
        <input id="email" />
        <KeyboardViewportBridge />
      </>,
    );
    const input = getByLabelText('Email');
    input.scrollIntoView = scrollIntoView;
    vi.spyOn(input, 'getBoundingClientRect').mockReturnValue({
      top: 640, bottom: 680, left: 0, right: 200, width: 200, height: 40, x: 0, y: 640,
      toJSON: () => ({}),
    });

    act(() => input.focus());
    viewport.height = 420;
    act(() => dispatchViewport('resize'));

    await waitFor(() => expect(document.documentElement).toHaveClass('tm-keyboard-open'));
    expect(document.documentElement.style.getPropertyValue('--teameet-visual-viewport-height')).toBe('420px');
    expect(document.documentElement.style.getPropertyValue('--teameet-keyboard-inset')).toBe('380px');
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center', inline: 'nearest', behavior: 'auto' });
  });

  it('clears the keyboard state after the visual viewport is restored', () => {
    const { getByLabelText } = render(
      <>
        <label htmlFor="message">Message</label>
        <textarea id="message" />
        <KeyboardViewportBridge />
      </>,
    );
    const field = getByLabelText('Message');

    act(() => field.focus());
    viewport.height = 420;
    act(() => dispatchViewport('resize'));
    expect(document.documentElement).toHaveClass('tm-keyboard-open');

    viewport.height = 800;
    act(() => dispatchViewport('resize'));
    expect(document.documentElement).not.toHaveClass('tm-keyboard-open');
    expect(document.documentElement.style.getPropertyValue('--teameet-keyboard-inset')).toBe('0px');
  });
});
