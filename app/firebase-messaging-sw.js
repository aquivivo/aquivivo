/* Firebase Messaging service worker (NEU chat push) */
importScripts('https://www.gstatic.com/firebasejs/12.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.8.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyBoa3Yf82CDW6k1FSwdeoQg-gBTjh9kVZM',
  authDomain: 'aquivivo-platform.firebaseapp.com',
  projectId: 'aquivivo-platform',
  storageBucket: 'aquivivo-platform.firebasestorage.app',
  messagingSenderId: '116115622011',
  appId: '1:116115622011:web:33a4a583eba4368071bade',
});

const messaging = firebase.messaging();

function swChatId(payload) {
  return String(payload?.data?.chatId || payload?.data?.convId || '').trim();
}

function swSenderUid(payload) {
  return String(payload?.data?.senderUid || payload?.data?.senderId || '').trim();
}

function swTargetUrl(chatId) {
  const safeChatId = String(chatId || '').trim();
  const hash = safeChatId ? `#chat=${encodeURIComponent(safeChatId)}` : '';
  return `/neu-social-app.html${hash}`;
}

messaging.onBackgroundMessage((payload) => {
  const chatId = swChatId(payload);
  const senderUid = swSenderUid(payload);
  const title = String(payload?.notification?.title || 'Nuevo mensaje').trim();
  const body = String(payload?.notification?.body || 'Tienes un nuevo mensaje.').trim();
  const url = swTargetUrl(chatId);

  const options = {
    body,
    data: {
      chatId,
      senderUid,
      url,
    },
  };
  self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification?.data || {};
  const targetUrl = String(data.url || '/neu-social-app.html').trim();

  event.waitUntil(
    (async () => {
      const absoluteTarget = new URL(targetUrl, self.location.origin).href;
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

      for (const client of windows) {
        if (!client?.url) continue;
        const current = new URL(client.url, self.location.origin);
        if (current.origin !== self.location.origin) continue;
        if (current.pathname.endsWith('/neu-social-app.html')) {
          try {
            await client.navigate(absoluteTarget);
          } catch {
            // noop
          }
          await client.focus();
          return;
        }
      }

      await self.clients.openWindow(absoluteTarget);
    })(),
  );
});
