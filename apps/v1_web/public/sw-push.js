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
  event.waitUntil(self.clients.openWindow(target));
});
