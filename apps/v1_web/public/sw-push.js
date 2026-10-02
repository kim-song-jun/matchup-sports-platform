// ── 정적 에셋 캐싱 (Wave 3 추가) ──────────────────────────────────────────
// 이 SW 는 원래 푸시 전용이었다. 캐싱을 별도 SW 파일로 추가하면 같은 origin·
// scope('/')에 두 번째 controller 를 등록하려는 시도가 되어 **나중 등록이 이
// 파일을 통째로 교체**한다 — 한 scope 에는 활성 SW 가 하나뿐인 것이 스펙이다.
// 그래서 캐싱 핸들러를 이 파일 자체에 얹는다(app-persistence-optimization.md §3.1).
const STATIC_CACHE_NAME = 'teameet-static-v1'; // 파일명이 안정적인 에셋(폰트·브랜드
  // 이미지 등)을 교체 배포했는데 URL 로는 무효화가 안 될 때, 이 문자열을 수동으로
  // 올리면(v1→v2) 아래 activate 핸들러가 구 캐시를 지운다.
const STATIC_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7일 — x-teameet-release
  // 헤더가 없는(=아래 message 무효화가 오지 않는) 환경(production)을 위한 backstop.

const PRECACHE_URLS = [
  '/fonts/PretendardVariable.woff2',
  '/brand/icon-192.png',
  '/brand/icon-512.png',
  '/brand/apple-touch-icon.png',
  '/favicon.png',
]; // public/ 전체가 아니라 실제로 자주 쓰이는 것만 명시적으로 고른다 — mock/ 등 개발용
   // 픽스처는 애초에 포함하지 않는다.

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC_CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)));
  // skipWaiting()은 부르지 않는다 — 기존 탭이 갑자기 새 SW 로 전환되면 그 탭의 진행
  // 중이던 fetch 가로채기가 순간 바뀔 수 있다. 새 SW 는 다음 탐색부터 자연스럽게 activate.
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name.startsWith('teameet-static-') && name !== STATIC_CACHE_NAME)
          .map((name) => caches.delete(name)),
      ),
    ),
  );
});

function isStaticAssetRequest(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/fonts/') ||
    url.pathname.startsWith('/brand/') ||
    url.pathname === '/favicon.png'
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return; // 뮤테이션은 절대 가로채지 않는다.
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // 외부 요청(유튜브 썸네일 등) 불간섭.
  if (request.mode === 'navigate') return; // HTML — 배포마다 청크 파일명이 바뀌므로
    // 캐시하면 하드 404 위험(app-persistence-optimization.md §3.2 표 근거).
  if (url.pathname.startsWith('/api/')) return;
  if (!isStaticAssetRequest(url)) return; // /uploads/* 등 나머지는 그대로 network.

  event.respondWith(
    caches.open(STATIC_CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);
      if (cached) {
        const cachedAt = Number(cached.headers.get('x-teameet-cached-at') ?? 0);
        if (Date.now() - cachedAt < STATIC_CACHE_MAX_AGE_MS) return cached;
      }
      try {
        const response = await fetch(request);
        if (response.ok) {
          const stamped = new Response(response.clone().body, {
            status: response.status,
            statusText: response.statusText,
            headers: new Headers(response.headers),
          });
          stamped.headers.set('x-teameet-cached-at', String(Date.now()));
          cache.put(request, stamped);
        }
        return response;
      } catch (err) {
        if (cached) return cached; // 네트워크 실패(오프라인 등) — 낡아도 캐시가 최선.
        throw err;
      }
    }),
  );
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    // 페이로드가 비어있거나 JSON이 아니면 기본값으로 폴백 — 알림 자체는 항상 표시한다.
  }
  const title = data.title || 'Teameet';
  const options = {
    icon: '/brand/icon-192.png',
    badge: '/brand/icon-192.png',
    data: { url: data.url },
  };
  // body가 없는 페이로드(예: 서버가 body: undefined를 보낸 경우)에서 일부
  // WebView 구현이 options.body를 문자열 "undefined"로 강제 변환하는 것을 막는다.
  if (typeof data.body === 'string') options.body = data.body;
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // 열려 있는 창 중 실제로 입력 포커스를 가진 탭이 있으면 소켓 실시간 갱신과
        // OS 네이티브 푸시 알림이 중복으로 뜨는 것을 막기 위해 알림 표시를 생략한다.
        // visibilityState는 탭이 최소화/전환되지 않았는지만 알려줄 뿐 OS 포커스는
        // 반영하지 않으므로(다른 창으로 전환해도 'visible'로 남음), WindowClient의
        // focused 불리언을 사용한다.
        const hasFocusedClient = clientList.some((client) => client.focused === true);
        if (hasFocusedClient) return;
        return self.registration.showNotification(title, options);
      }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url;
  // '/'로 시작하되 '//'(protocol-relative)나 백슬래시를 포함하면 안전하지
  // 않다 — WHATWG URL 파서는 http/https 같은 special scheme에서 백슬래시를
  // 슬래시처럼 취급해 '/\evil.com' 같은 값이 openWindow 시 origin을 바꿔버리는
  // open-redirect 우회를 허용한다. notification-route.ts의
  // isSafeInternalRoute()와 동일한 엄격도(백슬래시는 위치 무관 전면 차단).
  const isSafeInternalRoute =
    typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') && !url.includes('\\');
  const target = isSafeInternalRoute ? url : '/';

  // 이미 열려 있는 탭이 있으면 그 탭을 재사용한다. 항상 openWindow를 부르면
  // 알림을 누를 때마다 새 탭이 쌓여, 알림이 여러 건 오면 같은 앱이 여러 번
  // 열린 채로 남는다.
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        const existing = clientList[0];
        if (existing) {
          // navigate()는 일부 브라우저에서 거부될 수 있어(다른 origin 등) 실패해도
          // 포커스만은 살린다.
          return Promise.resolve(existing.navigate ? existing.navigate(target) : null)
            .catch(() => null)
            .then(() => existing.focus())
            .catch(() => self.clients.openWindow(target));
        }
        return self.clients.openWindow(target);
      }),
  );
});

