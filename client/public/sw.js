// Co:Lab Connect Service Worker for Push Notifications
// Version 79 - Fix PWA opening from push notifications on iOS

const CACHE_VERSION = 79;
const CACHE_NAME = `colab-connect-v${CACHE_VERSION}`;

// Install event - immediately take over from old service worker
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker v' + CACHE_VERSION);
  // Force immediate activation, don't wait for old SW to die
  self.skipWaiting();
});

// Activate event - clean up ALL old caches aggressively
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker v' + CACHE_VERSION);
  event.waitUntil(
    Promise.all([
      // Delete ALL caches to force fresh content
      caches.keys().then((cacheNames) => {
        console.log('[SW] Found caches:', cacheNames);
        return Promise.all(
          cacheNames.map((cacheName) => {
            console.log('[SW] Deleting cache:', cacheName);
            return caches.delete(cacheName);
          })
        );
      }),
      // Take control of all clients immediately
      clients.claim()
    ]).then(() => {
      console.log('[SW] All caches cleared, now controlling all clients');
      // Notify all clients to refresh
      return clients.matchAll({ type: 'window' }).then((windowClients) => {
        windowClients.forEach((client) => {
          client.postMessage({ type: 'SW_UPDATED', version: CACHE_VERSION });
        });
      });
    })
  );
});

// Fetch event - ALWAYS go to network, never serve from cache
// This ensures users always get the latest version
self.addEventListener('fetch', (event) => {
  // Only handle navigation requests (HTML pages)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => {
        // If network fails, try to return cached version as fallback
        return caches.match(event.request);
      })
    );
  }
  // For all other requests (JS, CSS, images), let browser handle normally
});

// Push notification event
self.addEventListener('push', (event) => {
  console.log('[SW] Push received:', event);

  let data = {
    title: 'Co:Lab Connect',
    body: 'You have a new notification',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: 'colab-notification',
    data: {}
  };

  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch (e) {
      console.error('[SW] Error parsing push data:', e);
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || '/icon-192.png',
    badge: data.badge || '/icon-192.png',
    tag: data.tag || 'colab-notification',
    renotify: true,
    requireInteraction: data.requireInteraction || false,
    data: data.data || {},
    actions: data.actions || []
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event);
  event.notification.close();

  const data = event.notification.data || {};
  let path = '/';

  // Navigate based on notification data - prefer explicit url if provided
  if (data.url) {
    path = data.url;
  } else if (data.type === 'dm') {
    path = `/chat?dm=${data.senderId}`;
  } else if (data.type === 'connection') {
    path = `/connections?tab=requests`;
  } else if (data.type === 'chat') {
    path = `/chat`;
  } else if (data.type === 'mention') {
    path = `/chat`;
  } else if (data.type === 'profile') {
    path = `/profile/edit`;
  } else if (data.type === 'group_invite') {
    path = `/chat?tab=groups`;
  } else if (data.type === 'group_message') {
    path = `/chat?group=${data.groupId}`;
  }

  // Build full URL to ensure PWA opens instead of browser
  // Use the service worker's scope origin (e.g., https://colabconnect.app)
  const origin = self.location.origin;
  const fullUrl = path.startsWith('http') ? path : origin + path;

  console.log('[SW] Opening URL:', fullUrl);

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      console.log('[SW] Found clients:', clientList.length);

      // First, try to find a PWA window (standalone display mode)
      // These have URLs matching our origin
      for (const client of clientList) {
        const clientUrl = new URL(client.url);
        if (clientUrl.origin === origin) {
          console.log('[SW] Found matching PWA client, focusing and navigating');
          // Post message to navigate first, then focus
          client.postMessage({ type: 'NAVIGATE', url: path });
          return client.focus();
        }
      }

      // No existing PWA window found, open a new one with full URL
      // Using full URL helps iOS recognize this should open in the PWA
      console.log('[SW] No PWA client found, opening new window');
      if (clients.openWindow) {
        return clients.openWindow(fullUrl);
      }
    })
  );
});

// Handle notification close
self.addEventListener('notificationclose', (event) => {
  console.log('[SW] Notification closed:', event);
});

// Listen for messages from the main app
self.addEventListener('message', (event) => {
  console.log('[SW] Message received:', event.data);

  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
