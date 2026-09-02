import { render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { NativeAppSurface } from './native-app-surface';

type W = Window & { TeameetNative?: unknown; webkit?: unknown };
const win = window as W;

afterEach(() => {
  delete win.TeameetNative;
  delete win.webkit;
  delete document.documentElement.dataset.teameetNativeApp;
});

describe('NativeAppSurface — 어느 셸 안인지 <html> 에 알린다', () => {
  it('iOS 브릿지(window.webkit.messageHandlers.TeameetNative)가 있으면 ios', () => {
    // 이걸 못 잡던 동안 iOS 에서 엣지 스와이프 뒤 웹 pop 전환이 한 번 더 겹쳤다.
    win.webkit = { messageHandlers: { TeameetNative: { postMessage() {} } } };
    render(<NativeAppSurface />);

    expect(document.documentElement.dataset.teameetNativeApp).toBe('ios');
  });

  it('Android 브릿지(window.TeameetNative)가 있으면 android', () => {
    win.TeameetNative = { postMessage() {} };
    render(<NativeAppSurface />);

    expect(document.documentElement.dataset.teameetNativeApp).toBe('android');
  });

  it('둘 다 없으면(일반 브라우저) 속성을 달지 않는다', () => {
    render(<NativeAppSurface />);

    expect(document.documentElement.dataset.teameetNativeApp).toBeUndefined();
  });
});
