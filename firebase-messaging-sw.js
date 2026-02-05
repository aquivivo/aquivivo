/* Firebase Messaging service worker */
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

messaging.onBackgroundMessage((payload) => {
  const title = payload?.notification?.title || 'Nuevo mensaje';
  const options = {
    body: payload?.notification?.body || 'Tienes un nuevo mensaje.',
  };
  self.registration.showNotification(title, options);
});
