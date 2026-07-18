self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
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
  const url = event.notification.data?.url || '/';
  event.waitUntil(self.clients.openWindow(url));
});
