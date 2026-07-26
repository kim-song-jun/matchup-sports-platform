import { useCallback, useEffect, useState } from 'react';
import { v1Delete, v1Get, v1Post } from '@/lib/api-client';
import { extractErrorMessage } from '@/lib/error-message';
import { reportClientError } from '@/lib/client-error-reporter';
import { trackEvent } from '@/lib/analytics';

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

export interface V1PushRegistration {
  subscribe: () => Promise<boolean>;
  unsubscribe: () => Promise<void>;
  permission: NotificationPermission | 'unsupported';
  isSubscribed: boolean;
  /**
   * 구독/해지가 진행 중인지. 권한 팝업 → 서비스워커 활성화 → 푸시 서비스 등록 →
   * 서버 저장까지 수 초가 걸리는데, 그동안 토글이 꿈쩍도 하지 않으면 사용자는
   * 눌리지 않은 줄 알고 다시 누르거나 떠난다. 화면이 "처리 중"을 표시할 수 있게
   * 노출한다.
   */
  isPending: boolean;
}

export function useV1PushRegistration(): V1PushRegistration {
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const supported = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;
  // 권한은 state로 들고 requestPermission 결과로 갱신한다. 렌더 중 Notification.permission을
  // 직접 읽으면 사용자가 권한 팝업에서 '차단'을 눌러도 리렌더가 없어 UI가 계속 '허용 가능'으로
  // 남는다(구독 실패 → 상태 변화 없음 → 리렌더 없음).
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('unsupported');

  useEffect(() => {
    setPermission(supported ? Notification.permission : 'unsupported');
  }, [supported]);

  useEffect(() => {
    if (!supported) return;
    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => setIsSubscribed(subscription !== null))
      .catch((err) => {
        reportClientError({
          message: extractErrorMessage(err, '푸시 구독 상태를 확인하지 못했어요.'),
          level: 'warn',
          context: { flow: 'push-subscription-check' },
        });
      });
  }, [supported]);

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!supported || Notification.permission === 'denied') return false;

    setIsPending(true);
    try {
      const permissionResult = await Notification.requestPermission();
      setPermission(permissionResult);
      if (permissionResult !== 'granted') return false;

      const { publicKey } = await v1Get<{ publicKey: string | null }>('/notifications/vapid-public-key');
      if (!publicKey) return false;

      // register() only resolves once the registration exists — on a brand-new
      // registration the worker is still installing, and pushManager.subscribe()
      // throws "no active Service Worker" if called before it activates. Wait for
      // navigator.serviceWorker.ready (resolves once *this page* has an active
      // controller), matching the pattern already used in unsubscribe() below.
      await navigator.serviceWorker.register('/sw-push.js');
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      const json = subscription.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };

      await v1Post('/notifications/push-subscribe', { endpoint: json.endpoint, keys: json.keys });
      trackEvent('push_subscribe_complete', {});
      setIsSubscribed(true);
      return true;
    } catch (err) {
      reportClientError({
        message: extractErrorMessage(err, '푸시 알림 구독에 실패했어요.'),
        level: 'warn',
        context: { flow: 'push-subscribe' },
      });
      return false;
    } finally {
      setIsPending(false);
    }
  }, [supported]);

  const unsubscribe = useCallback(async () => {
    if (!supported) return;

    setIsPending(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        setIsSubscribed(false);
        return;
      }

      try {
        await v1Delete('/notifications/push-unsubscribe', { endpoint: subscription.endpoint });
      } catch (err) {
        // 서버 요청은 best-effort — 실패해도 브라우저 쪽 구독 해지는 항상 진행한다.
        reportClientError({
          message: extractErrorMessage(err, '푸시 구독 해지 요청이 서버에 전달되지 않았어요.'),
          level: 'warn',
          context: { flow: 'push-unsubscribe-server' },
        });
      }

      await subscription.unsubscribe();
      setIsSubscribed(false);
    } catch (err) {
      reportClientError({
        message: extractErrorMessage(err, '푸시 알림 구독 해지에 실패했어요.'),
        level: 'warn',
        context: { flow: 'push-unsubscribe' },
      });
    } finally {
      setIsPending(false);
    }
  }, [supported]);

  return { subscribe, unsubscribe, permission, isSubscribed, isPending };
}
