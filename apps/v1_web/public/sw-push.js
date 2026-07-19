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
        // 열려 있는 창 중 실제로 포커스된(visible) 탭이 있으면 소켓 실시간 갱신과
        // OS 네이티브 푸시 알림이 중복으로 뜨는 것을 막기 위해 알림 표시를 생략한다.
        const hasFocusedClient = clientList.some((client) => client.visibilityState === 'visible');
        if (hasFocusedClient) return;
        return self.registration.showNotification(title, options);
      }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url;
  const target = typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') ? url : '/';
  event.waitUntil(self.clients.openWindow(target));
});
