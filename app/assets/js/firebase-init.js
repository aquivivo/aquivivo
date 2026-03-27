import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/12.8.0/firebase-storage.js';

const firebaseConfig = {
  apiKey: 'AIzaSyBoa3Yf82CDW6k1FSwdeoQg-gBTjh9kVZM',
  authDomain: 'aquivivo-platform.firebaseapp.com',
  projectId: 'aquivivo-platform',
  storageBucket: 'aquivivo-platform.firebasestorage.app',
  messagingSenderId: '116115622011',
  appId: '1:116115622011:web:33a4a583eba4368071bade',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
