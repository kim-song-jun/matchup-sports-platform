/**
 * public/sw-push.js 동작 테스트.
 *
 * 서비스워커는 번들에 포함되지 않고 브라우저가 직접 받아 실행하는 파일이라, 깨져도
 * 타입체크·다른 테스트에 전혀 걸리지 않는다(푸시가 조용히 안 오기 시작할 뿐이다).
 * 그래서 파일을 실제로 읽어 핸들러를 등록시키고 이벤트를 흘려보내 검증한다.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// vitest 는 apps/v1_web 를 root 로 실행한다. import.meta.url 은 이 환경에서
// file: 스킴이 아니라 fileURLToPath 가 던지므로 cwd 기준으로 읽는다.
const SW_SOURCE = readFileSync(resolve(process.cwd(), 'public/sw-push.js'), 'utf8');

type Listener = (event: unknown) => void;

interface SwHarness {
  listeners: Record<string, Listener>;
  fetchMock: ReturnType<typeof vi.fn>;
  subscribeMock: ReturnType<typeof vi.fn>;
  showNotification: ReturnType<typeof vi.fn>;
  openWindow: ReturnType<typeof vi.fn>;
  clientList: Array<Record<string, unknown>>;
}

function loadServiceWorker(options: { clients?: Array<Record<string, unknown>> } = {}): SwHarness {
  const listeners: Record<string, Listener> = {};
  const showNotification = vi.fn().mockResolvedValue(undefined);
  const openWindow = vi.fn().mockResolvedValue(undefined);
  const subscribeMock = vi.fn();
  const clientList = options.clients ?? [];

  const selfStub = {
    addEventListener: (type: string, handler: Listener) => {
      listeners[type] = handler;
    },
    registration: { showNotification, pushManager: { subscribe: subscribeMock } },
    clients: {
      matchAll: vi.fn().mockResolvedValue(clientList),
      openWindow,
    },
  };

  const fetchMock = vi.fn();
  // atob 는 jsdom 전역에 있으므로 그대로 넘긴다.
  new Function('self', 'fetch', 'atob', SW_SOURCE)(selfStub, fetchMock, globalThis.atob);

  return { listeners, fetchMock, subscribeMock, showNotification, openWindow, clientList };
}

/** event.waitUntil 로 넘겨진 promise 를 모아 await 할 수 있게 하는 가짜 이벤트. */
function makeEvent(extra: Record<string, unknown> = {}) {
  const pending: Array<Promise<unknown>> = [];
  return {
    event: { waitUntil: (p: Promise<unknown>) => pending.push(p), ...extra },
    settled: () => Promise.all(pending),
  };
}

describe('sw-push.js — pushsubscriptionchange', () => {
  beforeEach(() => vi.clearAllMocks());

  it('구독이 교체되면 새 구독을 서버에 등록하고 옛 endpoint 를 해지한다', async () => {
    const sw = loadServiceWorker();
    sw.fetchMock.mockImplementation((url: string) => {
      if (url.includes('vapid-public-key')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: { publicKey: 'BQ' } }) });
      }
      return Promise.resolve({ ok: true });
    });
    sw.subscribeMock.mockResolvedValue({
      toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/new', keys: { p256dh: 'p', auth: 'a' } }),
    });

    const { event, settled } = makeEvent({
      oldSubscription: { endpoint: 'https://fcm.googleapis.com/old' },
    });
    sw.listeners.pushsubscriptionchange(event);
    await settled();

    const calls = sw.fetchMock.mock.calls;
    const subscribeCall = calls.find(([url]) => String(url).includes('push-subscribe'));
    expect(subscribeCall).toBeDefined();
    expect(JSON.parse(subscribeCall![1].body)).toEqual({
      endpoint: 'https://fcm.googleapis.com/new',
      keys: { p256dh: 'p', auth: 'a' },
    });
    // 세션 쿠키가 실려야 인증을 통과한다.
    expect(subscribeCall![1].credentials).toBe('include');

    const unsubscribeCall = calls.find(([url]) => String(url).includes('push-unsubscribe'));
    expect(unsubscribeCall).toBeDefined();
    expect(JSON.parse(unsubscribeCall![1].body)).toEqual({ endpoint: 'https://fcm.googleapis.com/old' });
  });

  it('서버에 VAPID 키가 없으면 재구독을 시도하지 않는다', async () => {
    const sw = loadServiceWorker();
    sw.fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({ data: { publicKey: null } }) });

    const { event, settled } = makeEvent();
    sw.listeners.pushsubscriptionchange(event);
    await settled();

    expect(sw.subscribeMock).not.toHaveBeenCalled();
  });

  it('재구독이 실패해도 예외를 밖으로 던지지 않는다', async () => {
    const sw = loadServiceWorker();
    sw.fetchMock.mockRejectedValue(new Error('offline'));

    const { event, settled } = makeEvent();
    sw.listeners.pushsubscriptionchange(event);

    await expect(settled()).resolves.toBeDefined();
  });
});

describe('sw-push.js — notificationclick', () => {
  beforeEach(() => vi.clearAllMocks());

  it('이미 열린 탭이 있으면 새 창을 열지 않고 그 탭을 재사용한다', async () => {
    const navigate = vi.fn().mockResolvedValue(undefined);
    const focus = vi.fn().mockResolvedValue(undefined);
    const sw = loadServiceWorker({ clients: [{ navigate, focus }] });

    const { event, settled } = makeEvent({
      notification: { close: vi.fn(), data: { url: '/my/inquiries/inq-1' } },
    });
    sw.listeners.notificationclick(event);
    await settled();

    expect(navigate).toHaveBeenCalledWith('/my/inquiries/inq-1');
    expect(focus).toHaveBeenCalled();
    expect(sw.openWindow).not.toHaveBeenCalled();
  });

  it('열린 탭이 없으면 새 창을 연다', async () => {
    const sw = loadServiceWorker({ clients: [] });

    const { event, settled } = makeEvent({
      notification: { close: vi.fn(), data: { url: '/notifications' } },
    });
    sw.listeners.notificationclick(event);
    await settled();

    expect(sw.openWindow).toHaveBeenCalledWith('/notifications');
  });

  it('외부 origin 으로 빠지는 url 은 홈으로 떨어뜨린다', async () => {
    const sw = loadServiceWorker({ clients: [] });

    for (const unsafe of ['//evil.com', '/\\evil.com', 'https://evil.com']) {
      vi.clearAllMocks();
      const { event, settled } = makeEvent({
        notification: { close: vi.fn(), data: { url: unsafe } },
      });
      sw.listeners.notificationclick(event);
      await settled();
      expect(sw.openWindow).toHaveBeenCalledWith('/');
    }
  });
});
