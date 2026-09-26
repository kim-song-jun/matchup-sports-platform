'use client';

import { useEffect } from 'react';
import { detectNativeShell } from '@/lib/native-bridge';

/**
 * 어느 네이티브 셸 안인지를 `<html data-teameet-native-app>` 로 알린다.
 *
 * iOS 를 구분하는 이유: iOS 셸은 `allowsBackForwardNavigationGestures = true` 라 엣지
 * 스와이프에 **네이티브가 먼저 슬라이드를 그린다.** 그 뒤 popstate 가 오면 웹이 pop 전환을
 * 한 번 더 그려 두 겹이 된다. use-navigation-intent 가 이 값을 보고 iOS 의 popstate 를
 * 'native'(웹 전환 없음)로 분류한다. Android WebView 는 시스템 뒤로가기에 자체 애니메이션이
 * 없어 웹 전환이 그대로 맞다.
 */
export function NativeAppSurface() {
  useEffect(() => {
    const shell = detectNativeShell();
    if (!shell) return;

    document.documentElement.dataset.teameetNativeApp = shell;
    return () => {
      delete document.documentElement.dataset.teameetNativeApp;
    };
  }, []);

  return null;
}
