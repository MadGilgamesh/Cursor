/* Obsługa Web Push w service workerze (dołączana przez Workbox `importScripts`). */

self.addEventListener('push', (event) => {
  let payload = { title: 'Zapomniany Brzeg', body: '', url: '/', tag: 'zapomniany-brzeg' };
  try {
    payload = { ...payload, ...event.data.json() };
  } catch {
    // Pusta lub niepoprawna treść — pokazujemy ogólne powiadomienie.
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      data: { url: payload.url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url ?? '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const existing = windows.find((client) => client.url.startsWith(self.location.origin));
      if (existing) {
        existing.navigate(url);
        return existing.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
