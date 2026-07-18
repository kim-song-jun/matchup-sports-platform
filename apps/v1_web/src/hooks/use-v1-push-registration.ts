import { useCallback, useEffect, useState } from 'react';
import { v1Delete, v1Get, v1Post } from '@/lib/api-client';

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

export function useV1PushRegistration() {
  const [isSubscribed, setIsSubscribed] = useState(false);
  const supported = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;
  const permission = supported ? Notification.permission : 'unsupported';

  useEffect(() => {
    if (!supported) return;
    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => setIsSubscribed(subscription !== null))
      .catch(() => {});
  }, [supported]);

  const subscribe = useCallback(async () => {
    if (!supported || Notification.permission === 'denied') return;

    const permissionResult = await Notification.requestPermission();
    if (permissionResult !== 'granted') return;

    const registration = await navigator.serviceWorker.register('/sw-push.js');
    const { publicKey } = await v1Get<{ publicKey: string | null }>('/notifications/vapid-public-key');
    if (!publicKey) return;

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
    const json = subscription.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };

    await v1Post('/notifications/push-subscribe', { endpoint: json.endpoint, keys: json.keys });
    setIsSubscribed(true);
  }, [supported]);

  const unsubscribe = useCallback(async () => {
    if (!supported) return;
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;

    await v1Delete('/notifications/push-unsubscribe', { endpoint: subscription.endpoint });
    await subscription.unsubscribe();
    setIsSubscribed(false);
  }, [supported]);

  return { subscribe, unsubscribe, permission, isSubscribed };
}
