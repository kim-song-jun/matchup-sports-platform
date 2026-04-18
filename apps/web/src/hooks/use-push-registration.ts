'use client';

import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { api } from '@/lib/api';

type Platform = 'web' | 'ios' | 'android';

function detectPlatform(): Platform {
  if (typeof window === 'undefined') return 'web';
  const cap = window.Capacitor;
  if (!cap) return 'web';
  const platform: string = cap.getPlatform?.() ?? '';
  if (platform === 'ios') return 'ios';
  if (platform === 'android') return 'android';
  return 'web';
}

/**
 * Converts a URL-safe base64 string to a Uint8Array for use as VAPID applicationServerKey.
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/**
 * Clears a Web Push subscription: deletes server record first, then
 * unsubscribes the browser. Server-first ensures no orphaned subscriptions.
 * Exported for testability.
 */
export async function cleanupPushSubscription(subscription: PushSubscription): Promise<void> {
  const endpoint = subscription.endpoint;
  // API delete first — ensures server state cleared even if unsubscribe fails
  try {
    await api.delete('/notifications/push-unsubscribe', { data: { endpoint } });
  } catch (err) {
    console.warn('[push] push-unsubscribe API request failed:', err);
  }
  try {
    await subscription.unsubscribe();
  } catch (err) {
    console.warn('[push] subscription.unsubscribe() failed:', err);
  }
}

/**
 * Registers a Web Push subscription after login and unregisters it on logout.
 * No-op if the browser does not support ServiceWorker + PushManager.
 * Falls back to Capacitor PushNotifications on native platforms.
 */
export function usePushRegistration(): void {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const subscriptionRef = useRef<PushSubscription | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;

    const platform = detectPlatform();

    if (platform !== 'web') {
      // Native Capacitor: use @capacitor/push-notifications (dynamic import avoids type errors in web builds)
      let cancelled = false;

      async function registerCapacitor() {
        try {
          const { PushNotifications } = await import('@capacitor/push-notifications');
          const permResult = await PushNotifications.requestPermissions();
          if (permResult.receive !== 'granted' || cancelled) return;

          await PushNotifications.register();

          PushNotifications.addListener('registration', async (tokenData) => {
            if (cancelled) return;
            await api
              .post('/notifications/push-subscribe', {
                endpoint: tokenData.value,
                keys: {},
              })
              .catch((err) => {
                console.warn('[push] Capacitor push subscribe failed:', err);
              });
          });
        } catch (err) {
          console.warn('[push] Capacitor push registration failed:', err);
        }
      }

      registerCapacitor();
      return () => {
        cancelled = true;
      };
    }

    // Web: use native Web Push API (VAPID)
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

    let cancelled = false;

    async function register() {
      try {
        const swReg = await navigator.serviceWorker.register('/sw-push.js');

        const vapidRes = await api.get<unknown>('/notifications/vapid-public-key');
        const responseData = vapidRes.data as { data?: { key?: string }; key?: string };
        const vapidKey = responseData?.data?.key ?? responseData?.key;
        if (!vapidKey || cancelled) return;

        const permission = await Notification.requestPermission();
        if (permission !== 'granted' || cancelled) return;

        const rawKey = urlBase64ToUint8Array(vapidKey);
        const applicationServerKey = rawKey.buffer.slice(
          rawKey.byteOffset,
          rawKey.byteOffset + rawKey.byteLength,
        ) as ArrayBuffer;
        const subscription = await swReg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });

        if (cancelled) return;
        subscriptionRef.current = subscription;

        const sub = subscription.toJSON();
        await api
          .post('/notifications/push-subscribe', {
            endpoint: sub.endpoint,
            keys: sub.keys,
          })
          .catch((err) => {
            console.warn('[push] push-subscribe request failed:', err);
          });
      } catch (err) {
        console.warn('[push] Web Push registration failed:', err);
      }
    }

    register();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  // Unregister subscription on logout
  useEffect(() => {
    if (isAuthenticated) return;

    const subscription = subscriptionRef.current;
    if (!subscription) return;

    subscriptionRef.current = null;
    void cleanupPushSubscription(subscription);
  }, [isAuthenticated]);
}
