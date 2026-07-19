/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";
import { clientsClaim } from "workbox-core";
import { CacheFirst, NetworkFirst } from "workbox-strategies";
import { registerRoute } from "workbox-routing";
import { CacheableResponsePlugin } from "workbox-cacheable-response";
import { ExpirationPlugin } from "workbox-expiration";

declare const self: ServiceWorkerGlobalScope;

self.skipWaiting();
clientsClaim();

// Ao ativar um novo SW, recarrega TODAS as abas abertas.
// Isso garante que o novo código JS (com hash novo) seja servido imediatamente,
// independentemente de qual versão do main.tsx estava rodando antes.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      clients.forEach((client) => {
        void (client as WindowClient).navigate(client.url);
      });
    })
  );
});

// Inject Workbox precache manifest
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Cache Google Fonts
registerRoute(
  /^https:\/\/fonts\.googleapis\.com\/.*/i,
  new CacheFirst({
    cacheName: "google-fonts-cache",
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 }),
    ],
  })
);
registerRoute(
  /^https:\/\/fonts\.gstatic\.com\/.*/i,
  new CacheFirst({
    cacheName: "gstatic-fonts-cache",
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 }),
    ],
  })
);

// Cache /api/branding (NetworkFirst, 1h)
registerRoute(
  /\/api\/branding/i,
  new NetworkFirst({
    cacheName: "api-branding-cache",
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxEntries: 1, maxAgeSeconds: 3600 }),
    ],
  })
);

// ── Push notification handler ────────────────────────────────────────────────
self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload: {
    title?: string;
    body?: string;
    icon?: string;
    badge?: string;
    tag?: string;
    url?: string;
    data?: Record<string, unknown>;
  } = {};

  try {
    payload = event.data.json() as typeof payload;
  } catch {
    payload = { title: "LealCert", body: event.data.text() };
  }

  const title = payload.title ?? "LealCert";
  const options: NotificationOptions = {
    body: payload.body ?? "",
    icon: payload.icon ?? "/icon-192.png",
    badge: payload.badge ?? "/icon-192.png",
    tag: payload.tag ?? "lealcert-notification",
    data: { url: payload.url ?? "/dashboard", ...payload.data },
    requireInteraction: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ── Notification click handler ───────────────────────────────────────────────
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl: string = (event.notification.data as { url?: string })?.url ?? "/dashboard";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      // Focus an existing window if possible
      for (const client of windowClients) {
        if ("focus" in client) {
          void client.focus();
          if ("navigate" in client) {
            void (client as WindowClient).navigate(targetUrl);
          }
          return Promise.resolve();
        }
      }
      // Otherwise open a new window
      void self.clients.openWindow(targetUrl);
      return;
    })
  );
});
