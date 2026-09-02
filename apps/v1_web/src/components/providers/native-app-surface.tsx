'use client';

import { useEffect } from 'react';

type NativeWindow = Window & {
  TeameetNative?: { postMessage(message: string): void };
};

export function NativeAppSurface() {
  useEffect(() => {
    const bridge = (window as NativeWindow).TeameetNative;
    if (typeof bridge?.postMessage !== 'function') return;

    document.documentElement.dataset.teameetNativeApp = 'android';
    return () => {
      delete document.documentElement.dataset.teameetNativeApp;
    };
  }, []);

  return null;
}
