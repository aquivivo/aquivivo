// 🔥 Inicialización de Firebase AquíVivo
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: 'AIzaSyBoa3Yf82CDW6k1FSwdeoQg-gBTjh9kVZM',
  authDomain: 'aquivivo-platform.firebaseapp.com',
  projectId: 'aquivivo-platform',
  storageBucket: 'aquivivo-platform.firebasestorage.app',
  messagingSenderId: '116115622011',
  appId: '1:116115622011:web:33a4a583eba4368071bade',
  measurementId: 'G-V5RQEWRDGR',
};

// Inicialización
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
console.log('✅ Firebase połączone z projektem AquiVivo!');
