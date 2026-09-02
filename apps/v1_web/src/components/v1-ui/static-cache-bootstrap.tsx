'use client';
import { useEffect } from 'react';

/**
 * sw-push.js 를 앱 부트스트랩 시점에 등록한다.
 * register()는 같은 URL+scope 에 대해 멱등이라(이미 등록된 스크립트를 다시 등록하면
 * 새 워커를 만들지 않고 기존 등록을 반환한다) use-v1-push-registration.ts 의 기존
 * register() 호출과 공존해도 안전하다 — 그 파일은 손대지 않는다.
 */
export function StaticCacheBootstrap() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw-push.js').catch(() => {
      // 등록 실패는 조용히 넘어간다 — 정적 캐싱은 순수 최적화이고, 실패해도 앱은
      // 평소대로(네트워크 직행) 동작한다.
    });
  }, []);
  return null;
}
