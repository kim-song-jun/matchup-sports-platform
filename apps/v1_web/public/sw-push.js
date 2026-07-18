self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    // 페이로드가 비어있거나 JSON이 아니면 기본값으로 폴백 — 알림 자체는 항상 표시한다.
  }
  const title = data.title || 'Teameet';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body,
      icon: '/brand/icon-192.png',
      badge: '/brand/icon-192.png',
      data: { url: data.url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url;
  const target = typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') ? url : '/';
  event.waitUntil(self.clients.openWindow(target));
});