/**
 * 브라우저가 구독을 교체할 때(만료·키 로테이션 등) 발생한다. 이걸 처리하지 않으면
 * 서버에 남은 옛 endpoint 로만 발송을 시도하게 되어, 잘 되던 푸시가 어느 날부터
 * 조용히 끊긴다(사용자 화면에는 여전히 '알림 켜짐'으로 보인다).
 *
 * 새 구독을 만들어 서버에 등록하고, 옛 구독은 서버에서 지운다. 로그인 세션이
 * 없으면 두 요청 모두 401 로 떨어지는데, 그때는 다음에 사용자가 직접 켤 때
 * 복구되므로 조용히 포기한다.
 */
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const res = await fetch('/api/v1/notifications/vapid-public-key', { credentials: 'include' });
        if (!res.ok) return;
        const payload = await res.json();
        const publicKey = payload?.data?.publicKey;
        if (!publicKey) return;

        const fresh = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
        const json = fresh.toJSON();

        await fetch('/api/v1/notifications/push-subscribe', {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
        });

        // 옛 구독 정리는 실패해도 새 구독 등록을 되돌리지 않는다 — 남아 있어도
        // 서버가 410/404 응답을 받으면 스스로 지운다.
        const oldEndpoint = event.oldSubscription?.endpoint;
        if (oldEndpoint && oldEndpoint !== json.endpoint) {
          await fetch('/api/v1/notifications/push-unsubscribe', {
            method: 'DELETE',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ endpoint: oldEndpoint }),
          }).catch(() => undefined);
        }
      } catch {
        // 재구독 실패는 조용히 넘긴다 — 사용자가 설정에서 다시 켜면 복구된다.
      }
    })(),
  );
});

// ── 배포 시 캐시 무효화 (release-version-watcher.tsx 연계, §3.3) ─────────
self.addEventListener('message', (event) => {
  if (event.data?.type !== 'TEAMEET_RELEASE_CHANGED') return;
  event.waitUntil(caches.delete(STATIC_CACHE_NAME));
});

/** VAPID 공개키(base64url)를 pushManager.subscribe 가 요구하는 Uint8Array 로 바꾼다. */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}
