import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { NativeAppSurface } from './native-app-surface';

type NativeWindow = Window & {
  TeameetNative?: { postMessage(message: string): void };
};

afterEach(() => {
  cleanup();
  delete (window as NativeWindow).TeameetNative;
  delete document.documentElement.dataset.teameetNativeApp;
});

describe('NativeAppSurface', () => {
  it('marks the document only when the Android bridge is available', async () => {
    (window as NativeWindow).TeameetNative = { postMessage: () => undefined };

    render(<NativeAppSurface />);

    await waitFor(() => {
      expect(document.documentElement.dataset.teameetNativeApp).toBe('android');
    });
  });

  it('keeps the browser surface unchanged without the Android bridge', () => {
    render(<NativeAppSurface />);

    expect(document.documentElement.dataset.teameetNativeApp).toBeUndefined();
  });
});
