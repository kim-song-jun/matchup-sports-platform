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
}

export function useV1PushRegistration(): V1PushRegistration {
  const [isSubscribed, setIsSubscribed] = useState(false);
  const supported = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;
  const permission = supported ? Notification.permission : 'unsupported';

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

    try {
      const permissionResult = await Notification.requestPermission();
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
    }
  }, [supported]);

  const unsubscribe = useCallback(async () => {
    if (!supported) return;

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
    }
  }, [supported]);

  return { subscribe, unsubscribe, permission, isSubscribed };
}
